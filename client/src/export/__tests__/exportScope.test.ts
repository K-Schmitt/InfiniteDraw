import { describe, it, expect } from 'vitest';
import { buildExportScope, referenceCamera, type ExportSource } from '../exportScope';
import type { Color } from '@shared/stroke';

const BLACK: Color = { r: 0, g: 0, b: 0, a: 255 };

function source(id: string, level: number, cell: [bigint, bigint], ring: number[]): ExportSource {
  return {
    id,
    anchor: { level, cell: { x: cell[0], y: cell[1] } },
    rings: [ring],
    color: BLACK,
    zIndex: 0,
    isBackground: false,
  };
}

describe('referenceCamera', () => {
  it('sits exactly on the reference cell with no sub-offset', () => {
    const cam = referenceCamera({ level: 3, cell: { x: 7n, y: -2n } });
    expect(cam).toEqual({ level: 3, cell: { x: 7n, y: -2n }, sub: { x: 0, y: 0 } });
  });
});

describe('buildExportScope', () => {
  const reference = { level: 0, cell: { x: 0n, y: 0n } };

  it('keeps a stroke anchored on the reference cell unchanged', () => {
    const scope = buildExportScope([source('a', 0, [0n, 0n], [0, 0, 10, 0, 10, 10])], reference);
    expect(scope.items).toHaveLength(1);
    expect(scope.items[0]!.rings[0]).toEqual([0, 0, 10, 0, 10, 10]);
    expect(scope.skipped).toBe(0);
  });

  it('computes the bounding box across every projected stroke', () => {
    const scope = buildExportScope(
      [
        source('a', 0, [0n, 0n], [0, 0, 10, 0, 10, 10]),
        source('b', 0, [1n, 0n], [0, 0, 5, 0, 5, 5]),
      ],
      reference,
    );
    expect(scope.bounds.minX).toBe(0);
    expect(scope.bounds.maxX).toBe(65536 + 5); // one LOCAL_SPAN east, plus the ring extent
  });

  // Note this `far` is at level 0 — the *same* level as `reference`. It is skipped purely on
  // BigInt cell distance (`coarser`'s `CULL = 2^53` check), not on a level gap: proof that
  // `skipped` counts both culling axes, not just "levels apart".
  it('counts strokes that fall outside the representable window', () => {
    const far = source('far', 0, [10n ** 30n, 0n], [0, 0, 1, 0, 1, 1]);
    const scope = buildExportScope([far], reference);
    expect(scope.items).toHaveLength(0);
    expect(scope.skipped).toBe(1);
  });

  it('returns a degenerate box when nothing is in range', () => {
    const scope = buildExportScope([], reference);
    expect(scope.items).toEqual([]);
    expect(scope.bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('never emits an infinite box when a surviving item has zero ring vertices', () => {
    const degenerate = source('deg', 0, [0n, 0n], []);
    const scope = buildExportScope([degenerate], reference);
    expect(scope.items).toHaveLength(1);
    expect(scope.bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });
});
