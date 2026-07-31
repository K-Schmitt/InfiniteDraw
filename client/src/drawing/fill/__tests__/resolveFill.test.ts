import { describe, it, expect } from 'vitest';
import { resolveFill } from '../resolveFill';
import { ringArea } from '../../projectRings';
import type { PixelBuffer } from '../maskBuffer';

/** Index-coded buffer from an ASCII map: digits are wall indices, '.' is empty. */
function walls(rows: readonly string[]): PixelBuffer {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y]![x]!;
      if (ch === '.') continue;
      const packed = Number(ch) + 1;
      const i = (y * width + x) * 4;
      data[i] = packed & 255;
      data[i + 1] = (packed >> 8) & 255;
      data[i + 2] = (packed >> 16) & 255;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

const BOX = [
  '00000000',
  '0......0',
  '0......0',
  '0......0',
  '00000000',
];

/**
 * C-shaped enclosure whose right side has a geometric gap (y in [6, 8]) that the raster SEALED
 * (rows 6-7 painted with wall 3), exactly as `FILL_GAP_PX` thickening does: the flood is
 * enclosed, the exact stage runs, but the wall geometry it gets still has the gap open.
 */
const SEALED_GAP = [
  '......................',
  '.......11100000000000.',
  '.......11100000000000.',
  '.......11100000000000.',
  '.......111........333.',
  '.......111........333.',
  '.......111........333.',
  '.......111........333.',
  '.......111........444.',
  '.......111........444.',
  '.......22222222222444.',
  '.......22222222222444.',
  '.......22222222222444.',
  '......................',
];

const SEALED_GAP_RINGS: number[][][] = [
  [[7, 1, 21, 1, 21, 4, 7, 4]],     // top bar
  [[7, 1, 10, 1, 10, 13, 7, 13]],   // left bar
  [[7, 10, 21, 10, 21, 13, 7, 13]], // bottom bar
  [[18, 4, 21, 4, 21, 6, 18, 6]],   // right bar, above the gap
  [[18, 8, 21, 8, 21, 13, 18, 13]], // right bar, below — geometry gap y in [6, 8] stays open
];

describe('resolveFill', () => {
  // The wall is a BAND (outer ring + inner ring) — exactly what a rectangle stroke commits, via
  // `strokeOutlineRings`. A single solid ring would put the seed *inside* the wall, `pickFace`
  // would return null, and this test would silently exercise the fallback path while claiming to
  // prove the exact stage.
  it('resolves the enclosed region exactly and reports its bounding wall', () => {
    const result = resolveFill({
      source: {
        buffer: walls(BOX),
        wallRings: [[[0, 0, 8, 0, 8, 5, 0, 5], [1, 1, 7, 1, 7, 4, 1, 4]]],
      },
      seedPx: { x: 4, y: 2 },
      frameScale: 1,
    })!;
    expect(result.wallIndices).toEqual([0]);
    expect(result.exact).toBe(true);
    expect(result.rings[0]!.length).toBeGreaterThanOrEqual(8);
  });

  it('refuses an open region rather than filling the viewport', () => {
    expect(resolveFill({
      source: { buffer: walls(['....', '....', '....']), wallRings: [] },
      seedPx: { x: 1, y: 1 },
      frameScale: 1,
    })).toBeNull();
  });

  // Two cheap property guards on the two catastrophic failure modes: a fill can never exceed the
  // pixels it flooded, and an exact face can never balloon out to the padded working box.
  it('never returns more area than the flood covered', () => {
    const result = resolveFill({
      source: {
        buffer: walls(BOX),
        wallRings: [[[0, 0, 8, 0, 8, 5, 0, 5], [1, 1, 7, 1, 7, 4, 1, 4]]],
      },
      seedPx: { x: 4, y: 2 },
      frameScale: 1,
    })!;
    expect(Math.abs(ringArea(result.rings[0]!))).toBeLessThanOrEqual(6 * 3 * 1.25 + 1);
  });

  it('falls back to the traced polygon when there are no usable walls', () => {
    const result = resolveFill({
      source: { buffer: walls(BOX), wallRings: [] },
      seedPx: { x: 4, y: 2 },
      frameScale: 1,
    })!;
    expect(result.exact).toBe(false);
  });

  it('converts pixel coordinates to camera-frame units', () => {
    const result = resolveFill({
      source: { buffer: walls(BOX), wallRings: [] },
      seedPx: { x: 4, y: 2 },
      frameScale: 2,
    })!;
    const xs = result.rings[0]!.filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(3.5 + 1e-9); // 7px / frameScale 2
  });

  // The walls extend past the padded working box on every side, so the exact stage's escape
  // guard must catch the face leaking through the geometric gap by the box's own mapped edges,
  // not a fixed span — otherwise the leaked face is committed and paints out to x = 20.
  it('never paints past the walls when the geometry has a gap the raster sealed', () => {
    const result = resolveFill({
      source: { buffer: walls(SEALED_GAP), wallRings: SEALED_GAP_RINGS },
      seedPx: { x: 14, y: 7 },
      frameScale: 1,
    });
    expect(result).not.toBeNull();
    const xs = result!.rings[0]!.filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(18 + 1e-6);
  });

  it('returns null when the seed lands on a wall', () => {
    expect(resolveFill({
      source: { buffer: walls(BOX), wallRings: [] },
      seedPx: { x: 0, y: 0 },
      frameScale: 1,
    })).toBeNull();
  });

  it('returns null when the seed is outside the buffer', () => {
    expect(resolveFill({
      source: { buffer: walls(BOX), wallRings: [] },
      seedPx: { x: 99, y: 99 },
      frameScale: 1,
    })).toBeNull();
  });
});

