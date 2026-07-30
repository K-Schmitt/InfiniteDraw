import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StrokeJournal } from '../StrokeJournal.js';
import { StrokeType, type BrushStroke } from '@shared/stroke.js';
import { originAnchor, originBbox } from '@shared/anchor.js';

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
    anchor: originAnchor(),
    zIndex: 0,
    cellBbox: originBbox(),
  };
}

describe('StrokeJournal', () => {
  it('replays appended strokes minus deletes after reopen', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'idraw-'));
    const path = join(dir, 'room.idraw');
    const a = await StrokeJournal.open(path);
    await a.appendStroke(brush('s1'));
    await a.appendStroke(brush('s2'));
    await a.appendDelete('s1');

    const b = await StrokeJournal.open(path); // reopen → replay from disk
    const ids = b.load().map((s) => s.id);
    expect(ids).toEqual(['s2']);
    await rm(dir, { recursive: true, force: true });
  });
});
