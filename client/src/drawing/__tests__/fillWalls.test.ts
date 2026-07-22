import { describe, it, expect } from 'vitest';
import { selectFillWalls, type WallCandidate } from '../fillWalls';
import type { Color } from '@shared/stroke';

const BLACK: Color = { r: 0, g: 0, b: 0, a: 255 };
const RED: Color = { r: 255, g: 0, b: 0, a: 255 };

function candidate(color: Color, background: boolean, ringTag: number): WallCandidate {
  return { stroke: { color, background }, rings: [[ringTag]] };
}

describe('selectFillWalls', () => {
  it('keeps a same-colour outline as a wall (fill a shape with its own outline colour)', () => {
    const walls = selectFillWalls([candidate(BLACK, false, 1)], BLACK);
    expect(walls).toEqual([[[1]]]); // outline still bounds the region
  });

  it('excludes a same-colour background fill so a same-colour fill merges into it', () => {
    const walls = selectFillWalls([candidate(BLACK, true, 1)], BLACK);
    expect(walls).toEqual([]);
  });

  it('keeps different-colour strokes regardless of type', () => {
    const items = [candidate(RED, false, 1), candidate(RED, true, 2)];
    expect(selectFillWalls(items, BLACK)).toEqual([[[1]], [[2]]]);
  });
});
