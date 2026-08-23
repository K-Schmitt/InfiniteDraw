import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StrokeType, type BrushStroke } from '@shared/stroke.js';
import { originAnchor, originBbox } from '@shared/anchor.js';
import { StrokeJournal } from '../storage/StrokeJournal.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'idraw-auth-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

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

describe('journal authorship', () => {
  it('round-trips authorId through close/reopen', async () => {
    const path = join(dir, 'j.bin');
    const j1 = await StrokeJournal.open(path);
    await j1.appendStroke({ ...stroke('a'), authorId: 'ba-1' });
    await j1.appendStroke(stroke('b'));
    const j2 = await StrokeJournal.open(path);
    const byId = new Map(j2.load().map((s) => [s.id, s]));
    expect(byId.get('a')?.authorId).toBe('ba-1');
    expect(byId.get('b')?.authorId).toBeUndefined();
  });

  it('keeps pre-auth journals readable (v3 file, plain OP_ADD only)', async () => {
    const path = join(dir, 'legacy.bin');
    const j1 = await StrokeJournal.open(path);
    await j1.appendStroke(stroke('old'));
    const j2 = await StrokeJournal.open(path);
    expect(j2.load()).toHaveLength(1);
    expect(j2.load()[0]?.authorId).toBeUndefined();
  });

  it('preserves empty-string authorId (not falsy downgrade)', async () => {
    const path = join(dir, 'empty-author.bin');
    const j1 = await StrokeJournal.open(path);
    await j1.appendStroke({ ...stroke('c'), authorId: '' });
    const j2 = await StrokeJournal.open(path);
    const loaded = j2.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.authorId).toBe('');
  });
});
