import { describe, it, expect } from 'vitest';
import {
  pointInPolygon,
  pointInPointPolygon,
  pointInRings,
  distancePointToSegment,
  pointNearPolyline,
} from '../hitTest';

// unit square as a flat ring
const SQUARE = [0, 0, 10, 0, 10, 10, 0, 10];
const SQUARE_PTS = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('pointInPolygon', () => {
  it('detects interior and exterior points', () => {
    expect(pointInPolygon(5, 5, SQUARE)).toBe(true);
    expect(pointInPolygon(-1, 5, SQUARE)).toBe(false);
    expect(pointInPolygon(20, 20, SQUARE)).toBe(false);
  });
});

describe('pointInPointPolygon', () => {
  it('matches the flat-ring result for Point[] input', () => {
    expect(pointInPointPolygon(5, 5, SQUARE_PTS)).toBe(true);
    expect(pointInPointPolygon(15, 5, SQUARE_PTS)).toBe(false);
  });
});

describe('pointInRings (even-odd)', () => {
  it('treats an inner ring as a hole', () => {
    const outer = [0, 0, 10, 0, 10, 10, 0, 10];
    const hole = [3, 3, 7, 3, 7, 7, 3, 7];
    expect(pointInRings(1, 1, [outer, hole])).toBe(true); // in outer, outside hole
    expect(pointInRings(5, 5, [outer, hole])).toBe(false); // inside the hole
  });
});

describe('distancePointToSegment', () => {
  it('measures perpendicular and endpoint distances', () => {
    expect(distancePointToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3);
    expect(distancePointToSegment({ x: -4, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(4);
  });
});

describe('pointNearPolyline', () => {
  const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  it('respects the radius', () => {
    expect(pointNearPolyline({ x: 5, y: 2 }, path, 3)).toBe(true);
    expect(pointNearPolyline({ x: 5, y: 5 }, path, 3)).toBe(false);
  });
});
