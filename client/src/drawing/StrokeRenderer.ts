import { Container, Graphics } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import type { BrushStroke } from '@shared/stroke';
import type { Camera } from '@shared/camera';
import { isVisible } from './Culling';
import { strokeToRings } from './strokeToPath';
import { fillRings, type FillOptions } from './fillRings';
import { StrokeStore, type StrokeItem } from './StrokeStore';
import { TileLayer } from './lod/TileLayer';
import { TILE_MODE_ZOOM } from './lod/LodLevel';

const TILE_MIN_STROKES = 600;
const HIDE_THRESHOLD = 0.02;
const MAX_SCREEN_STROKE_WIDTH = 2e34;

type RenderMode = 'vector' | 'tile' | null;

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
    this.vectorLayer.addChild(gfx);
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
      const diameter = item.stroke.size * camera.zoom;
      if (diameter < HIDE_THRESHOLD || diameter > MAX_SCREEN_STROKE_WIDTH) { gfx.visible = false; continue; }
      if (!isVisible(item.bbox, viewport)) { gfx.visible = false; continue; }
      // screen = (world − camera) × zoom
      gfx.visible = true;
      gfx.scale.set(camera.zoom);
      gfx.position.set(
        (item.anchorX - camera.x) * camera.zoom,
        (item.anchorY - camera.y) * camera.zoom,
      );
    }
  }
}
