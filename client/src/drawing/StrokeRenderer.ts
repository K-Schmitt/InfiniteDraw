import { Container, Graphics } from 'pixi.js';
import type { BrushStroke, Color, Point } from '@shared/stroke';
import { projectToFrame, CULLED, type ProjCamera } from '../coords/viewProject';
import { anchorScaleOf } from '../coords/viewScale';
import { strokeToRings } from './strokeToPath';
import { fillRings } from './fillRings';
import { pointInRings } from './hitTest';
import { enclosedRegionAt, ringsAdjacent } from './fillRegion';
import { selectFillWalls, sameColor } from './fillWalls';
import { StrokeStore, type StrokeItem } from './StrokeStore';
import { ringsToFrame, ringArea, frameBboxOf, cameraInsideStroke, localBoundsOf } from './projectRings';

const HIDE_THRESHOLD = 0.02;
const MAX_SCREEN_STROKE_WIDTH = 2e34;
// background fills sort below every real stroke so outlines stay visible on top (Bug 1 fix)
const BG_ORDER = 1e9;

type RenderMode = 'baked' | 'bleed';

export type FillTargetResult =
  | { kind: 'fill'; rings: number[][]; background: boolean }
  | { kind: 'recolor'; ids: string[] };

/** A stroke plus its rings already projected into the camera frame (eraser broad phase). */
export interface FrameCandidate {
  stroke: BrushStroke;
  frameRings: number[][];
}

interface Placement {
  gfx: Graphics;
  mode: RenderMode;
}

interface CameraSnapshot {
  level: number;
  cx: bigint;
  cy: bigint;
  sx: number;
  sy: number;
  frameScale: number;
}

function bboxOverlap(a: FrameBounds, b: FrameBounds): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;
}

interface FrameBounds {
  minX: number; minY: number; maxX: number; maxY: number;
}

function fillOptions(stroke: BrushStroke): Parameters<typeof fillRings>[2] {
  return {
    originX: 0,
    originY: 0,
    scale: 1,
    color: (stroke.color.r << 16) | (stroke.color.g << 8) | stroke.color.b,
    alpha: stroke.color.a / 255,
  };
}

/**
 * Renders committed strokes by projecting each anchor into the camera frame (BigInt cull, no
 * float64 world coords) and placing its baked cell-local geometry. Coarse strokes the camera is
 * inside never vanish — they bleed a viewport fill. Hit-test and fill share the exact same
 * projection so a click maps to the stroke it overlaps.
 */
export class StrokeRenderer {
  readonly container: Container;
  private readonly store = new StrokeStore();
  private readonly placements = new Map<string, Placement>();
  private readonly vectorLayer = new Container();
  private last: CameraSnapshot | null = null;
  private screenW = 0;
  private screenH = 0;

  constructor() {
    this.container = new Container();
    this.vectorLayer.sortableChildren = true;
    this.container.addChild(this.vectorLayer);
  }

  addStroke(stroke: BrushStroke): void {
    const rings = strokeToRings(stroke);
    this.store.add(stroke, rings);
    const gfx = new Graphics();
    fillRings(gfx, rings, fillOptions(stroke));
    gfx.zIndex = paintOrder(stroke);
    this.placements.set(stroke.id, { gfx, mode: 'baked' });
    this.vectorLayer.addChild(gfx);
    this.last = null;
  }

  removeStroke(id: string): void {
    this.store.remove(id);
    const p = this.placements.get(id);
    if (p) {
      this.vectorLayer.removeChild(p.gfx);
      p.gfx.destroy();
      this.placements.delete(id);
    }
    this.last = null;
  }

  /** Repaints an existing stroke with a new color in place (keeps its z-order). */
  recolorStroke(id: string, color: Color): void {
    const item = this.store.get(id);
    const p = this.placements.get(id);
    if (!item || !p) return;
    item.stroke.color = color;
    p.mode = 'baked';
    p.gfx.clear();
    fillRings(p.gfx, item.rings, fillOptions(item.stroke));
    this.last = null;
  }

  // ─── Hit-testing (eraser / fill / eyedropper), all in the camera frame ───────

  /** Color of the innermost stroke whose painted area covers the point (eyedropper). */
  pickColorAt(frame: Point, camera: ProjCamera): Color | undefined {
    return this.topmostAt(frame, camera)?.color;
  }

  /** Candidate strokes overlapping a frame box, rings pre-projected (eraser broad phase). */
  strokesInFrame(box: FrameBounds, camera: ProjCamera): FrameCandidate[] {
    const out: FrameCandidate[] = [];
    for (const item of this.store.all()) {
      const frameRings = ringsToFrame(item.stroke.anchor, item.rings, camera);
      if (frameRings && bboxOverlap(frameBboxOf(frameRings), box)) {
        out.push({ stroke: item.stroke, frameRings });
      }
    }
    return out;
  }

  /**
   * Paint-bucket target. On an existing stroke → the connected same-color group to recolor. On
   * empty canvas → a new fill of the enclosed region (bounded by other strokes), in frame coords.
   */
  fillTarget(frame: Point, camera: ProjCamera, color: Color): FillTargetResult | null {
    const target = this.topmostAt(frame, camera);
    if (target) return { kind: 'recolor', ids: this.sameColorGroup(target, camera) };

    const walls = this.wallsInFrame(camera, color);
    const cell = enclosedRegionAt(frame, walls);
    return cell ? { kind: 'fill', rings: cell, background: true } : null;
  }

