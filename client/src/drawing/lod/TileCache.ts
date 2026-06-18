import { Sprite } from 'pixi.js';
import type { Container, RenderTexture } from 'pixi.js';
import type { BoundingBox } from '../Culling';
import { tileWorldSize, type TileCoord } from './LodLevel';

export interface TileEntry {
  level: number;
  tx: number;
  ty: number;
  /** Baked texture, or null for a known-empty tile (blank space). */
  rt: RenderTexture | null;
  sprite: Sprite | null;
  /** Frame index this tile was last needed — drives LRU eviction. */
  lastFrame: number;
}

// Empty tiles are cached too — blank space is never re-baked, at zero GPU cost.
export class TileCache {
  private readonly entries = new Map<string, TileEntry>();

  constructor(
    private readonly container: Container,
    private readonly maxTiles: number,
  ) {}

  private static tileKey(tile: TileCoord): string {
    return `${tile.level}:${tile.tx}:${tile.ty}`;
  }

  get(tile: TileCoord): TileEntry | undefined {
    return this.entries.get(TileCache.tileKey(tile));
  }

  values(): IterableIterator<TileEntry> {
    return this.entries.values();
  }

  // zIndex = -level so finer levels draw on top of coarser fallbacks
  putBaked(tile: TileCoord, rt: RenderTexture, frame: number): TileEntry {
    const sprite = new Sprite(rt);
    sprite.zIndex = -tile.level;
    this.container.addChild(sprite);
    const entry: TileEntry = { level: tile.level, tx: tile.tx, ty: tile.ty, rt, sprite, lastFrame: frame };
    this.entries.set(TileCache.tileKey(tile), entry);
    return entry;
  }

  /** Records that a tile baked to nothing, so it is not retried while cached. */
  putEmpty(tile: TileCoord, frame: number): TileEntry {
    const entry: TileEntry = { level: tile.level, tx: tile.tx, ty: tile.ty, rt: null, sprite: null, lastFrame: frame };
    this.entries.set(TileCache.tileKey(tile), entry);
    return entry;
  }

  evict(frame: number): void {
    if (this.entries.size <= this.maxTiles) return;

    const stale = [...this.entries.entries()]
      .filter(([, e]) => e.lastFrame !== frame)
      .sort((a, b) => a[1].lastFrame - b[1].lastFrame);

    let over = this.entries.size - this.maxTiles;
    for (const [key, entry] of stale) {
      if (over <= 0) break;
      this.destroyEntry(key, entry);
      over--;
    }
  }

  get size(): number {
    return this.entries.size;
  }

  // targeted removal — unaffected tiles stay cached to prevent flicker on each stroke commit
  removeOverlapping(bbox: BoundingBox): void {
    const stale: string[] = [];
    for (const [key, e] of this.entries) {
      const t = tileWorldSize(e.level);
      const left = e.tx * t;
      const top = e.ty * t;
      if (left + t >= bbox.minX && left <= bbox.maxX && top + t >= bbox.minY && top <= bbox.maxY) {
        stale.push(key);
      }
    }
    for (const key of stale) this.destroyEntry(key, this.entries.get(key)!);
  }

  clear(): void {
    for (const [key, entry] of this.entries) this.destroyEntry(key, entry);
  }

  destroy(): void {
    this.clear();
  }

  private destroyEntry(key: string, entry: TileEntry): void {
    if (entry.sprite) {
      this.container.removeChild(entry.sprite);
      entry.sprite.destroy();
    }
    entry.rt?.destroy(true);
    this.entries.delete(key);
  }
}
