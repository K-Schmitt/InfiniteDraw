import { describe, it, expect } from 'vitest';
import { SpatialIndex } from '../SpatialIndex';
import type { ProjCamera } from '../../coords/viewProject';

const bbox = (x: bigint, y: bigint) => ({ minX: x, minY: y, maxX: x, maxY: y });
const cam = (level: number, cx: bigint, cy: bigint): ProjCamera =>
  ({ level, cell: { x: cx, y: cy }, sub: { x: 0, y: 0 } });

describe('SpatialIndex', () => {
  it('returns entries intersecting the viewport, not far ones', () => {
    const idx = new SpatialIndex();
    idx.insert('near', { level: 5, cell: { x: 0n, y: 0n } }, bbox(0n, 0n), 1);
    idx.insert('far', { level: 5, cell: { x: 10n ** 6n, y: 0n } }, bbox(10n ** 6n, 0n), 2);
    const hits = idx.queryViewport(cam(5, 0n, 0n), 4n).map((h) => h.id);
    expect(hits).toContain('near');
    expect(hits).not.toContain('far');
  });

  it('remove drops an entry', () => {
    const idx = new SpatialIndex();
    idx.insert('a', { level: 5, cell: { x: 0n, y: 0n } }, bbox(0n, 0n), 1);
    idx.remove('a');
    expect(idx.queryViewport(cam(5, 0n, 0n), 4n)).toHaveLength(0);
  });

  it('matches a finer-level entry whose coarsened cell hits the viewport', () => {
    const idx = new SpatialIndex();
    // level 6 cell (2,0) coarsens to level 5 cell (1,0) — within radius 4 of camera cell 0
    idx.insert('fine', { level: 6, cell: { x: 2n, y: 0n } }, bbox(2n, 0n), 1);
    const hits = idx.queryViewport(cam(5, 0n, 0n), 4n).map((h) => h.id);
    expect(hits).toContain('fine');
  });
});
