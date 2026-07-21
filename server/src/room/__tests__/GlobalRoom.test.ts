import { describe, it, expect, vi } from 'vitest';
import { GlobalRoom } from '../GlobalRoom.js';
import { StrokeType, type BrushStroke } from '@shared/stroke.js';

function fakeJournal() {
  return {
    load: () => [] as BrushStroke[],
    appendStroke: vi.fn(async () => {}),
    appendDelete: vi.fn(async () => {}),
  };
}

function brush(id: string): BrushStroke {
  return {
    id,
    type: StrokeType.BRUSH,
    color: { r: 0, g: 0, b: 0, a: 255 },
    size: 4,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    pressures: [1, 1],
    layerId: 'default',
    createdAt: 1,
  };
}

describe('GlobalRoom', () => {
  it('stores strokes and persists via journal', async () => {
    const journal = fakeJournal();
    const room = GlobalRoom.create(journal as never);
    await room.addStroke(brush('s1'));
    expect(room.snapshot().map((s) => s.id)).toEqual(['s1']);
    expect(journal.appendStroke).toHaveBeenCalledOnce();
    await room.deleteStroke('s1');
    expect(room.snapshot()).toHaveLength(0);
    expect(journal.appendDelete).toHaveBeenCalledOnce();
  });
});
