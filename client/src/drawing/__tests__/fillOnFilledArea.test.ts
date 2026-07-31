import { describe, it, expect } from 'vitest';
import { selectFillWalls } from '../fillWalls';
import { decideFill, type FillCandidate, type FillDecision } from '../fillDecision';
import { resolveFill } from '../fill/resolveFill';
import type { PixelBuffer } from '../fill/maskBuffer';
import { pointInRings } from '../hitTest';
import { ringArea } from '../projectRings';
import { strokeOutlineRings } from '../outlineStroke';
import { shapePoints } from '../../tools/shapeGeometry';

/**
 * CPU replica of StrokeRenderer.fillTarget's region stage at frameScale 1:
 * selectFillWalls -> even-odd painter's-order rasterizer (renderWallMask's contract:
 * walls painted in array order, later walls overwrite, RGB = index+1 little-endian)
 * -> resolveFill -> decideFill.
 *
 * Regression scenarios for clicks on already-filled area. Background fills are paint, never
 * walls, so targeting is deliberately colour-blind: the old colour-dependent wall set made a
 * differently-coloured parent fill smother the flood seed with ink, turning a click inside a
 * sub-shape into a recolor of the whole parent fill.
 */

const W = 80;
const H = 60;

function rasterizeWalls(walls: readonly number[][][]): PixelBuffer {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let top = -1;
      for (let i = 0; i < walls.length; i++) {
        if (pointInRings(x + 0.5, y + 0.5, walls[i]!)) top = i;
      }
      if (top < 0) continue;
      const packed = top + 1;
      const o = (y * W + x) * 4;
      data[o] = packed & 255;
      data[o + 1] = (packed >> 8) & 255;
      data[o + 2] = (packed >> 16) & 255;
      data[o + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

interface Item {
  id: string;
  background?: boolean;
  rings: number[][];
}

function decideAt(items: readonly Item[], seed: { x: number; y: number }): FillDecision {
  const walls = selectFillWalls(
    items.map((i) => ({ stroke: { background: i.background ?? false }, rings: i.rings })),
  );
  const buffer = rasterizeWalls(walls);
  // wallRings: [] keeps resolveFill on the traced-contour path; the exact-stage rebuild has its
  // own suites under fill/__tests__ — this one pins which region is found and what a click targets.
  const resolved = resolveFill({
    source: { buffer, wallRings: [] },
    seedPx: seed,
    frameScale: 1,
  });
  const candidates: FillCandidate[] = items.map((i) => ({
    id: i.id, isBackground: !!i.background, frameRings: i.rings,
  }));
  return decideFill(seed, resolved?.rings ?? null, candidates);
}

// Shape A: closed rectangle outline (6,6)-(70,50), pen 4 -> hole 8..68 x 8..48
const aOutline = strokeOutlineRings(
  shapePoints('rectangle', { x: 6, y: 6 }, { x: 70, y: 50 }), 4, true,
);
// Shape B: smaller closed rectangle drawn inside A, hole 26..50 x 20..38
const bOutline = strokeOutlineRings(
  shapePoints('rectangle', { x: 24, y: 18 }, { x: 52, y: 40 }), 4, true,
);
// A's committed paint-bucket fill: its whole interior
const A_FILL_RINGS = [[8, 8, 68, 8, 68, 48, 8, 48]];

const INSIDE_B = { x: 38, y: 29 };

describe('paint bucket on already-filled area', () => {
  it('control: a click inside a plain outlined shape floods its interior', () => {
    const decision = decideAt([{ id: 'a-outline', rings: aOutline }], INSIDE_B);
    expect(decision.kind).toBe('fill');
  });

  it('fills sub-shape B drawn on a differently-coloured filled A', () => {
    const items: Item[] = [
      { id: 'a-outline', rings: aOutline },
      { id: 'a-fill', background: true, rings: A_FILL_RINGS },
      { id: 'b-outline', rings: bOutline },
    ];
    const decision = decideAt(items, INSIDE_B);
    expect(decision.kind).toBe('fill');
    if (decision.kind !== 'fill') return;
    // region is B's interior (~24x18), not A's (~60x40)
    expect(ringArea(decision.rings[0]!)).toBeLessThan(30 * 24);
    expect(ringArea(decision.rings[0]!)).toBeGreaterThan(15 * 10);
  });

  it('recolors the existing fill on a repeat click instead of stacking a duplicate', () => {
    const outlineOnly: Item[] = [{ id: 'a-outline', rings: aOutline }];
    const first = decideAt(outlineOnly, INSIDE_B);
    expect(first.kind).toBe('fill');
    if (first.kind !== 'fill') return;
    const filled: Item[] = [
      ...outlineOnly,
      { id: 'a-fill', background: true, rings: first.rings },
    ];
    expect(decideAt(filled, INSIDE_B)).toEqual({ kind: 'recolorRegion', fillId: 'a-fill' });
  });
});
