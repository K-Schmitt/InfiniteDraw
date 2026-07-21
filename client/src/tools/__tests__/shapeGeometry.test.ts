import { describe, it, expect } from 'vitest';
import { shapePoints } from '../shapeGeometry';

const A = { x: 0, y: 0 };
const B = { x: 10, y: 20 };

describe('shapePoints', () => {
  it('rectangle is a closed 4-corner loop', () => {
    const pts = shapePoints('rectangle', A, B);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual(pts[4]); // closed
    expect(pts).toContainEqual({ x: 10, y: 0 });
    expect(pts).toContainEqual({ x: 0, y: 20 });
  });

  it('triangle has an apex centered on the top edge', () => {
    const pts = shapePoints('triangle', A, B);
    expect(pts[0]).toEqual({ x: 5, y: 0 });
    expect(pts[0]).toEqual(pts[3]); // closed
  });

  it('ellipse samples lie on the inscribed ellipse', () => {
    const pts = shapePoints('ellipse', A, B);
    const cx = 5;
    const cy = 10;
    const rx = 5;
    const ry = 10;
    for (const p of pts) {
      const norm = ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2;
      expect(norm).toBeCloseTo(1, 5);
    }
  });
});
