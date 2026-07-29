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
import {
  ringsToFrame, ringArea, frameBboxOf, cameraInsideStroke, localBboxToFrame,
} from './projectRings';
import { decideFill, type FillCandidate } from './fillDecision';
import { log, logThrottled } from '../debug/logger';

const HIDE_THRESHOLD = 0.02;
const MAX_SCREEN_STROKE_WIDTH = 2e34;
// Above this camera-vs-anchor level gap, placing a stroke by scaling anchor-local geometry
// (gfx.scale ≈ 2^gap, gfx.position ≈ -origin·2^gap) makes the GPU's float32 vertex transform
// cancel two ~2^(gap+16) terms — ULP grows past whole pixels, so the stroke jitters off-screen
// (F2 bug 1). Past the threshold we instead re-express each vertex in frame coords (float64,
// small magnitudes) so the GPU only ever multiplies by ~2^frac. Below it the cheap bake-once
// transform stays sub-pixel, avoiding a per-frame re-bake of every stroke at normal zoom.
const FRAME_REBAKE_GAP = 2;
// Max on-screen span (px) a stroke may cover before its frame geometry outruns float32's 24-bit
// mantissa (2^22 ≈ 4M px keeps rasterisation sub-pixel). Past it, bleed instead of baking.
const FRAME_MAX_SCREEN_SPAN = 2 ** 22;
// background fills sort below every real stroke so outlines stay visible on top (Bug 1 fix)
const BG_ORDER = 1e9;

