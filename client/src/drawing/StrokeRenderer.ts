import { Container, Graphics } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import type { BrushStroke, Color, Point } from '@shared/stroke';
import type { Camera } from '@shared/camera';
import { isVisible, type BoundingBox } from './Culling';
import { strokeToRings } from './strokeToPath';
import { fillRings, type FillOptions } from './fillRings';
import { pointInRings } from './hitTest';
import { enclosedRegionAt, ringsAdjacent } from './fillRegion';
import { selectFillWalls, sameColor } from './fillWalls';
import { clipRingsToScreen } from './clipToView';
import { StrokeStore, type StrokeItem } from './StrokeStore';
import { TileLayer } from './lod/TileLayer';
import { TILE_MODE_ZOOM } from './lod/LodLevel';

const TILE_MIN_STROKES = 600;
const HIDE_THRESHOLD = 0.02;
const MAX_SCREEN_STROKE_WIDTH = 2e34;
// once a stroke's on-screen span exceeds this many px, baked float32 geometry gets imprecise
// (huge extent and/or huge zoom) — clip it to the viewport and re-fill in screen space instead
const REPROJECT_SCREEN_PX = 1e6;

type RenderMode = 'vector' | 'tile' | null;

export type FillTargetResult =
  | { kind: 'fill'; rings: number[][]; background: boolean }
  | { kind: 'recolor'; ids: string[] };


function bboxOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;
}

// shoelace area of a flat [x0,y0,x1,y1,…] ring
function ringArea(ring: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const nx = (i + 2) % ring.length;
    sum += ring[i]! * ring[nx + 1]! - ring[nx]! * ring[i + 1]!;
  }
  return Math.abs(sum) / 2;
}

function strokeFillOptions(stroke: BrushStroke, item: StrokeItem): FillOptions {
  return {
    originX: item.anchorX,
    originY: item.anchorY,
    scale: 1,
    color: (stroke.color.r << 16) | (stroke.color.g << 8) | stroke.color.b,
    alpha: stroke.color.a / 255,
  };
}

export class StrokeRenderer {
  readonly container: Container;
  private readonly store = new StrokeStore();
  private readonly gfxById = new Map<string, Graphics>();
  private readonly vectorLayer = new Container();
  private readonly tiles: TileLayer;

  private lastCamera: Camera | null = null;
  private mode: RenderMode = null;
  // prevents camera-change guard from skipping frames while tiles remain to bake
  private hasPendingTiles = false;

  constructor(renderer: Renderer) {
    this.container = new Container();
    this.tiles = new TileLayer(renderer, this.store);
    this.container.addChild(this.tiles.container);
    this.container.addChild(this.vectorLayer);
  }

  addStroke(stroke: BrushStroke): void {
    const rings = strokeToRings(stroke);
    const item = this.store.add(stroke, rings);
    const gfx = new Graphics();
    fillRings(gfx, rings, strokeFillOptions(stroke, item));
    this.gfxById.set(stroke.id, gfx);
    // paint-bucket fills drop behind outlines so borders stay visible; everything else stacks on top
    if (stroke.background) this.vectorLayer.addChildAt(gfx, 0);
    else this.vectorLayer.addChild(gfx);
    this.tiles.invalidate(item.bbox);
    this.lastCamera = null;
  }

  removeStroke(id: string): void {
    const item = this.store.get(id);
    this.store.remove(id);
    const gfx = this.gfxById.get(id);
    if (gfx) {
      this.vectorLayer.removeChild(gfx);
      gfx.destroy();
      this.gfxById.delete(id);
    }
    if (item) this.tiles.invalidate(item.bbox);
    this.lastCamera = null;
  }

  // ─── Hit-testing (eraser / fill / eyedropper) ────────────────────────────────

  /** Strokes whose bounding box overlaps `bbox` — broad phase for the eraser. */
  strokesNear(bbox: BoundingBox): BrushStroke[] {
    return this.store.queryRect(bbox).map((item) => item.stroke);
  }

  /** Color of the innermost (smallest) stroke whose painted area covers the point (eyedropper). */
  pickColorAt(world: Point): Color | undefined {
    return this.topmostAt(world)?.color;
  }

  /**
   * Paint-bucket target. On empty canvas → a new fill of the enclosed cell (bounded by
   * other-color strokes, drawn behind outlines). On an existing stroke → the ids of the
   * connected same-color group to recolor in place (repeatable, never stacks).
   */
  fillTarget(world: Point, color: Color): FillTargetResult | null {
    const target = this.topmostAt(world);
    if (target) return { kind: 'recolor', ids: this.sameColorGroup(target) };

    const walls = selectFillWalls([...this.store.all()], color);
    const cell = enclosedRegionAt(world, walls);
    return cell ? { kind: 'fill', rings: cell, background: true } : null;
  }

