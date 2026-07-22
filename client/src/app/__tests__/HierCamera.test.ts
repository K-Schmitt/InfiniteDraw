import { describe, it, expect } from 'vitest';
import { HierCamera } from '../HierCamera';

describe('HierCamera carry', () => {
  it('carries sub over the high boundary exactly (positive)', () => {
    const c = new HierCamera();
    c.setSub(65536 + 40);
    c.carry();
    expect(c.projCamera.cell.x).toBe(1n);
    expect(c.projCamera.sub.x).toBe(40); // Sterbenz-exact
  });

  it('carries negative sub down a cell (bounded error)', () => {
    const c = new HierCamera();
    c.setSub(-0.1);
    c.carry();
    expect(c.projCamera.cell.x).toBe(-1n);
    expect(c.projCamera.sub.x).toBeCloseTo(65535.9, 4); // within ~2^-37
  });
});

describe('HierCamera zoom hysteresis', () => {
  it('does not thrash levels when oscillating on a boundary', () => {
    const c = new HierCamera();
    c.zoomBy(0.99, 0, 0);
    const level1 = c.projCamera.level;
    c.zoomBy(-0.01, 0, 0);
    c.zoomBy(0.01, 0, 0);
    expect(c.projCamera.level).toBe(level1); // no flip-flop
  });
});

describe('HierCamera zoom pivot invariance (within a level)', () => {
  it('keeps the world point under the pivot fixed on screen', () => {
    const c = new HierCamera();
    const pivotFx = 300, pivotFy = 120;
    const before = c.projCamera;
    // world point currently under the pivot, in absolute local units at this level:
    const absX = before.sub.x + pivotFx;
    const absY = before.sub.y + pivotFy;
    const screenBefore = c.frameToScreen(pivotFx, pivotFy);
    c.zoomBy(0.4, pivotFx, pivotFy); // 0.4 < 1 → stays in level, cell unchanged
    const after = c.projCamera;
    const screenAfter = c.frameToScreen(absX - after.sub.x, absY - after.sub.y);
    expect(screenAfter.x).toBeCloseTo(screenBefore.x, 6);
    expect(screenAfter.y).toBeCloseTo(screenBefore.y, 6);
  });
});
