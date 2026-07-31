import { describe, it, expect } from 'vitest';
import { clipFrameRingsToView, type FrameBox } from '../clipFrameRings';
import { pointInRings } from '../hitTest';
import { frameBboxOf, ringArea } from '../projectRings';

// A 1280×720 viewport at frac 0 — frame (0,0) is its top-left pixel.
const VIEW: FrameBox = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

function box(minX: number, minY: number, maxX: number, maxY: number): number[] {
  return [minX, minY, maxX, minY, maxX, maxY, minX, maxY];
}

function totalArea(rings: readonly number[][]): number {
  return rings.reduce((sum, ring) => sum + ringArea(ring), 0);
}

function signedRingArea(ring: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    sum += ring[i]! * ring[j + 1]! - ring[j]! * ring[i + 1]!;
  }
  return sum / 2;
}

const VIEW_AREA = 1280 * 720;

describe('clipFrameRingsToView', () => {
  it('keeps the whole box when the camera sits inside solid ink', () => {
    const clipped = clipFrameRingsToView([box(-1e9, -1e9, 1e9, 1e9)], VIEW);
    expect(clipped).not.toBeNull();
    expect(totalArea(clipped!)).toBeCloseTo(VIEW_AREA, 0);
  });

  it('keeps nothing when the stroke is entirely off-screen', () => {
    expect(clipFrameRingsToView([box(1e6, 1e6, 2e6, 2e6)], VIEW)).toEqual([]);
  });

  it('returns null for an empty ring set so the caller can fall back', () => {
    expect(clipFrameRingsToView([], VIEW)).toBeNull();
  });

  // The residual bug: a wall crossing the viewport while the probe point (frame origin) sits in
  // the hollow. The old all-or-nothing test read "outside" and hid the whole stroke, so zooming
  // towards a wall made it vanish.
  describe('a huge closed shape whose wall crosses the viewport', () => {
    // An annulus far bigger than the screen: outer edge way off-view, inner edge at x = 400,
    // so ink covers x ≥ 400 and the hollow covers x < 400 — the frame origin included.
    const annulus = [box(-1e9, -1e9, 1e9, 1e9), box(-1e9, -1e9, 400, 1e9)];

    it('the single-point probe the renderer used reads "outside"', () => {
      expect(pointInRings(0, 0, annulus)).toBe(false);
    });

    it('clips to exactly the painted part of the viewport', () => {
      const clipped = clipFrameRingsToView(annulus, VIEW);
      expect(clipped).not.toBeNull();
      expect(clipped!.length).toBeGreaterThan(0);
      // ink from x=400 to the right edge, full height — not the whole view, not nothing
      expect(totalArea(clipped!)).toBeCloseTo((1280 - 400) * 720, 0);
      expect(frameBboxOf(clipped!)).toEqual({ minX: 400, minY: 0, maxX: 1280, maxY: 720 });
    });

    it('keeps the hollow empty when the wall is off to one side', () => {
      const offToTheSide = [box(-1e9, -1e9, 1e9, 1e9), box(-1e9, -1e9, 5000, 1e9)];
      expect(clipFrameRingsToView(offToTheSide, VIEW)).toEqual([]);
    });
  });

  // strokeToRings stores a FLATTENED MultiPolygon ([poly0outer, poly0hole, poly1outer, ...],
  // even-odd semantics). The clip must rebuild that nesting instead of treating every ring
  // after index 0 as a hole of ring 0.
  describe('flattened MultiPolygon inputs', () => {
    it('keeps a hole inside the view, wound opposite its outer', () => {
      const rings = [box(-1e6, -1e6, 1e6, 1e6), box(300, 200, 900, 500)];
      const clipped = clipFrameRingsToView(rings, VIEW);
      expect(clipped).not.toBeNull();
      expect(clipped!.length).toBe(2);
      expect(pointInRings(600, 350, clipped!)).toBe(false); // hole centre stays empty
      expect(pointInRings(100, 100, clipped!)).toBe(true); // ink stays ink
      // Opposite windings are what Pixi's GraphicsPath hole detection needs downstream.
      const signs = clipped!.map((r) => Math.sign(signedRingArea(r)));
      expect(signs[0]! * signs[1]!).toBe(-1);
    });

    it('keeps a disjoint second island instead of treating it as a hole', () => {
      const rings = [box(100, 100, 300, 300), box(500, 100, 700, 300)];
      const clipped = clipFrameRingsToView(rings, VIEW);
      expect(clipped).not.toBeNull();
      expect(pointInRings(200, 200, clipped!)).toBe(true);
      expect(pointInRings(600, 200, clipped!)).toBe(true);
      expect(totalArea(clipped!)).toBeCloseTo(2 * 200 * 200, 0);
    });

    it('keeps an island nested inside a hole as ink', () => {
      const rings = [box(50, 50, 1200, 700), box(200, 150, 1000, 600), box(400, 300, 800, 500)];
      expect(pointInRings(600, 400, rings)).toBe(true); // island IS ink in the stored geometry
      const clipped = clipFrameRingsToView(rings, VIEW);
      expect(clipped).not.toBeNull();
      expect(pointInRings(600, 400, clipped!)).toBe(true); // ...and must stay ink after the clip
      expect(pointInRings(300, 200, clipped!)).toBe(false); // the hole itself stays empty
    });
  });
});
