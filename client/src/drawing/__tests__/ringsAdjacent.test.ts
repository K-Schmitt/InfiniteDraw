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
});
