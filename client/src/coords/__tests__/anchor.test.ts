import { describe, it, expect } from 'vitest';
import { cellKey, LOCAL_SPAN, LOCAL_SPAN_N, type CellAnchor } from '@shared/anchor';

describe('anchor', () => {
  it('exposes the locked span constants', () => {
    expect(LOCAL_SPAN).toBe(65536);
    expect(LOCAL_SPAN_N).toBe(65536n);
  });
  it('builds a stable, collision-free cell key', () => {
    expect(cellKey(3, 10n, -4n)).toBe('3:10:-4');
    expect(cellKey(3, 10n, -4n)).not.toBe(cellKey(3, -10n, 4n));
  });
  it('accepts a CellAnchor shape', () => {
    const a: CellAnchor = { level: 0, cell: { x: 0n, y: 0n } };
    expect(a.cell.x).toBe(0n);
  });
});
