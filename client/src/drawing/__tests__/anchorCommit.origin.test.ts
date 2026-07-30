import { describe, it, expect } from 'vitest';
import { anchorForPoints, commitAnchor } from '../anchorCommit';
import type { ProjCamera } from '../../coords/viewProject';

/** Camera straddling the origin — the state the app was in when it froze. */
const camera: ProjCamera = { level: 0, cell: { x: -1n, y: -1n }, sub: { x: 0, y: 0 } };

describe('anchorForPoints across the origin', () => {
  // Cell -1 and cell 0 are on opposite sides of the origin. BigInt `>>` is arithmetic, so
  // -1n >> 1n === -1n and 0n >> 1n === 0n: the two bounds can never meet, and the search loop
  // spun forever with the main thread pinned — a frozen tab with no error at all.
  it('terminates when the gesture spans the origin', { timeout: 2000 }, () => {
    const spanning = [{ x: -100, y: -100 }, { x: 100_000, y: 100_000 }];
    const anchor = anchorForPoints(spanning, camera);
    expect(Number.isFinite(anchor.level)).toBe(true);
  });

  it('commits a full stroke across the origin to finite geometry', { timeout: 2000 }, () => {
    const spanning = [{ x: -50_000, y: -50_000 }, { x: 0, y: 0 }, { x: 80_000, y: 80_000 }];
    const { anchor, localPoints, cellBbox } = commitAnchor(spanning, camera);
    expect(Number.isFinite(anchor.level)).toBe(true);
    for (const p of localPoints) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    expect(cellBbox.maxX >= cellBbox.minX).toBe(true);
  });

  it('still finds the tight enclosing cell when the gesture does not span the origin', () => {
    const tight = [{ x: 10, y: 10 }, { x: 20, y: 20 }];
    const anchor = anchorForPoints(tight, camera);
    expect(anchor.level).toBe(camera.level);
  });
});