/**
 * Regression (S1): an enclosure whose wall crosses the viewport edge used to refuse to fill —
 * the mask was cropped to the exact viewport, the flood reached the crop edge and was refused
 * as "open". The mask is now padded (buffer pixel (0,0) sits at screen `originPx`), and every
 * result must still come back in CAMERA-FRAME units (frame (0,0) = viewport top-left pixel).
 */
describe('resolveFill with a padded mask (originPx)', () => {
  // Viewport is 12x8; pad is 6x4 per side -> 24x16 buffer with originPx (-6,-4).
  const ORIGIN = { x: -6, y: -4 };
  const W = 24;
  const H = 16;
  // Closed rectangle contour (2px walls): outer x in [4,14] — the right wall band x=12..14
  // is OFF the 12px viewport but inside the padded buffer.
  const ANNULUS = [
    [4, 1, 14, 1, 14, 7, 4, 7],
    [6, 3, 12, 3, 12, 5, 6, 5],
  ];

  /** Even-odd rasterization of frame-space rings into the padded buffer. */
  function paddedMask(rings: readonly (readonly number[])[]): PixelBuffer {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = x + ORIGIN.x + 0.5;
        const py = y + ORIGIN.y + 0.5;
        let inside = 0;
        for (const ring of rings) {
          if (pointInRing(px, py, ring)) inside ^= 1;
        }
        if (inside) {
          const i = (y * W + x) * 4;
          data[i] = 1; // wall index 0 + INDEX_OFFSET
          data[i + 3] = 255;
        }
      }
    }
    return { data, width: W, height: H };
  }

  function pointInRing(px: number, py: number, ring: readonly number[]): boolean {
    let hit = false;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const xi = ring[i]!;
      const yi = ring[i + 1]!;
      const xj = ring[j]!;
      const yj = ring[j + 1]!;
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }

  // Click at frame (8,4), inside the hollow -> buffer pixel (14,8).
  const SEED = { x: 8 - ORIGIN.x, y: 4 - ORIGIN.y };

  it('fills an enclosure whose wall lies past the viewport edge', () => {
    const result = resolveFill({
      source: { buffer: paddedMask(ANNULUS), wallRings: [ANNULUS.map((r) => [...r])] },
      seedPx: SEED,
      originPx: ORIGIN,
      frameScale: 1,
    });
    expect(result).not.toBeNull();
    expect(result!.wallIndices).toEqual([0]);
    // Camera-frame coords: the hollow is [6,12]x[3,5], NOT buffer coords [12,18]x[7,9].
    const xs = result!.rings[0]!.filter((_, i) => i % 2 === 0);
    const ys = result!.rings[0]!.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(6 - 0.1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(12 + 0.1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(3 - 0.1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(5 + 0.1);
  });

  it('still refuses a flood that reaches the PADDED buffer edge (open exterior)', () => {
    expect(resolveFill({
      source: { buffer: paddedMask([]), wallRings: [] },
      seedPx: SEED,
      originPx: ORIGIN,
      frameScale: 1,
    })).toBeNull();
  });

  it('maps the traced fallback contour back to frame units too', () => {
    const result = resolveFill({
      source: { buffer: paddedMask(ANNULUS), wallRings: [] }, // no walls -> traced path
      seedPx: SEED,
      originPx: ORIGIN,
      frameScale: 1,
    })!;
    expect(result.exact).toBe(false);
    const xs = result.rings[0]!.filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(6 - 0.1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(12 + 0.1);
  });
});
