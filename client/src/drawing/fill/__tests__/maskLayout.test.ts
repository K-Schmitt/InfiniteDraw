import { describe, it, expect } from 'vitest';
import {
  paddedMaskLayout, maskSeedPx, maskFrameBox, ringToMaskPx, maskPxToFrame,
} from '../maskLayout';

describe('paddedMaskLayout', () => {
  it('pads half a viewport per side, matching the wall-selection box', () => {
    // Regression (S1): the mask used to be exactly viewport-sized, so walls selected by the
    // padded viewportFrameBox were cropped out and the flood escaped through the screen edge.
    const layout = paddedMaskLayout(800, 600);
    expect(layout).toEqual({ width: 1600, height: 1200, originPx: { x: -400, y: -300 } });
  });

  it('rounds fractional screen sizes up to whole pixels', () => {
    const layout = paddedMaskLayout(801.5, 599.25);
    expect(layout.width).toBe(802 + 2 * 401);
    expect(layout.height).toBe(600 + 2 * 300);
    expect(Number.isInteger(layout.originPx.x)).toBe(true);
    expect(Number.isInteger(layout.originPx.y)).toBe(true);
  });
});

describe('maskSeedPx', () => {
  it('floors: a click at screen x=6.7 seeds the free pixel 6, not a wall at 7', () => {
    // Regression (S1/S3 edge band): Math.round sent clicks in [i+0.5, i+1) to pixel i+1 —
    // on a wall pixel that killed the fill. Pixel i owns screen [i, i+1) (GL centre-sample).
    const seed = maskSeedPx({ frame: { x: 6.7, y: 2.4 }, frameScale: 1, originPx: { x: 0, y: 0 } });
    expect(seed).toEqual({ x: 6, y: 2 });
  });

  it('offsets by the pad so the seed lands in buffer coordinates', () => {
    const seed = maskSeedPx({
      frame: { x: 3.35, y: 1.2 },
      frameScale: 2,
      originPx: { x: -400, y: -300 },
    });
    expect(seed).toEqual({ x: 406, y: 302 });
  });
});

describe('maskFrameBox', () => {
  it('covers the padded buffer in camera-frame units', () => {
    const box = maskFrameBox(paddedMaskLayout(800, 600), 2);
    expect(box).toEqual({ minX: -200, minY: -150, maxX: 600, maxY: 450 });
  });
});

describe('ring conversion', () => {
  it('ringToMaskPx translates frame rings into buffer pixels', () => {
    const out = ringToMaskPx([1, 2, 3, 4], 2, { x: -10, y: -20 });
    expect(out).toEqual([12, 24, 16, 28]);
  });

  it('maskPxToFrame inverts ringToMaskPx', () => {
    const ring = [1.5, -2.25, 3, 4];
    const there = ringToMaskPx(ring, 2, { x: -10, y: -20 });
    const back = maskPxToFrame(there, 2, { x: -10, y: -20 });
    for (let i = 0; i < ring.length; i++) expect(back[i]).toBeCloseTo(ring[i]!, 12);
  });
});
