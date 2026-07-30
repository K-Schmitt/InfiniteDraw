import { describe, it, expect } from 'vitest';
import { StrokeType, type BrushStroke } from '@shared/stroke.js';
import { originAnchor, originBbox } from '@shared/anchor.js';
import { toWireStroke } from '@shared/wireStroke.js';
import { applyBatchOrder } from '../batchOrder.js';

function stroke(id: string): BrushStroke {
  return {
    id,
    type: StrokeType.BRUSH,
    color: { r: 0, g: 0, b: 0, a: 255 },
    size: 1,
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    pressures: [1, 1],
    layerId: 'default',
    createdAt: 0,
    anchor: originAnchor(),
    zIndex: 0,
    cellBbox: originBbox(),
  };
}

describe('applyBatchOrder', () => {
  it('assigns a contiguous zIndex block and returns the next counter', () => {
    const result = applyBatchOrder([stroke('a'), stroke('b')], { nextZ: 7, ownerId: 'u1' });
    expect(result.strokes.map((s) => s.zIndex)).toEqual([7, 8]);
    expect(result.nextZ).toBe(9);
  });

  it('stamps the owner on every stroke', () => {
    const result = applyBatchOrder([stroke('a')], { nextZ: 0, ownerId: 'u1' });
    expect(result.strokes[0]!.ownerId).toBe('u1');
  });

  it('handles an empty batch without moving the counter', () => {
    const result = applyBatchOrder([], { nextZ: 3, ownerId: 'u1' });
    expect(result).toEqual({ strokes: [], nextZ: 3 });
  });

  it('produces wire-safe strokes', () => {
    const result = applyBatchOrder([stroke('a')], { nextZ: 0, ownerId: 'u1' });
    expect(() => JSON.stringify(toWireStroke(result.strokes[0]!))).not.toThrow();
  });
});
