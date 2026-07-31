import { describe, it, expect } from 'vitest';
import { historyBroadcast } from '../historyBroadcast';
import type { RendererInstruction } from '../../state/CanvasState';
import type { BrushStroke, Color } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';

const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };

function stroke(id: string): BrushStroke {
  return {
    id,
    type: StrokeType.BRUSH,
    color: RED,
    size: 4,
    points: [{ x: 0, y: 0 }],
    pressures: [1],
    layerId: 'layer-0',
    zIndex: 0,
    createdAt: 0,
    anchor: { level: 0, cell: { x: 0n, y: 0n } },
    cellBbox: { minX: 0n, minY: 0n, maxX: 0n, maxY: 0n },
  };
}

describe('historyBroadcast', () => {
  it('sends nothing for a no-op step', () => {
    const ops = historyBroadcast([]);
    expect(ops).toEqual({ deletes: [], adds: [], recolors: [] });
  });

  it('turns an undone add into a delete', () => {
    expect(historyBroadcast([{ action: 'remove', strokeId: 's1' }]))
      .toEqual({ deletes: ['s1'], adds: [], recolors: [] });
  });

  it('keeps an erase step as one atomic delete+add batch', () => {
    const added = stroke('remnant');
    const instructions: RendererInstruction[] = [
      { action: 'remove', strokeId: 'erased' },
      { action: 'add', stroke: added },
    ];
    const ops = historyBroadcast(instructions);
    expect(ops.deletes).toEqual(['erased']);
    expect(ops.adds).toEqual([added]);
    expect(ops.recolors).toEqual([]);
  });

  // `stroke:recolor` carries a single colour, but undoing a paint-bucket restores each stroke's
  // own previous colour — so one step can need several messages, one per distinct colour.
  it('groups recolors by colour', () => {
    const ops = historyBroadcast([
      { action: 'recolor', strokeId: 'a', color: RED },
      { action: 'recolor', strokeId: 'b', color: BLUE },
      { action: 'recolor', strokeId: 'c', color: RED },
    ]);
    expect(ops.recolors).toEqual([
      { color: RED, ids: ['a', 'c'] },
      { color: BLUE, ids: ['b'] },
    ]);
  });
});