type RenderMode = 'baked' | 'bleed' | 'frame';

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
  private readonly pendingDestroy: Graphics[] = [];
  private last: CameraSnapshot | null = null;
  private screenW = 0;
  private screenH = 0;

  constructor() {
    this.container = new Container();
    this.vectorLayer.sortableChildren = true;
    this.container.addChild(this.vectorLayer);
  }

  /** Repaint order only — no geometry teardown. Used when the server echoes an author's own
   *  stroke back with its authoritative zIndex: rebuilding the Graphics there would destroy
   *  GPU buffers mid-frame (the socket callback can land inside a render pass). */
  setPaintOrder(id: string, zIndex: number): void {
    const item = this.store.get(id);
    const p = this.placements.get(id);
    if (!item || !p) {
      log('render', 'setPaintOrder MISS', { id, hasItem: !!item, hasPlacement: !!p });
      return;
    }
    const before = item.stroke.zIndex;
    item.stroke.zIndex = zIndex;
    p.gfx.zIndex = paintOrder(item.stroke);
    log('render', 'setPaintOrder', { id, before, after: zIndex, gfxZ: p.gfx.zIndex });
  }

  /** Upsert: re-adding an id already on screen replaces it instead of leaking an orphaned gfx. */
  addStroke(stroke: BrushStroke): void {
    const t0 = performance.now();
    const replacing = this.placements.has(stroke.id);
    this.removeStroke(stroke.id);
    const rings = strokeToRings(stroke);
    this.store.add(stroke, rings);
    const gfx = new Graphics();
    fillRings(gfx, rings, fillOptions(stroke));
    gfx.zIndex = paintOrder(stroke);
    this.placements.set(stroke.id, { gfx, mode: 'baked' });
    this.vectorLayer.addChild(gfx);
    this.last = null;
    log('render', 'addStroke', {
      id: stroke.id, replacing, zIndex: gfx.zIndex,
      ringCount: rings.length, vertices: rings.reduce((n, r) => n + r.length / 2, 0),
      onScreen: this.placements.size, ms: +(performance.now() - t0).toFixed(2),
    });
  }

  removeStroke(id: string): void {
    this.store.remove(id);
    const p = this.placements.get(id);
    if (p) {
      this.vectorLayer.removeChild(p.gfx);
      // Freeing GPU buffers here is unsafe: removals arrive from socket callbacks that can
      // land inside a render pass, leaving the batcher drawing against a destroyed geometry
      // ("GL_INVALID_OPERATION: Insufficient buffer size"). Destroy between frames instead.
      this.pendingDestroy.push(p.gfx);
      this.placements.delete(id);
      log('render', 'removeStroke', {
        id, mode: p.mode, queuedForDestroy: this.pendingDestroy.length,
        onScreen: this.placements.size,
      });
    }
    this.last = null;
  }

  /** Frees geometry retired since the last frame. Called from `redraw`, i.e. inside the ticker. */
  private flushDestroyed(): void {
    if (this.pendingDestroy.length === 0) return;
    log('render', 'destroying retired graphics', { count: this.pendingDestroy.length });
    for (const gfx of this.pendingDestroy) gfx.destroy();
    this.pendingDestroy.length = 0;
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

  /** Candidate strokes overlapping a frame box, rings pre-projected (eraser broad phase).
   *  Rejects on the projected bbox (2 projections) before paying for every vertex — this runs
   *  per pointermove during an erase, so the per-stroke cost has to stay O(1) when it misses. */
  strokesInFrame(box: FrameBounds, camera: ProjCamera): FrameCandidate[] {
    const t0 = performance.now();
    const out: FrameCandidate[] = [];
    let scanned = 0;
    let narrowPhase = 0;
    for (const item of this.store.all()) {
      scanned++;
      const frameBox = localBboxToFrame(item.stroke.anchor, item.ringBounds, camera);
      if (!frameBox || !bboxOverlap(frameBox, box)) continue;
      narrowPhase++;
      const frameRings = ringsToFrame(item.stroke.anchor, item.rings, camera);
      if (frameRings && bboxOverlap(frameBboxOf(frameRings), box)) {
        out.push({ stroke: item.stroke, frameRings });
      }
    }
    const dt = performance.now() - t0;
    const data = { scanned, narrowPhase, hits: out.length, ms: +dt.toFixed(2), box };
    if (dt >= 16) log('error', `SLOW strokesInFrame ${dt.toFixed(1)}ms`, data);
    else logThrottled('sif', 250, () => ({ cat: 'render', msg: 'strokesInFrame', data }));
    return out;
  }

  /**
   * Paint-bucket target. Region-first: an enclosed region under the cursor wins over any stroke
   * covering it, so a shape drawn *inside* an already-filled shape fills its own interior instead
   * of recoloring its parent. Falls back to recoloring the stroke under an open-area click.
   */
  fillTarget(frame: Point, camera: ProjCamera, color: Color): FillTargetResult | null {
    const projected = this.projectedInViewport(camera);
    const walls = selectFillWalls(
      projected.map((c) => ({ stroke: c.stroke, rings: c.frameRings })),
      color,
    );
    const region = enclosedRegionAt(frame, walls);
    const decision = decideFill(frame, region, projected.map(toFillCandidate));
    log('geom', `fillTarget -> ${decision.kind}`, {
      frame, walls: walls.length, ringCount: region?.length ?? 0, visible: projected.length,
    });
    if (decision.kind === 'fill') return { kind: 'fill', rings: decision.rings, background: true };
    if (decision.kind === 'recolorRegion') return { kind: 'recolor', ids: [decision.fillId] };
    if (decision.kind === 'recolorStroke') return this.recolorGroupOf(decision.strokeId, camera);
    return null;
  }

  /** Recolor target for a direct stroke hit: the connected same-color group around it. */
  private recolorGroupOf(strokeId: string, camera: ProjCamera): FillTargetResult | null {
    const item = this.store.get(strokeId);
    if (!item) return null;
    return { kind: 'recolor', ids: this.sameColorGroup(item.stroke, camera) };
  }

  // smallest-area stroke (in frame units) containing the point — the visible top one
  private topmostAt(frame: Point, camera: ProjCamera): BrushStroke | undefined {
    let found: BrushStroke | undefined;
    let bestArea = Infinity;
    for (const cand of this.projectedInViewport(camera)) {
      if (!pointInRings(frame.x, frame.y, cand.frameRings)) continue;
      const a = ringArea(cand.frameRings[0] ?? []);
      if (a < bestArea) {
        bestArea = a;
        found = cand.stroke;
      }
    }
    return found;
  }

  /** Strokes whose projected bbox overlaps the viewport, rings pre-projected into the frame.
   *  Fill/eyedropper only act on what's on screen, so this bounds every full scan (topmost, walls,
   *  same-color group) to the visible set instead of the whole document — the difference between a
   *  responsive click and a multi-second polygon-clipping stall at high stroke counts. */
  private projectedInViewport(camera: ProjCamera): GroupCandidate[] {
    const vp = this.viewportFrameBox();
    const out: GroupCandidate[] = [];
    for (const item of this.store.all()) {
      if (vp) {
        const fb = localBboxToFrame(item.stroke.anchor, item.ringBounds, camera);
        if (!fb || !bboxOverlap(fb, vp)) continue;
      }
      const frameRings = ringsToFrame(item.stroke.anchor, item.rings, camera);
      if (frameRings) out.push({ stroke: item.stroke, frameRings, bounds: frameBboxOf(frameRings) });
    }
    return out;
  }

  // Current viewport as a frame-space box (screen maps to frame via ×frameScale), padded so a
  // fill's enclosing walls just off-screen still count. Null before the first redraw sets `last`.
  private viewportFrameBox(): FrameBounds | null {
    const l = this.last;
    if (!l || !(l.frameScale > 0) || this.screenW === 0) return null;
    const w = this.screenW / l.frameScale;
    const h = this.screenH / l.frameScale;
    return { minX: -w * 0.5, minY: -h * 0.5, maxX: w * 1.5, maxY: h * 1.5 };
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
    return this.projectedInViewport(camera).filter((c) => sameColor(c.stroke.color, start.color));
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  redraw(camera: ProjCamera, frameScale: number, screenW: number, screenH: number): void {
    this.flushDestroyed();
    this.screenW = screenW;
    this.screenH = screenH;
    if (this.unchanged(camera, frameScale)) return;
    this.last = snapshot(camera, frameScale);
    const t0 = performance.now();
    let count = 0;
    for (const item of this.store.all()) {
      this.place(item, camera, frameScale);
      count++;
    }
    const dt = performance.now() - t0;
    const census = { baked: 0, frame: 0, bleed: 0, hidden: 0 };
    for (const p of this.placements.values()) {
      if (!p.gfx.visible) census.hidden++;
      else census[p.mode]++;
    }
    const data = { strokes: count, ms: +dt.toFixed(2), level: camera.level, frameScale, ...census };
    if (dt >= 16) log('error', `SLOW redraw ${dt.toFixed(1)}ms`, data);
    else logThrottled('redraw', 500, () => ({ cat: 'render', msg: 'redraw', data }));
  }

  destroy(): void {
    this.flushDestroyed();
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
    if (camera.level - item.stroke.anchor.level > FRAME_REBAKE_GAP) {
      // Frame geometry stays float32-renderable only while the stroke's on-screen span fits the
      // 24-bit mantissa. Once you are zoomed so far in that its span exceeds that, its far
      // vertices overflow and rasterisation breaks — but at that depth the camera sits inside the
      // stroke, so hand off to the §4 bleed (fill viewport) / hide decision instead of baking it.
      if (spanOf(item.ringBounds) * scale > FRAME_MAX_SCREEN_SPAN) {
        return this.placeCulled(item, p, camera);
      }
      return this.placeInFrame(item, p, camera, frameScale);
    }
    if (p.mode !== 'baked') this.rebake(item, p);
    p.gfx.visible = true;
    p.gfx.position.set(proj.fx * frameScale, proj.fy * frameScale);
    p.gfx.scale.set(scale);
  }

  // Deep-zoom path: bake the stroke's rings already projected into frame coords, so the GPU
  // transform is only a small ×frameScale — no float32-cancelling huge scale/offset (F2 bug 1).
  private placeInFrame(
    item: StrokeItem, p: Placement, camera: ProjCamera, frameScale: number,
  ): void {
    const frameRings = ringsToFrame(item.stroke.anchor, item.rings, camera);
    if (frameRings === null) return this.placeCulled(item, p, camera);
    if (p.mode !== 'frame') {
      log('render', 'mode -> frame (deep zoom rebake)', {
        id: item.stroke.id, from: p.mode, anchorLevel: item.stroke.anchor.level,
        cameraLevel: camera.level,
      });
    }
    p.mode = 'frame';
    p.gfx.clear();
    fillRings(p.gfx, frameRings, fillOptions(item.stroke));
    p.gfx.position.set(0, 0);
    p.gfx.scale.set(frameScale);
    p.gfx.visible = true;
  }

  // camera outside → hide; camera over a much-coarser stroke's extent → bleed a viewport fill (§4)
  private placeCulled(item: StrokeItem, p: Placement, camera: ProjCamera): void {
    const inside = cameraInsideStroke(item.ringBounds, item.stroke.anchor, camera);
    if (!inside) { p.gfx.visible = false; return; }
    if (p.mode !== 'bleed') {
      log('render', 'mode -> bleed (camera inside coarse stroke)', {
        id: item.stroke.id, from: p.mode, anchorLevel: item.stroke.anchor.level,
        cameraLevel: camera.level,
      });
    }
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

function toFillCandidate(c: GroupCandidate): FillCandidate {
  return { id: c.stroke.id, isBackground: !!c.stroke.background, frameRings: c.frameRings };
}

/** Larger of a stroke's local bbox dimensions — its on-screen span is this × anchor scale. */
function spanOf(b: FrameBounds): number {
  return Math.max(b.maxX - b.minX, b.maxY - b.minY);
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
