import { Container } from 'pixi.js';
import type { Renderer, Sprite } from 'pixi.js';
import type { Camera } from '@shared/camera';
import type { StrokeStore } from '../StrokeStore';
import { TileCache } from './TileCache';
import { bakeTile } from './TileBaker';
import {
  TILE_PX,
  selectLevel,
  tileWorldSize,
  visibleTileRange,
  tileOverlapsViewport,
  type TileCoord,
  type ScreenSize,
} from './LodLevel';

// ≈128 MB GPU budget (tiles bake at 2× resolution, ~1 MB each); transitions need ~80 tiles
const MAX_TILES = 128;

/** Tiles baked per frame — amortizes work so a big reveal never spikes a frame. */
const MAX_BAKES_PER_FRAME = 8;

/** Defensive ceiling on the visible range (the range is bounded by design). */
const MAX_VISIBLE_TILES = 256;

interface BakeRequest {
  tile: TileCoord;
  dist: number;
}

export class TileLayer {
  readonly container = new Container();
  private readonly cache: TileCache;
  private frame = 0;

  constructor(
    private readonly renderer: Renderer,
    private readonly store: StrokeStore,
  ) {
    this.container.sortableChildren = true; // honour per-sprite zIndex (finer on top)
    this.cache = new TileCache(this.container, MAX_TILES);
  }

  get tileCount(): number {
    return this.cache.size;
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible;
  }

  invalidate(bbox: { minX: number; minY: number; maxX: number; maxY: number }): void {
    this.cache.removeOverlapping(bbox);
  }

  // returns true while tiles remain to bake — caller must keep redrawing until settled
  render(camera: Camera, screenW: number, screenH: number): boolean {
    this.frame++;
    const screen: ScreenSize = { width: screenW, height: screenH };
    const level = selectLevel(camera.zoom);
    const pending = this.planBakes(camera, screen, level);
    this.showAllOverlapping(camera, screen);
    this.cache.evict(this.frame);
    return pending;
  }

  destroy(): void {
    this.cache.destroy();
    this.container.destroy({ children: true });
  }

  private planBakes(camera: Camera, screen: ScreenSize, level: number): boolean {
    const t = tileWorldSize(level);
    const range = visibleTileRange(camera, screen, level);
    const centerTx = Math.floor((camera.x + screen.width / camera.zoom / 2) / t);
    const centerTy = Math.floor((camera.y + screen.height / camera.zoom / 2) / t);

    const toBake: BakeRequest[] = [];
    let seen = 0;

    for (let tx = range.tx0; tx <= range.tx1; tx++) {
      for (let ty = range.ty0; ty <= range.ty1; ty++) {
        if (++seen > MAX_VISIBLE_TILES) break;
        const tile: TileCoord = { level, tx, ty };
        const entry = this.cache.get(tile);
        if (entry) {
          entry.lastFrame = this.frame;
          continue;
        }
        const dx = tx - centerTx;
        const dy = ty - centerTy;
        toBake.push({ tile, dist: dx * dx + dy * dy });
      }
    }

    toBake.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < toBake.length && i < MAX_BAKES_PER_FRAME; i++) {
      const { tile } = toBake[i]!;
      const rt = bakeTile(tile, this.store, this.renderer);
      if (rt) this.cache.putBaked(tile, rt, this.frame);
      else this.cache.putEmpty(tile, this.frame);
    }

    return toBake.length > MAX_BAKES_PER_FRAME;
  }

  // coarser fallback tiles fill gaps while the current level bakes — no blank frames
  private showAllOverlapping(camera: Camera, screen: ScreenSize): void {
    for (const entry of this.cache.values()) {
      if (!entry.sprite) continue;
      const tile: TileCoord = { level: entry.level, tx: entry.tx, ty: entry.ty };
      if (!tileOverlapsViewport(tile, camera, screen)) {
        entry.sprite.visible = false;
        continue;
      }
      this.place(entry.sprite, tile, camera);
      entry.lastFrame = this.frame;
    }
  }

  private place(sprite: Sprite, tile: TileCoord, camera: Camera): void {
    const t = tileWorldSize(tile.level);
    sprite.x = (tile.tx * t - camera.x) * camera.zoom;
    sprite.y = (tile.ty * t - camera.y) * camera.zoom;
    sprite.scale.set((t * camera.zoom) / TILE_PX);
    sprite.visible = true;
  }
}
