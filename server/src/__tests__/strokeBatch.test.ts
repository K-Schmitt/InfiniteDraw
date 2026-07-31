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

/**
 * A redone stroke must land back in the slot it already held. Stamping it with a fresh block
 * would float it above everything drawn since the undo — visible as a shape jumping to the front
 * of the stack after ctrl+Z, ctrl+Y.
 */
describe('applyBatchOrder with preserveOrder', () => {
  function at(id: string, zIndex: number): BrushStroke {
    return { ...stroke(id), zIndex };
  }

  it('keeps each stroke in the slot it already held', () => {
    const result = applyBatchOrder([at('a', 2), at('b', 5)], {
      nextZ: 9, ownerId: 'u1', preserveOrder: true,
    });
    expect(result.strokes.map((s) => s.zIndex)).toEqual([2, 5]);
    expect(result.nextZ).toBe(9);
  });

  it('still stamps the owner rather than trusting the client', () => {
    const incoming = { ...at('a', 2), ownerId: 'someone-else' };
    const result = applyBatchOrder([incoming], { nextZ: 9, ownerId: 'u1', preserveOrder: true });
    expect(result.strokes[0]!.ownerId).toBe('u1');
  });

  // The server hands out every zIndex it ever assigned below `nextZ`, so anything at or above it
  // was never issued here — a stale, forged or corrupted value that must not steer paint order.
  it('assigns a fresh slot to a zIndex this server never issued', () => {
    const result = applyBatchOrder([at('a', 900), at('b', -1)], {
      nextZ: 4, ownerId: 'u1', preserveOrder: true,
    });
    expect(result.strokes.map((s) => s.zIndex)).toEqual([4, 5]);
    expect(result.nextZ).toBe(6);
  });

  it('leaves the eraser path assigning a fresh contiguous block', () => {
    const result = applyBatchOrder([at('a', 2), at('b', 5)], { nextZ: 9, ownerId: 'u1' });
    expect(result.strokes.map((s) => s.zIndex)).toEqual([9, 10]);
  });
});
