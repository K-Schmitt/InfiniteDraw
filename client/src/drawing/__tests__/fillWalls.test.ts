import { describe, it, expect } from 'vitest';
import { selectFillWalls, sameColor, type WallCandidate } from '../fillWalls';
import type { Color } from '@shared/stroke';

const BLACK: Color = { r: 0, g: 0, b: 0, a: 255 };
const RED: Color = { r: 255, g: 0, b: 0, a: 255 };

function candidate(background: boolean, ringTag: number): WallCandidate {
  return { stroke: { background }, rings: [[ringTag]] };
}

describe('selectFillWalls', () => {
  it('keeps every outline as a wall, so a shape can be filled with its own outline colour', () => {
    const items = [candidate(false, 1), candidate(false, 2)];
    expect(selectFillWalls(items)).toEqual([[[1]], [[2]]]);
  });

  it('excludes every background fill — fills are paint, not walls, whatever their colour', () => {
    const items = [candidate(true, 1), candidate(false, 2), candidate(true, 3)];
    expect(selectFillWalls(items)).toEqual([[[2]]]);
  });
});

describe('sameColor', () => {
  it('matches only exact rgba equality', () => {
    expect(sameColor(BLACK, { ...BLACK })).toBe(true);
    expect(sameColor(BLACK, RED)).toBe(false);
  });
});
