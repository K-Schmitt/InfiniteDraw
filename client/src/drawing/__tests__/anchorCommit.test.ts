import { describe, it, expect } from 'vitest';
import { commitAnchor } from '../anchorCommit';
import type { ProjCamera } from '../../coords/viewProject';

const cam = (level: number, cx: bigint, cy: bigint): ProjCamera =>
  ({ level, cell: { x: cx, y: cy }, sub: { x: 0, y: 0 } });

describe('commitAnchor', () => {
  it('anchors at the camera level and keeps local points in range', () => {
    const pts = [{ x: 100, y: 100 }, { x: 200, y: 250 }];
    const { anchor, localPoints, cellBbox } = commitAnchor(pts, cam(5, 3n, 3n));
    expect(anchor.level).toBe(5);
    for (const p of localPoints) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(65536);
    }
    expect(cellBbox.minX).toBeLessThanOrEqual(cellBbox.maxX);
  });

  it('coarsens to a level where the whole gesture fits in ONE cell (spec §3)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 200000, y: 0 }]; // > 3 cells wide at camera level 5
    const { anchor, localPoints, cellBbox } = commitAnchor(pts, cam(5, 0n, 0n));
    // must anchor coarser than the camera so the gesture fits a single cell…
    expect(anchor.level).toBeLessThan(5);
    // …and the enclosing bbox is exactly one cell.
    expect(cellBbox.maxX - cellBbox.minX).toBe(0n);
    expect(cellBbox.maxY - cellBbox.minY).toBe(0n);
    for (const p of localPoints) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(65536);
    }
  });

  it('keeps the anchor at the camera level when the gesture already fits one cell', () => {
    const pts = [{ x: 100, y: 100 }, { x: 500, y: 400 }];
    const { anchor } = commitAnchor(pts, cam(7, 2n, 9n));
    expect(anchor.level).toBe(7);
  });

  it('coarsens correctly across NEGATIVE cells (arithmetic >>1n floors toward -inf)', () => {
    // gesture on the -x/-y side of the origin, straddling cells (-2,-2)..(-1,-1) at level 5.
    // -2 >> 1n === -1 (floor), so both corners must converge to the level-4 cell (-1,-1).
    const pts = [{ x: -100000, y: -100000 }, { x: -10, y: -10 }];
    const { anchor, localPoints, cellBbox } = commitAnchor(pts, cam(5, 0n, 0n));
    expect(anchor.level).toBeLessThan(5);
    expect(anchor.cell.x).toBeLessThan(0n);
    expect(anchor.cell.y).toBeLessThan(0n);
    expect(cellBbox.maxX - cellBbox.minX).toBe(0n); // still one cell
    expect(cellBbox.maxY - cellBbox.minY).toBe(0n);
    for (const p of localPoints) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(65536);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(65536);
    }
  });
});
