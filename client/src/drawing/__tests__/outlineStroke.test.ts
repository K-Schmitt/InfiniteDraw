import { describe, it, expect } from 'vitest';
import { strokeOutlineRings } from '../outlineStroke';

function bbox(ring: number[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]!);
    maxX = Math.max(maxX, ring[i]!);
    minY = Math.min(minY, ring[i + 1]!);
    maxY = Math.max(maxY, ring[i + 1]!);
  }
  return { minX, minY, maxX, maxY };
}

describe('strokeOutlineRings — line', () => {
  it('makes a uniform-width quad along the segment', () => {
    const rings = strokeOutlineRings([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10, false);
    expect(rings).toHaveLength(1);
    const b = bbox(rings[0]!);
    expect(b.minY).toBeCloseTo(-5); // half-width on each side
    expect(b.maxY).toBeCloseTo(5);
    expect(b.minX).toBeCloseTo(0);
    expect(b.maxX).toBeCloseTo(100);
  });
});

describe('strokeOutlineRings — closed rectangle', () => {
  const rect = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 60 },
    { x: 0, y: 60 },
    { x: 0, y: 0 },
  ];
  it('returns an outer ring and an inner hole', () => {
    const rings = strokeOutlineRings(rect, 10, true);
    expect(rings).toHaveLength(2);
    const outer = bbox(rings[0]!);
    const inner = bbox(rings[1]!);
    // outer expands by half-width, inner shrinks by half-width → sharp 90° corners
    expect(outer.minX).toBeCloseTo(-5);
    expect(outer.maxX).toBeCloseTo(105);
    expect(inner.minX).toBeCloseTo(5);
    expect(inner.maxX).toBeCloseTo(95);
    expect(rings[0]).toHaveLength(8); // 4 corners, no rounding
  });

  it('produces the same frame regardless of drag winding', () => {
    const reversed = rect.slice().reverse();
    const rings = strokeOutlineRings(reversed, 10, true);
    expect(rings).toHaveLength(2);
    const outer = bbox(rings[0]!);
    const inner = bbox(rings[1]!);
    expect(outer.minX).toBeCloseTo(-5); // outer still expands
    expect(inner.minX).toBeCloseTo(5); // inner still shrinks (not swapped/solid)
  });
});

describe('strokeOutlineRings — closed triangle', () => {
  it('stays closed with 3 outer corners', () => {
    const tri = [
      { x: 50, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
      { x: 50, y: 0 },
    ];
    const rings = strokeOutlineRings(tri, 8, true);
    expect(rings).toHaveLength(2);
    expect(rings[0]).toHaveLength(6); // 3 corners
  });
});
