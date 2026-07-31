import { describe, it, expect } from 'vitest';
import { strokeOutlineRings } from '../outlineStroke';
import { pointInRings } from '../hitTest';

function ellipsePoints(
  center: { x: number; y: number },
  rx: number,
  ry: number,
): { x: number; y: number }[] {
  const pts = Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2;
    return { x: center.x + rx * Math.cos(a), y: center.y + ry * Math.sin(a) };
  });
  return [...pts, { ...pts[0]! }];
}

function bbox(ring: number[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]!);
    maxX = Math.max(maxX, ring[i]!);
    minY = Math.min(minY, ring[i + 1]!);
    maxY = Math.max(maxY, ring[i + 1]!);
  }
  return { minX, minY, maxX, maxY };
}

describe('strokeOutlineRings — line', () => {
  it('makes a uniform-width quad along the segment', () => {
    const rings = strokeOutlineRings([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10, false);
    expect(rings).toHaveLength(1);
    const b = bbox(rings[0]!);
    expect(b.minY).toBeCloseTo(-5); // half-width on each side
    expect(b.maxY).toBeCloseTo(5);
    expect(b.minX).toBeCloseTo(0);
    expect(b.maxX).toBeCloseTo(100);
  });
});

describe('strokeOutlineRings — closed rectangle', () => {
  const rect = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 60 },
    { x: 0, y: 60 },
    { x: 0, y: 0 },
  ];
  it('returns an outer ring and an inner hole', () => {
    const rings = strokeOutlineRings(rect, 10, true);
    expect(rings).toHaveLength(2);
    const outer = bbox(rings[0]!);
    const inner = bbox(rings[1]!);
    // outer expands by half-width, inner shrinks by half-width → sharp 90° corners
    expect(outer.minX).toBeCloseTo(-5);
    expect(outer.maxX).toBeCloseTo(105);
    expect(inner.minX).toBeCloseTo(5);
    expect(inner.maxX).toBeCloseTo(95);
    expect(rings[0]).toHaveLength(8); // 4 corners, no rounding
  });

  it('produces the same frame regardless of drag winding', () => {
    const reversed = rect.slice().reverse();
    const rings = strokeOutlineRings(reversed, 10, true);
    expect(rings).toHaveLength(2);
    const outer = bbox(rings[0]!);
    const inner = bbox(rings[1]!);
    expect(outer.minX).toBeCloseTo(-5); // outer still expands
    expect(inner.minX).toBeCloseTo(5); // inner still shrinks (not swapped/solid)
  });
});

describe('strokeOutlineRings — pen wider than the shape', () => {
  const smallRect = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 12 },
    { x: 0, y: 12 },
    { x: 0, y: 0 },
  ];

  // A 40-wide pen on a 20×12 rectangle offsets inward past the shape's own half-extent, so the
  // "inner" ring comes back turned inside-out. Emitting it as a hole punched a void through solid
  // ink — the shape must simply be solid once the pen is wider than it is.
  it('drops the inverted inner ring instead of punching a hole', () => {
    expect(strokeOutlineRings(smallRect, 40, true)).toHaveLength(1);
  });

  it('yields [outer] only when the pen dwarfs the shape', () => {
    expect(strokeOutlineRings(smallRect, 200, true)).toHaveLength(1);
  });

  it('keeps the hole while the pen still fits inside the shape', () => {
    expect(strokeOutlineRings(smallRect, 10, true)).toHaveLength(2);
  });

  // Exactly at the collapse the inner ring degenerates to a zero-area sliver — also not a hole.
  it('drops the inner ring at the exact collapse width', () => {
    expect(strokeOutlineRings(smallRect, 12, true)).toHaveLength(1);
  });

  it('drops the inverted inner ring for a non-convex-safe ellipse polygon too', () => {
    const ellipse = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return { x: 60 * Math.cos(a), y: 10 * Math.sin(a) };
    });
    // pen 30 > minor axis 20: the inward offset collapses across the short axis only
    expect(strokeOutlineRings([...ellipse, ellipse[0]!], 30, true)).toHaveLength(1);
  });
});

describe('strokeOutlineRings — concave shape', () => {
  // A U opening upward: arms 30 wide (x 0–30 and 70–100), base 20 tall (y 0–20).
  const u = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 70, y: 60 },
    { x: 70, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 60 }, { x: 0, y: 60 },
    { x: 0, y: 0 },
  ];

  it('keeps the hole while the pen fits everywhere along the outline', () => {
    expect(strokeOutlineRings(u, 8, true)).toHaveLength(2);
  });

  // A 24-wide pen eats the 20-tall base while the 30-wide arms survive, so the inward offset
  // folds: the notch floor lands at y=8, *below* the outer floor at y=12, and the ring crosses
  // itself. The fold strip is solid ink (covered from both the bottom edge and the notch floor)
  // and must never be punched out — but the arm hollows are real (arms 30 wide > pen 24) and
  // must survive as holes rather than vanish with the fold.
  it('trims a folded inner ring: keeps arm hollows, never punches ink', () => {
    const rings = strokeOutlineRings(u, 24, true);
    expect(pointInRings(50, 10, rings)).toBe(true); // fold strip stays solid ink
    expect(pointInRings(15, 30, rings)).toBe(false); // left arm hollow survives
    expect(pointInRings(85, 30, rings)).toBe(false); // right arm hollow survives
  });
});

describe('strokeOutlineRings — squashed ellipse (local tip inversion)', () => {
  // Tip curvature radius is ry²/rx (= 4 for 200×40), so ordinary pen widths locally invert a
  // few tip edges of the inward offset. The bad loops must be trimmed, not the whole hole:
  // deleting it renders the shape solid and the hollow interior reads as ink.
  it('200x40 ellipse at pen 12 keeps a hole containing the centre', () => {
    const rings = strokeOutlineRings(ellipsePoints({ x: 300, y: 300 }, 100, 20), 12, true);
    expect(rings.length).toBeGreaterThanOrEqual(2);
    expect(pointInRings(300, 300, rings)).toBe(false); // centre stays hollow
  });

  it('keeps the hole at every even pen width below the minor axis (40)', () => {
    const pts = ellipsePoints({ x: 300, y: 300 }, 100, 20);
    const dropped: number[] = [];
    for (let w = 2; w <= 38; w += 2) {
      if (strokeOutlineRings(pts, w, true).length < 2) dropped.push(w);
    }
    expect(dropped, `hole dropped at widths ${dropped}`).toEqual([]);
  });

  it('drops the hole once the pen reaches the minor axis', () => {
    const pts = ellipsePoints({ x: 300, y: 300 }, 100, 20);
    expect(strokeOutlineRings(pts, 40, true)).toHaveLength(1);
    expect(strokeOutlineRings(pts, 44, true)).toHaveLength(1);
  });

  it('100x100 circle keeps its hole at moderate pens', () => {
    const pts = ellipsePoints({ x: 300, y: 300 }, 50, 50);
    for (const w of [20, 60, 90]) {
      expect(strokeOutlineRings(pts, w, true), `width ${w}`).toHaveLength(2);
    }
  });
});

describe('strokeOutlineRings — closed triangle', () => {
  it('stays closed with 3 outer corners', () => {
    const tri = [
      { x: 50, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
      { x: 50, y: 0 },
    ];
    const rings = strokeOutlineRings(tri, 8, true);
    expect(rings).toHaveLength(2);
    expect(rings[0]).toHaveLength(6); // 3 corners
  });
});