  // smallest-area stroke (in frame units) containing the point — the visible top one
  private topmostAt(frame: Point, camera: ProjCamera): BrushStroke | undefined {
    let found: BrushStroke | undefined;
    let bestArea = Infinity;
    for (const item of this.store.all()) {
      const frameRings = ringsToFrame(item.stroke.anchor, item.rings, camera);
      if (!frameRings || !pointInRings(frame.x, frame.y, frameRings)) continue;
      const a = ringArea(frameRings[0] ?? []);
      if (a < bestArea) {
        bestArea = a;
        found = item.stroke;
      }
    }
    return found;
  }

  // ids of same-color strokes connected (touching in the camera frame) to `start`
  private sameColorGroup(start: BrushStroke, camera: ProjCamera): string[] {
    const pool = this.sameColorCandidates(start, camera);
    const seen = new Set<string>([start.id]);
    const queue = pool.filter((c) => c.stroke.id === start.id);
    while (queue.length > 0) {
      const cur = queue.pop()!;
      for (const c of pool) {
        if (seen.has(c.stroke.id) || !bboxOverlap(cur.bounds, c.bounds)) continue;
        if (!ringsAdjacent(cur.frameRings, c.frameRings)) continue;
        seen.add(c.stroke.id);
        queue.push(c);
      }
    }
    return [...seen];
  }

  private sameColorCandidates(start: BrushStroke, camera: ProjCamera): GroupCandidate[] {
    const out: GroupCandidate[] = [];
    for (const item of this.store.all()) {
      if (!sameColor(item.stroke.color, start.color)) continue;
      const frameRings = ringsToFrame(item.stroke.anchor, item.rings, camera);
      if (frameRings) out.push({ stroke: item.stroke, frameRings, bounds: frameBboxOf(frameRings) });
    }
    return out;
  }

  private wallsInFrame(camera: ProjCamera, color: Color): number[][][] {
    const candidates = [];
    for (const item of this.store.all()) {
      const frameRings = ringsToFrame(item.stroke.anchor, item.rings, camera);
      if (frameRings) candidates.push({ stroke: item.stroke, rings: frameRings });
    }
    return selectFillWalls(candidates, color);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  redraw(camera: ProjCamera, frameScale: number, screenW: number, screenH: number): void {
    this.screenW = screenW;
    this.screenH = screenH;
    if (this.unchanged(camera, frameScale)) return;
    this.last = snapshot(camera, frameScale);
    for (const item of this.store.all()) this.place(item, camera, frameScale);
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.store.clear();
    this.placements.clear();
  }

  private place(item: StrokeItem, camera: ProjCamera, frameScale: number): void {
    const p = this.placements.get(item.stroke.id);
    if (!p) return;
    const proj = projectToFrame(item.stroke.anchor, 0, 0, camera);
    if (proj === CULLED) return this.placeCulled(item, p, camera);
    const scale = anchorScaleOf(frameScale, camera.level, item.stroke.anchor.level);
    if (!isPlaceable(item.stroke, scale)) { p.gfx.visible = false; return; }
    if (p.mode === 'bleed') this.rebake(item, p);
    p.gfx.visible = true;
    p.gfx.position.set(proj.fx * frameScale, proj.fy * frameScale);
    p.gfx.scale.set(scale);
  }

  // camera outside → hide; camera over a much-coarser stroke's extent → bleed a viewport fill (§4)
  private placeCulled(item: StrokeItem, p: Placement, camera: ProjCamera): void {
    const inside = cameraInsideStroke(localBoundsOf(item.rings), item.stroke.anchor, camera);
    if (!inside) { p.gfx.visible = false; return; }
    p.mode = 'bleed';
    p.gfx.clear();
    p.gfx.position.set(0, 0);
    p.gfx.scale.set(1);
    p.gfx.rect(0, 0, this.screenW, this.screenH).fill(fillOptions(item.stroke));
    p.gfx.visible = true;
  }

  private rebake(item: StrokeItem, p: Placement): void {
    p.mode = 'baked';
    p.gfx.clear();
    fillRings(p.gfx, item.rings, fillOptions(item.stroke));
  }

  private unchanged(camera: ProjCamera, frameScale: number): boolean {
    const l = this.last;
    return !!l && l.level === camera.level && l.cx === camera.cell.x && l.cy === camera.cell.y
      && l.sx === camera.sub.x && l.sy === camera.sub.y && l.frameScale === frameScale;
  }
}

interface GroupCandidate {
  stroke: BrushStroke;
  frameRings: number[][];
  bounds: FrameBounds;
}

function paintOrder(stroke: BrushStroke): number {
  return stroke.background ? stroke.zIndex - BG_ORDER : stroke.zIndex;
}

// filled regions have area, not a stroke width — cull those by projection only, not by diameter
function isPlaceable(stroke: BrushStroke, scale: number): boolean {
  if (!Number.isFinite(scale) || scale <= 0) return false;
  if (stroke.filled) return true;
  const width = stroke.size * scale;
  return width >= HIDE_THRESHOLD && width <= MAX_SCREEN_STROKE_WIDTH;
}

function snapshot(camera: ProjCamera, frameScale: number): CameraSnapshot {
  return {
    level: camera.level,
    cx: camera.cell.x,
    cy: camera.cell.y,
    sx: camera.sub.x,
    sy: camera.sub.y,
    frameScale,
  };
}
