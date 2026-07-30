import { describe, it, expect } from 'vitest';
import {
  simplifyRing, simplifyRegion, fitVertexBudget, MAX_FILL_VERTICES,
} from '../simplifyRing';

/**
 * A staircase approximating a diagonal — the shape a raster trace actually produces. Closed with
 * a return leg so it is a *ring*, not an open polyline: DP on an open near-straight polyline
 * collapses to its two endpoints and exercises a path `simplifyRing` never sees in production.
 */
function staircase(steps: number): number[] {
  const ring: number[] = [];
  for (let i = 0; i < steps; i++) ring.push(i, i, i + 1, i);
  ring.push(steps, -steps);
  return ring;
}

describe('simplifyRing', () => {
  it('collapses a staircase to its endpoints', () => {
    expect(simplifyRing(staircase(50), 2).length).toBeLessThan(12);
  });

  it('keeps a genuine corner', () => {
    const corner = [0, 0, 10, 0, 10, 10];
    expect(simplifyRing(corner, 0.5)).toEqual(corner);
  });

  it('never returns fewer than 3 points for a real ring', () => {
    expect(simplifyRing([0, 0, 10, 0, 10, 10, 0, 10], 1000).length).toBeGreaterThanOrEqual(6);
  });

  it('passes through rings that are already minimal', () => {
    expect(simplifyRing([0, 0, 1, 0, 1, 1], 0.5)).toEqual([0, 0, 1, 0, 1, 1]);
  });
});

describe('fitVertexBudget', () => {
  it('leaves a small region untouched', () => {
    const region = { outer: [0, 0, 10, 0, 10, 10, 0, 10], holes: [] };
    expect(fitVertexBudget(region, 1).outer).toHaveLength(8);
  });

  it('forces a huge region under the budget', () => {
    const region = { outer: staircase(4000), holes: [] };
    const fitted = fitVertexBudget(region, 1);
    const total = fitted.outer.length / 2 + fitted.holes.reduce((n, h) => n + h.length / 2, 0);
    expect(total).toBeLessThanOrEqual(MAX_FILL_VERTICES);
  });

  it('simplifies holes along with the outer ring', () => {
    const region = { outer: staircase(200), holes: [staircase(200)] };
    const fitted = simplifyRegion(region, 4);
    expect(fitted.holes[0]!.length).toBeLessThan(400);
  });
});
