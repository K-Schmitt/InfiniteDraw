import { describe, it, expect } from 'vitest';
import { ringsAdjacent } from '../ringsAdjacent';
import { strokeOutlineRings } from '../outlineStroke';

const boxOutline = (a: number, b: number): number[][] =>
  strokeOutlineRings(
    [{ x: a, y: a }, { x: b, y: a }, { x: b, y: b }, { x: a, y: b }, { x: a, y: a }],
    6,
    true,
  );

describe('ringsAdjacent', () => {
  it('is false for a small outline nested inside a larger one (gap between them)', () => {
    expect(ringsAdjacent(boxOutline(0, 200), boxOutline(80, 120))).toBe(false);
  });

  it('is true when two outlines overlap', () => {
    expect(ringsAdjacent(boxOutline(0, 100), boxOutline(90, 190))).toBe(true);
  });

  it('is true when two regions merely share an edge (fill touching its outline)', () => {
    const left = [[0, 0, 50, 0, 50, 50, 0, 50]];
    const right = [[50, 0, 100, 0, 100, 50, 50, 50]];
    expect(ringsAdjacent(left, right)).toBe(true);
  });

  it('scale-invariant: a shared edge stays adjacent whether the shapes are tiny or huge', () => {
    // Same relative geometry (touching at x=extent/2), extent growing 100x — the old
    // normalized-space tolerance shrank with extent and could flip this to false.
    for (const extent of [100, 1_000, 10_000, 100_000]) {
      const mid = extent / 2;
      const left = [[0, 0, mid, 0, mid, extent, 0, extent]];
      const right = [[mid, 0, extent, 0, extent, extent, mid, extent]];
      expect(ringsAdjacent(left, right)).toBe(true);
    }
  });

  it('scale-invariant: a real gap of a few units is rejected whether the shapes are tiny or huge', () => {
    // Same PHYSICAL gap (5 raw units) regardless of how large the shapes around it are.
    for (const extent of [100, 1_000, 10_000, 100_000]) {
      const mid = extent / 2;
      const left = [[0, 0, mid, 0, mid, extent, 0, extent]];
      const right = [[mid + 5, 0, extent, 0, extent, extent, mid + 5, extent]];
      expect(ringsAdjacent(left, right)).toBe(false);
    }
  });

  it('survives a sub-unit residual (anchor round-trip / simplification noise) at large extent', () => {
    // A same-colour fill and its bounding outline reconstructed through the real geometry
    // pipeline never land bit-exact; a fixed physical tolerance must absorb that regardless of
    // how large the drawing is.
    const extent = 20_000;
    const mid = extent / 2;
    const left = [[0, 0, mid, 0, mid, extent, 0, extent]];
    const right = [[mid + 0.3, 0, extent, 0, extent, extent, mid + 0.3, extent]];
    expect(ringsAdjacent(left, right)).toBe(true);
  });
});
