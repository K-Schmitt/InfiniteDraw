import { describe, it, expect } from 'vitest';
import { frameToAnchor } from '../worldAnchor';
import { projectToFrame, CULLED, type ProjCamera } from '../viewProject';

const cam = (level: number, cx: bigint, cy: bigint, sx = 0, sy = 0): ProjCamera =>
  ({ level, cell: { x: cx, y: cy }, sub: { x: sx, y: sy } });

describe('frameToAnchor round-trip', () => {
  it('frame → anchor → frame is identity within a level', () => {
    const camera = cam(5, 100n, -3n, 12.5, 7.25);
    const { anchor, lx, ly } = frameToAnchor(1000.5, -250.25, camera);
    const back = projectToFrame(anchor, lx, ly, camera);
    expect(back).not.toBe(CULLED);
    expect((back as { fx: number }).fx).toBeCloseTo(1000.5, 6);
    expect((back as { fy: number }).fy).toBeCloseTo(-250.25, 6);
  });

  it('keeps local coords within [0, LOCAL_SPAN)', () => {
    const { lx, ly } = frameToAnchor(200000.75, -5.5, cam(2, 0n, 0n));
    expect(lx).toBeGreaterThanOrEqual(0);
    expect(lx).toBeLessThan(65536);
    expect(ly).toBeGreaterThanOrEqual(0);
    expect(ly).toBeLessThan(65536);
  });
});
