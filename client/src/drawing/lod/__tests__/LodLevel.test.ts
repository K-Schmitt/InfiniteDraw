import { describe, it, expect } from 'vitest';
import type { Camera } from '@shared/camera';
import {
  TILE_PX,
  selectLevel,
  tileWorldSize,
  visibleTileRange,
  tileOverlapsViewport,
} from '../LodLevel';

const SQRT2 = Math.SQRT2;

describe('selectLevel', () => {
  it('is level 0 at zoom 1 and level 1 at the tile-mode boundary', () => {
    expect(selectLevel(1)).toBe(0);
    expect(selectLevel(0.5)).toBe(1);
  });

  it('increases as zoom decreases (coarser tiles when further out)', () => {
    expect(selectLevel(1e-6)).toBeGreaterThan(selectLevel(1e-3));
    expect(selectLevel(1e-3)).toBeGreaterThan(selectLevel(1));
  });

  it('never returns a negative level', () => {
    expect(selectLevel(1000)).toBe(0);
    expect(selectLevel(1e9)).toBe(0);
  });
});

describe('tileWorldSize', () => {
  it('doubles each level', () => {
    expect(tileWorldSize(0)).toBe(256);
    expect(tileWorldSize(1)).toBe(512);
    expect(tileWorldSize(10)).toBe(256 * 1024);
  });
});

describe('on-screen tile size stays near TILE_PX across the dezoom range', () => {
  // This is the invariant that bounds the visible tile count — the core of the
  // crash fix. In tile mode (zoom ≤ 1) the chosen level keeps tileWorld·zoom
  // within ±√2 of TILE_PX. (Above zoom 1 the level floors at 0 and the renderer
  // is in vector mode, so the bound intentionally does not apply there.)
  it('holds across 35 dezoom decades', () => {
    for (let e = 0; e >= -35; e--) {
      const zoom = 10 ** e;
      const onScreen = tileWorldSize(selectLevel(zoom)) * zoom;
      expect(onScreen).toBeGreaterThanOrEqual(TILE_PX / SQRT2 - 1e-6);
      expect(onScreen).toBeLessThanOrEqual(TILE_PX * SQRT2 + 1e-6);
    }
  });
});

describe('visibleTileRange is bounded at any dezoom', () => {
  const camera = (zoom: number): Camera => ({ x: 0, y: 0, zoom });
  const screen = { width: 1920, height: 1080 };

  it('never exceeds a small constant tile count, even at 10^-20', () => {
    for (let e = 0; e >= -20; e--) {
      const zoom = 10 ** e;
      const level = selectLevel(zoom);
      const r = visibleTileRange(camera(zoom), screen, level);
      const count = (r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(150);
    }
  });

  it('covers the viewport at zoom 1 (level 0, 256px tiles)', () => {
    const r = visibleTileRange(camera(1), screen, 0);
    // 1920/256 = 7.5 → tiles 0..7 ; 1080/256 = 4.2 → tiles 0..4
    expect(r.tx0).toBe(0);
    expect(r.tx1).toBe(7);
    expect(r.ty0).toBe(0);
    expect(r.ty1).toBe(4);
  });
});

describe('tileOverlapsViewport (multi-resolution fallback)', () => {
  // viewport at origin, zoom 1 → world rect [0,0]..[1920,1080]
  const cam = { x: 0, y: 0, zoom: 1 };
  const screen = { width: 1920, height: 1080 };

  it('a current-level tile inside the viewport overlaps', () => {
    expect(tileOverlapsViewport({ level: 0, tx: 0, ty: 0 }, cam, screen)).toBe(true);
  });

  it('a far-away tile does not overlap', () => {
    // level-0 tile (100,100) → world [25600,25600]..
    expect(tileOverlapsViewport({ level: 0, tx: 100, ty: 100 }, cam, screen)).toBe(false);
  });

  it('a coarse parent tile straddling the viewport overlaps (the fallback case)', () => {
    // level-5 tile (0,0) → world [0,0]..[8192,8192], larger than the viewport
    expect(tileOverlapsViewport({ level: 5, tx: 0, ty: 0 }, cam, screen)).toBe(true);
  });

  it('an adjacent tile touching the edge does not count as overlapping', () => {
    // level-0 tile (-1,-1) → world [-256,-256]..[0,0], shares only the corner
    expect(tileOverlapsViewport({ level: 0, tx: -1, ty: -1 }, cam, screen)).toBe(false);
  });
});
