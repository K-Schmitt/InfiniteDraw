import { it, expect } from 'vitest';
import { projectToFrame, type ProjCamera } from '../viewProject';
import type { CellAnchor } from '@shared/anchor';

it('projects 10k random anchors under one frame budget', () => {
  const cam: ProjCamera = { level: 8, cell: { x: 0n, y: 0n }, sub: { x: 0, y: 0 } };
  const anchors: CellAnchor[] = Array.from({ length: 10000 }, () => ({
    level: 5 + Math.floor(Math.random() * 8),
    cell: {
      x: BigInt(Math.floor((Math.random() - 0.5) * 1e6)),
      y: BigInt(Math.floor((Math.random() - 0.5) * 1e6)),
    },
  }));
  const t0 = performance.now();
  for (const a of anchors) projectToFrame(a, 100, 100, cam);
  const ms = performance.now() - t0;
  expect(ms).toBeLessThan(50); // 10k projections well under 16ms-per-frame headroom
});
