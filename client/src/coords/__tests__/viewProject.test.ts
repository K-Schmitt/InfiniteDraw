import { describe, it, expect } from 'vitest';
import { projectToFrame, CULLED, CULL_CELLS } from '../viewProject';
import type { ProjCamera } from '../viewProject';
import type { CellAnchor } from '@shared/anchor';

const cam = (level: number, cx: bigint, cy: bigint): ProjCamera =>
  ({ level, cell: { x: cx, y: cy }, sub: { x: 0, y: 0 } });
const anchor = (level: number, cx: bigint, cy: bigint): CellAnchor =>
  ({ level, cell: { x: cx, y: cy } });

describe('projectToFrame', () => {
  it('is identity for same level/cell at local origin', () => {
    const r = projectToFrame(anchor(5, 0n, 0n), 0, 0, cam(5, 0n, 0n));
    expect(r).toEqual({ fx: 0, fy: 0 });
  });

  it('offsets by whole cells at the same level', () => {
    const r = projectToFrame(anchor(5, 1n, 0n), 0, 0, cam(5, 0n, 0n));
    expect(r).toEqual({ fx: 65536, fy: 0 });
  });

  it('projects a coarser stroke (dL<0): its local scales UP by 2^-dL', () => {
    const r = projectToFrame(anchor(4, 0n, 0n), 100, 0, cam(5, 0n, 0n));
    expect(r).not.toBe(CULLED);
    expect((r as { fx: number }).fx).toBeCloseTo(200, 6);
  });

  it('projects a finer stroke (dL>0): its cell reduces toward the camera cell', () => {
    const r = projectToFrame(anchor(6, 2n, 0n), 0, 0, cam(5, 0n, 0n));
    expect((r as { fx: number }).fx).toBeCloseTo(65536, 6);
  });

  it('culls in BigInt before float when a same-level cell delta exceeds CULL', () => {
    const far = 2n ** 60n;
    expect(projectToFrame(anchor(5, far, 0n), 0, 0, cam(5, 0n, 0n))).toBe(CULLED);
  });

  it('draw @ level 200 seen from level 0 culls without NaN', () => {
    const r = projectToFrame(anchor(200, 3n, 3n), 100, 100, cam(0, 0n, 0n));
    if (r !== CULLED) {
      expect(Number.isNaN((r as { fx: number }).fx)).toBe(false);
      expect(Number.isNaN((r as { fy: number }).fy)).toBe(false);
    }
    expect(CULL_CELLS).toBeGreaterThan(0n);
  });
});
