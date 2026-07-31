import { describe, it, expect } from 'vitest';
import { resolveFillTarget } from '../fillTarget';
import { resolveFill } from '../resolveFill';
import type { PixelBuffer } from '../maskBuffer';
import type { FillCandidate } from '../../fillDecision';
import { pointInRings } from '../../hitTest';
import { ringArea } from '../../projectRings';
import { strokeOutlineRings } from '../../outlineStroke';
import { shapePoints } from '../../../tools/shapeGeometry';

/**
 * CPU stand-in for StrokeRenderer's raster stage at frameScale 1: even-odd painter's-order
 * rasterizer (renderWallMask's contract — walls painted in array order, later walls overwrite,
 * RGB = index + 1 little-endian) feeding the real `resolveFill`.
 *
 * `resolveFillTarget` itself is the production code path, injected with this resolver, so these
 * scenarios pin the real targeting rules rather than a replica of them.
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

function targetAt(candidates: readonly FillCandidate[], seed: { x: number; y: number }) {
  return resolveFillTarget({
    seed,
    candidates,
    // wallRings: [] keeps resolveFill on the traced-contour path; the exact stage has its own
    // suites — this one pins which region a click targets, not how its boundary is rebuilt.
    regionFor: (walls) => resolveFill({
      source: { buffer: rasterizeWalls(walls), wallRings: [] },
      seedPx: seed,
      frameScale: 1,
    })?.rings ?? null,
  });
}

function outline(id: string, from: { x: number; y: number }, to: { x: number; y: number },
  pen = 4): FillCandidate {
  return {
    id,
    isBackground: false,
    frameRings: strokeOutlineRings(shapePoints('rectangle', from, to), pen, true),
  };
}

/**
 * Parent shape A seen from *inside* its own contour: at deep zoom the pen band is wider than the
 * viewport, so A's ink covers every pixel on screen. Modelled as an annulus whose band swallows
 * the whole buffer — outer far outside it, hole far off to the side.
 */
const A_INSIDE_CONTOUR: FillCandidate = {
  id: 'a-outline',
  isBackground: false,
  frameRings: [
    [-1000, -1000, 1000, -1000, 1000, 1000, -1000, 1000],
    [200, 200, 400, 200, 400, 400, 200, 400],
  ],
};

// Shape B, drawn inside A's contour band: hole spans 26..50 x 20..38.
const B_OUTLINE = outline('b-outline', { x: 24, y: 18 }, { x: 52, y: 40 });
const INSIDE_B = { x: 38, y: 29 };

describe('resolveFillTarget inside a parent stroke\'s ink', () => {
  it('fills a shape drawn inside the parent contour instead of recoloring the contour', () => {
    const decision = targetAt([A_INSIDE_CONTOUR, B_OUTLINE], INSIDE_B);
    expect(decision.kind).toBe('fill');
    if (decision.kind !== 'fill') return;
    // B's interior (~24x18), nowhere near A's viewport-wide band.
    expect(ringArea(decision.rings[0]!)).toBeLessThan(30 * 24);
    expect(ringArea(decision.rings[0]!)).toBeGreaterThan(15 * 10);
  });

  it('still recolors the contour when the click is on ink that encloses nothing', () => {
    expect(targetAt([A_INSIDE_CONTOUR], INSIDE_B))
      .toEqual({ kind: 'recolorStroke', strokeId: 'a-outline' });
  });

  // The retry must not outrank a direct hit on a stroke that merely sits inside a closed shape:
  // clicking a line to recolor it is the whole point of the recolorStroke fallback.
  it('recolors a small stroke inside a closed shape rather than filling the shape', () => {
    const shape = outline('shape', { x: 6, y: 6 }, { x: 70, y: 50 });
    const line = outline('line', { x: 30, y: 24 }, { x: 44, y: 34 });
    // Seed on the line's own ink (its top edge band), inside the enclosing shape.
    const decision = targetAt([shape, line], { x: 37, y: 24 });
    expect(decision).toEqual({ kind: 'recolorStroke', strokeId: 'line' });
  });

  it('leaves an ordinary enclosed click on the normal fill path', () => {
    const shape = outline('shape', { x: 6, y: 6 }, { x: 70, y: 50 });
    expect(targetAt([shape], INSIDE_B).kind).toBe('fill');
  });

  it('returns none on an empty canvas', () => {
    expect(targetAt([], INSIDE_B)).toEqual({ kind: 'none' });
  });
});
