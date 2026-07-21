import { describe, it, expect } from 'vitest';
import { enclosedRegionAt, ringsAdjacent } from '../fillRegion';
import { strokeOutlineRings } from '../outlineStroke';

const boxOutline = (a: number, b: number): number[][] =>
  strokeOutlineRings(
    [{ x: a, y: a }, { x: b, y: a }, { x: b, y: b }, { x: a, y: b }, { x: a, y: a }],
    6,
    true,
  );

const seg = (w: number, ax: number, ay: number, bx: number, by: number): number[][] =>
  strokeOutlineRings([{ x: ax, y: ay }, { x: bx, y: by }], w, false);

function frame(w: number, a: number, b: number): number[][][] {
  return [seg(w, a, a, b, a), seg(w, b, a, b, b), seg(w, b, b, a, b), seg(w, a, b, a, a)];
}

function extent(ring: number[]): number {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    min = Math.min(min, ring[i]!);
    max = Math.max(max, ring[i]!);
  }
  return max - min;
}

describe('enclosedRegionAt', () => {
  it('fills the interior enclosed by four separate lines', () => {
    const cell = enclosedRegionAt({ x: 50, y: 50 }, frame(10, 0, 100));
    expect(cell).not.toBeNull();
    expect(cell![0]!.length).toBeGreaterThanOrEqual(8);
  });

  it('fills only the innermost cell for nested frames', () => {
    const groups = [...frame(4, 0, 200), ...frame(4, 50, 150)];
    const cell = enclosedRegionAt({ x: 100, y: 100 }, groups);
    expect(cell).not.toBeNull();
    expect(extent(cell![0]!)).toBeLessThan(120); // inner (~100), not outer (~200)
  });

  it('a band between two nested frames is a face with a hole', () => {
    const groups = [...frame(4, 0, 200), ...frame(4, 50, 150)];
    const cell = enclosedRegionAt({ x: 25, y: 100 }, groups); // in the band, outside inner frame
    expect(cell).not.toBeNull();
    expect(cell!.length).toBe(2); // outer ring + one hole (the inner frame)
  });

  it('still fills at extreme zoom scales (tiny and huge world coords)', () => {
    for (const s of [1e-7, 1e7]) {
      const cell = enclosedRegionAt({ x: s / 2, y: s / 2 }, frame(s * 0.1, 0, s));
      expect(cell).not.toBeNull();
    }
  });

  it('returns null when the click is outside the frame', () => {
    expect(enclosedRegionAt({ x: 400, y: 400 }, frame(10, 0, 100))).toBeNull();
  });

  it('returns null for an open path (no enclosed region)', () => {
    const open = [seg(10, 0, 0, 100, 0)];
    expect(enclosedRegionAt({ x: 50, y: 50 }, open)).toBeNull();
  });
});

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
});
