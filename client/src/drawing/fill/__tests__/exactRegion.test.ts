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

/**
 * C-shaped enclosure with a real geometric gap on the right (y in [6, 8]).
 * Interior: x in [10, 18], y in [4, 10]; padded working box: x [8, 20], y [2.5, 11.5].
 * A face escaping through the gap is clipped at the artificial box edge x = 20 — the escape
 * guard must reject it however the walls sit relative to the working box.
 */
const GAPPED_HINT = { minX: 10, minY: 4, maxX: 18, maxY: 10 };
const GAPPED_SEED = { x: 14, y: 7 };

/** Five bars around the interior; thickness > 2 extends past the box's 25% padding. */
function gappedWalls(thickness: number, topBarMaxX?: number): number[][][] {
  const t = thickness;
  const x1 = topBarMaxX ?? 18 + t;
  return [
    [[10 - t, 4 - t, x1, 4 - t, x1, 4, 10 - t, 4]],            // top bar
    [[10 - t, 4 - t, 10, 4 - t, 10, 10 + t, 10 - t, 10 + t]],  // left bar
    [[10 - t, 10, 18 + t, 10, 18 + t, 10 + t, 10 - t, 10 + t]], // bottom bar
    [[18, 4, 18 + t, 4, 18 + t, 6, 18, 6]],                    // right bar, above the gap
    [[18, 8, 18 + t, 8, 18 + t, 10 + t, 18, 10 + t]],          // right bar, below the gap
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

  // The polyline auto-closes into a solid polygon covering the seed, so this null comes from
  // the seed-in-hole check in `pickFace` — the escape-guard tests live in the block below.
  it('returns null when the seed lies inside a solid wall', () => {
    expect(exactRegionAt({
      seed: { x: 0, y: 0 },
      walls: [[[-10, -10, 10, -10, 10, 10, -10, 10, -10, 2]]],
      hint: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
    })).toBeNull();
  });

  describe('escape guard', () => {
    it('rejects a face escaping through a gap in walls inside the working box', () => {
      expect(exactRegionAt({ seed: GAPPED_SEED, walls: gappedWalls(1), hint: GAPPED_HINT }))
        .toBeNull();
    });

    it('rejects the escaped face when walls are thicker than the box padding', () => {
      expect(exactRegionAt({ seed: GAPPED_SEED, walls: gappedWalls(3), hint: GAPPED_HINT }))
        .toBeNull();
    });

    it('rejects the escaped face when a long bounding wall stretches the frame', () => {
      expect(exactRegionAt({ seed: GAPPED_SEED, walls: gappedWalls(3, 60), hint: GAPPED_HINT }))
        .toBeNull();
    });
  });
});
