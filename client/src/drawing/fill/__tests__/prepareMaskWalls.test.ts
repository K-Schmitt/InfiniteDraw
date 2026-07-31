import { describe, it, expect } from 'vitest';
import { prepareMaskWalls, type WallPrepView } from '../prepareMaskWalls';
import { paddedMaskLayout, maskFrameBox } from '../maskLayout';
import { ringsToFrame } from '../../projectRings';
import type { ProjCamera } from '../../../coords/viewProject';

/**
 * Regression (deep zoom S1/S2/S3): fillTarget used to hand raw ringsToFrame output straight to
 * renderWallMask; past ~2^24 px the GPU's float32 vertex storage displaced wall crossings by
 * tens of pixels, so the mask disagreed with the (clipped, correct) on-screen render. Walls that
 * exceed the render path's own float32 limit must be clipped to the padded mask box first.
 */

const GAP = 40; // camera 40 levels below the anchor: frame radius = 2^40 px
const SPAN_N = 65536n; // LOCAL_SPAN
const SEGMENTS = 64;
const MAX_SPAN = 2 ** 22;

function circleRing(radius: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI * 2;
    out.push(radius * Math.cos(t), radius * Math.sin(t));
  }
  return out;
}

/** Camera whose frame origin sits on the midpoint of the circle's first chord (edge 0 -> 1). */
function cameraOnEdge(): ProjCamera {
  const alpha = (2 * Math.PI) / SEGMENTS;
  const ox = BigInt(Math.round(((1 + Math.cos(alpha)) / 2) * 2 ** GAP)) - 800n;
  const oy = BigInt(Math.round((Math.sin(alpha) / 2) * 2 ** GAP));
  return {
    level: GAP,
    cell: { x: ox / SPAN_N, y: oy / SPAN_N },
    sub: { x: Number(ox % SPAN_N), y: Number(oy % SPAN_N) },
  };
}

function view(): WallPrepView {
  const layout = paddedMaskLayout(1512, 945);
  return { box: maskFrameBox(layout, 1), frameScale: 1, maxScreenSpanPx: MAX_SPAN };
}

function giantWall(): number[][] {
  const anchor = { level: 0, cell: { x: 0n, y: 0n } };
  const rings = ringsToFrame(anchor, [circleRing(1)], cameraOnEdge());
  expect(rings).not.toBeNull();
  return rings!;
}

describe('prepareMaskWalls', () => {
  it('passes a viewport-sized wall through untouched (same reference)', () => {
    const wall = [[0, 0, 100, 0, 100, 100, 0, 100]];
    expect(prepareMaskWalls([wall], view())[0]).toBe(wall);
  });

  it('clips an oversized wall down to float32-safe, in-box coordinates', () => {
    const wall = giantWall();
    let maxAbs = 0;
    for (const v of wall[0]!) maxAbs = Math.max(maxAbs, Math.abs(v));
    expect(maxAbs).toBeGreaterThan(MAX_SPAN); // premise: the raw projection is unsafe

    const v = view();
    const [prepared] = prepareMaskWalls([wall], v);
    expect(prepared).not.toBe(wall);
    expect(prepared!.length).toBeGreaterThan(0);
    let worstQuant = 0;
    for (const ring of prepared!) {
      for (let i = 0; i < ring.length; i += 2) {
        expect(ring[i]!).toBeGreaterThanOrEqual(v.box.minX - 1);
        expect(ring[i]!).toBeLessThanOrEqual(v.box.maxX + 1);
        expect(ring[i + 1]!).toBeGreaterThanOrEqual(v.box.minY - 1);
        expect(ring[i + 1]!).toBeLessThanOrEqual(v.box.maxY + 1);
        worstQuant = Math.max(
          worstQuant,
          Math.abs(Math.fround(ring[i]!) - ring[i]!),
          Math.abs(Math.fround(ring[i + 1]!) - ring[i + 1]!),
        );
      }
    }
    expect(worstQuant).toBeLessThan(1e-3); // sub-milli-pixel once clipped
  });

  it('keeps wall indices aligned with the original array', () => {
    const a = [[0, 0, 10, 0, 10, 10, 0, 10]];
    const b = giantWall();
    const c = [[50, 50, 60, 50, 60, 60, 50, 60]];
    const out = prepareMaskWalls([a, b, c], view());
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(a);
    expect(out[1]).not.toBe(b);
    expect(out[2]).toBe(c);
  });

  it('falls back to the unclipped rings when the clip fails', () => {
    // Non-finite coords: span check trips, clipFrameRingsToView cannot build a scaling frame
    // and returns null — the wall must still be painted best-effort, as before.
    const broken = [[Infinity, 0, 0, 0, 0, Infinity]];
    expect(prepareMaskWalls([broken], view())[0]).toBe(broken);
  });
});
