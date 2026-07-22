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

  it('spans multiple cells when the gesture is larger than a cell', () => {
    const pts = [{ x: 0, y: 0 }, { x: 200000, y: 0 }]; // > 3 cells wide
    const { cellBbox } = commitAnchor(pts, cam(5, 0n, 0n));
    expect(cellBbox.maxX - cellBbox.minX).toBeGreaterThanOrEqual(3n);
  });
});
