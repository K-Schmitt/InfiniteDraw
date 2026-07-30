import { describe, it, expect } from 'vitest';
import { decideFill, type FillCandidate } from '../fillDecision';

// axis-aligned square as a flat ring, centred on (cx, cy)
function square(cx: number, cy: number, half: number): number[] {
  return [cx - half, cy - half, cx + half, cy - half, cx + half, cy + half, cx - half, cy + half];
}

const OUTER_FILL: FillCandidate = {
  id: 'fill-A',
  isBackground: true,
  frameRings: [square(0, 0, 100)],
};

describe('decideFill', () => {
  it('fills the inner region even when an outer background fill covers the click', () => {
    const innerRegion = [square(0, 0, 10)];
    const decision = decideFill({ x: 0, y: 0 }, innerRegion, [OUTER_FILL]);
    expect(decision).toEqual({ kind: 'fill', rings: innerRegion });
  });

  it('recolors the existing fill when the region matches it', () => {
    const sameRegion = [square(0, 0, 100)];
    const decision = decideFill({ x: 0, y: 0 }, sameRegion, [OUTER_FILL]);
    expect(decision).toEqual({ kind: 'recolorRegion', fillId: 'fill-A' });
  });

  it('recolors a stroke when the click is on it and no region encloses the point', () => {
    const outline: FillCandidate = {
      id: 'line-1',
      isBackground: false,
      frameRings: [square(0, 0, 5)],
    };
    expect(decideFill({ x: 0, y: 0 }, null, [outline]))
      .toEqual({ kind: 'recolorStroke', strokeId: 'line-1' });
  });

  it('prefers the smallest stroke under the point', () => {
    const big: FillCandidate = { id: 'big', isBackground: false, frameRings: [square(0, 0, 50)] };
    const small: FillCandidate = { id: 'sm', isBackground: false, frameRings: [square(0, 0, 5)] };
    expect(decideFill({ x: 0, y: 0 }, null, [big, small]))
      .toEqual({ kind: 'recolorStroke', strokeId: 'sm' });
  });

  it('returns none on empty open canvas', () => {
    expect(decideFill({ x: 0, y: 0 }, null, [])).toEqual({ kind: 'none' });
  });

  it('ignores a background fill that does not cover the seed', () => {
    const far: FillCandidate = {
      id: 'fill-B',
      isBackground: true,
      frameRings: [square(1000, 1000, 100)],
    };
    const region = [square(0, 0, 100)];
    expect(decideFill({ x: 0, y: 0 }, region, [far])).toEqual({ kind: 'fill', rings: region });
  });
});
