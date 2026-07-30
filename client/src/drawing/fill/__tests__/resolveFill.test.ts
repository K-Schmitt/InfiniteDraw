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
