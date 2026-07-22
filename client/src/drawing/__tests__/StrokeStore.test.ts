import { describe, it, expect, beforeEach } from 'vitest';
import type { BrushStroke } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import { originAnchor, originBbox } from '@shared/anchor';
import { StrokeStore } from '../StrokeStore';

function makeStroke(id: string, points: Array<[number, number]>, size = 4): BrushStroke {
  return {
    id,
    type: StrokeType.BRUSH,
    color: { r: 0, g: 0, b: 0, a: 255 },
    size,
    points: points.map(([x, y]) => ({ x, y })),
    pressures: points.map(() => 0.5),
    layerId: 'default',
    createdAt: 0,
    anchor: originAnchor(),
    zIndex: 0,
    cellBbox: originBbox(),
  };
}

describe('StrokeStore', () => {
  let store: StrokeStore;

  beforeEach(() => {
    store = new StrokeStore();
  });

  it('adds, gets, and tracks size', () => {
    store.add(makeStroke('a', [[0, 0], [10, 0]]), []);
    expect(store.size).toBe(1);
    expect(store.get('a')?.stroke.id).toBe('a');
  });

  it('computes the anchor as the bbox centre', () => {
    const item = store.add(makeStroke('a', [[0, 0], [10, 0]], 4), []);
    // bbox = [-2,-2] .. [12,2]  → centre (5, 0)
    expect(item.anchorX).toBeCloseTo(5);
    expect(item.anchorY).toBeCloseTo(0);
  });

  it('removes strokes', () => {
    store.add(makeStroke('a', [[0, 0], [10, 0]]), []);
    store.remove('a');
    expect(store.size).toBe(0);
    expect(store.get('a')).toBeUndefined();
  });

  describe('queryRect', () => {
    beforeEach(() => {
      store.add(makeStroke('near', [[0, 0], [10, 0]]), []);
      store.add(makeStroke('far', [[1000, 1000]]), []);
    });

    it('returns only strokes whose bbox intersects the rect', () => {
      const ids1 = store.queryRect({ minX: -10, minY: -10, maxX: 20, maxY: 20 }).map((i) => i.stroke.id);
      expect(ids1).toEqual(['near']);
      const ids2 = store.queryRect({ minX: 990, minY: 990, maxX: 1010, maxY: 1010 }).map((i) => i.stroke.id);
      expect(ids2).toEqual(['far']);
    });

    it('returns both when the rect spans them', () => {
      const ids = store.queryRect({ minX: -10, minY: -10, maxX: 2000, maxY: 2000 }).map((i) => i.stroke.id).sort();
      expect(ids).toEqual(['far', 'near']);
    });

    it('returns nothing for an empty region', () => {
      expect(store.queryRect({ minX: 500, minY: 500, maxX: 600, maxY: 600 })).toEqual([]);
    });
  });
});
