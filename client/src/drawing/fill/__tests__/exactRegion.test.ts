import { describe, it, expect } from 'vitest';
import { exactRegionAt } from '../exactRegion';

/** A closed band (outer + inner ring) — what a rectangle stroke's outline looks like. */
function band(half: number, thickness: number): number[][] {
  const o = half + thickness;
  return [
    [-o, -o, o, -o, o, o, -o, o],
    [-half, -half, half, -half, half, half, -half, half],
  ];
}

describe('exactRegionAt', () => {
  it('reconstructs the interior of a single closed band', () => {
    const region = exactRegionAt({
      seed: { x: 0, y: 0 },
      walls: [band(100, 5)],
      hint: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
    });
    expect(region).not.toBeNull();
    expect(region![0]!.length).toBeGreaterThanOrEqual(8);
  });

  it('reconstructs the inner region when a smaller band sits inside a larger one', () => {
    const region = exactRegionAt({
      seed: { x: 0, y: 0 },
      walls: [band(100, 5), band(10, 2)],
      hint: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
    })!;
    const xs = region[0]!.filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(11);
  });

  it('stays well-conditioned when the region is tiny in absolute frame units', () => {
    const region = exactRegionAt({
      seed: { x: 0, y: 0 },
      walls: [band(1e-6, 1e-7)],
      hint: { minX: -1e-6, minY: -1e-6, maxX: 1e-6, maxY: 1e-6 },
    });
    expect(region).not.toBeNull();
  });

  it('stays well-conditioned when the region is enormous', () => {
    const region = exactRegionAt({
      seed: { x: 0, y: 0 },
      walls: [band(1e12, 1e10)],
      hint: { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 },
    });
    expect(region).not.toBeNull();
  });

  it('returns null when no wall encloses the seed', () => {
    expect(exactRegionAt({
      seed: { x: 0, y: 0 },
      walls: [],
      hint: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
    })).toBeNull();
  });

  // polygon-clipping 0.15.7 does NOT throw on a 3-coincident-point ring — it returns the working
  // box unchanged. Without `touchesBox`, `pickFace` would find the seed inside that box and hand
  // it back as an "exact" region. This asserts the rejection, not the absence of a throw.
  it('returns null rather than throwing on degenerate wall geometry', () => {
    expect(exactRegionAt({
      seed: { x: 0, y: 0 },
      walls: [[[0, 0, 0, 0, 0, 0]]],
      hint: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
    })).toBeNull();
  });

  it('returns null when the walls leave a gap the face can escape through', () => {
    expect(exactRegionAt({
      seed: { x: 0, y: 0 },
      walls: [[[-10, -10, 10, -10, 10, 10, -10, 10, -10, 2]]], // open on the left edge
      hint: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
    })).toBeNull();
  });
});