  // ids of all same-color strokes connected (by overlapping bounding boxes) to `start`
  private sameColorGroup(start: BrushStroke): string[] {
    const pool = [...this.store.all()].filter((i) => sameColor(i.stroke.color, start.color));
    const seen = new Set<string>([start.id]);
    const queue: StrokeItem[] = [];
    const startItem = this.store.get(start.id);
    if (startItem) queue.push(startItem);
    while (queue.length > 0) {
      const cur = queue.pop()!;
      for (const it of pool) {
        if (seen.has(it.stroke.id) || !bboxOverlap(cur.bbox, it.bbox)) continue;
        if (!ringsAdjacent(cur.rings, it.rings)) continue; // real contact (touch/overlap), not just bbox
        seen.add(it.stroke.id);
        queue.push(it);
      }
    }
    return [...seen];
  }

  /** Id of the innermost (smallest) stroke whose painted area covers the point (re-coloring). */
  strokeAt(world: Point): string | undefined {
    return this.topmostAt(world)?.id;
  }

  // smallest-area stroke containing the point — for nested fills that's the visible top one
  private topmostAt(world: Point): BrushStroke | undefined {
    let found: BrushStroke | undefined;
    let bestArea = Infinity;
    for (const item of this.store.all()) {
      if (!pointInRings(world.x, world.y, item.rings)) continue;
      const a = ringArea(item.rings[0] ?? []);
      if (a < bestArea) {
        bestArea = a;
        found = item.stroke;
      }
    }
    return found;
  }

  /** Repaints an existing stroke with a new color in place (keeps its z-order). */
  recolorStroke(id: string, color: Color): void {
    const item = this.store.get(id);
    const gfx = this.gfxById.get(id);
    if (!item || !gfx) return;
    item.stroke.color = color;
    gfx.clear();
    fillRings(gfx, item.rings, strokeFillOptions(item.stroke, item));
    this.tiles.invalidate(item.bbox);
    this.lastCamera = null;
  }

  redraw(camera: Camera, screenW: number, screenH: number): void {
    const prev = this.lastCamera;
    const sameCamera = !!prev && prev.x === camera.x && prev.y === camera.y && prev.zoom === camera.zoom;
    if (sameCamera && !this.hasPendingTiles) return;
    this.lastCamera = camera;

    const useTiles = camera.zoom < TILE_MODE_ZOOM && this.store.size > TILE_MIN_STROKES;
    if (useTiles) this.renderTileMode(camera, screenW, screenH);
    else this.renderVectorMode(camera, screenW, screenH);
  }

  destroy(): void {
    this.tiles.destroy();
    this.container.destroy({ children: true });
    this.store.clear();
    this.gfxById.clear();
  }

  // ─── Tile mode ─────────────────────────────────────────────────────────────

  private renderTileMode(camera: Camera, screenW: number, screenH: number): void {
    if (this.mode !== 'tile') {
      this.mode = 'tile';
      this.vectorLayer.visible = false;
      this.tiles.setVisible(true);
    }
    this.hasPendingTiles = this.tiles.render(camera, screenW, screenH);
  }

  // ─── Vector mode ───────────────────────────────────────────────────────────

  private renderVectorMode(camera: Camera, screenW: number, screenH: number): void {
    if (this.mode !== 'vector') {
      this.mode = 'vector';
      this.tiles.setVisible(false);
      this.vectorLayer.visible = true;
    }
    this.hasPendingTiles = false;

    const viewport = {
      x: camera.x,
      y: camera.y,
      width: screenW / camera.zoom,
      height: screenH / camera.zoom,
    };

    for (const item of this.store.all()) {
      const gfx = this.gfxById.get(item.stroke.id);
      if (!gfx) continue;
      // filled regions have area, not a stroke width — only cull them by viewport, not by diameter
      if (!item.stroke.filled) {
        const diameter = item.stroke.size * camera.zoom;
        if (diameter < HIDE_THRESHOLD || diameter > MAX_SCREEN_STROKE_WIDTH) { gfx.visible = false; continue; }
      }
      if (!isVisible(item.bbox, viewport)) { gfx.visible = false; continue; }
      gfx.visible = true;
      const extent = Math.max(item.bbox.maxX - item.bbox.minX, item.bbox.maxY - item.bbox.minY);
      if (extent * camera.zoom > REPROJECT_SCREEN_PX) this.clipToScreen(gfx, item, camera, screenW, screenH);
      else placeBaked(gfx, item, camera);
    }
  }

  // huge strokes: clip to the viewport and re-fill in screen space so vertices stay float32-precise
  private clipToScreen(gfx: Graphics, item: StrokeItem, camera: Camera, w: number, h: number): void {
    gfx.scale.set(1);
    gfx.position.set(0, 0);
    gfx.clear();
    const rings = clipRingsToScreen(item.rings, camera, w, h);
    const c = item.stroke.color;
    fillRings(gfx, rings, {
      originX: 0,
      originY: 0,
      scale: 1,
      color: (c.r << 16) | (c.g << 8) | c.b,
      alpha: c.a / 255,
    });
  }
}

// normal strokes: geometry is baked once relative to the anchor; only move/scale the container
function placeBaked(gfx: Graphics, item: StrokeItem, camera: Camera): void {
  gfx.scale.set(camera.zoom);
  gfx.position.set((item.anchorX - camera.x) * camera.zoom, (item.anchorY - camera.y) * camera.zoom);
}
