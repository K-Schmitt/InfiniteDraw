import { getStroke } from 'perfect-freehand';
import polygonClipping from 'polygon-clipping';
import type { BrushStroke, Point } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import { strokeOutlineRings } from './outlineStroke';

const STROKE_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
} as const;

/**
 * perfect-freehand uses absolute thresholds internally: it discards input points
 * within 3 units of the stroke end and clamps the per-point radius to ≥0.01.
 * Our world-space size is config.size / zoom, so past ~×10 it falls below those
 * walls and the outline gets truncated and garbled. We run perfect-freehand in a
 * normalized frame where the size is always NORMALIZED_SIZE, then scale the result
 * back to world space — the geometry comes out identical at every zoom level.
 */
const NORMALIZED_SIZE = 64;

type FreehandPoint = [number, number, number];

export function strokeToOutline(stroke: BrushStroke): number[] {
  if (stroke.points.length < 2 || !(stroke.size > 0)) return [];

  const scale = NORMALIZED_SIZE / stroke.size;
  const origin = stroke.points[0]!;
  const input = toFreehandInput(stroke, origin, scale);
  const raw = getStroke(input, { ...STROKE_OPTIONS, size: NORMALIZED_SIZE }).flat();
  return denormalizeOutline(raw, origin, scale);
}

// world points → normalized frame (origin-relative, scaled so size ≈ NORMALIZED_SIZE)
function toFreehandInput(stroke: BrushStroke, origin: Point, scale: number): FreehandPoint[] {
  return stroke.points.map((p, i) => [
    (p.x - origin.x) * scale,
    (p.y - origin.y) * scale,
    stroke.pressures[i] ?? 0.5,
  ]);
}

// normalized outline → world space (inverse of toFreehandInput)
function denormalizeOutline(outline: readonly number[], origin: Point, scale: number): number[] {
  const out = new Array<number>(outline.length);
  for (let i = 0; i < outline.length; i += 2) {
    out[i]     = outline[i]!     / scale + origin.x;
    out[i + 1] = outline[i + 1]! / scale + origin.y;
  }
  return out;
}

/**
 * Rings for the *in-progress* stroke, rebuilt every frame while the pointer is down.
 *
 * Deliberately skips the `polygonClipping.union` that `strokeToRings` performs: that union
 * exists to resolve a self-intersecting freehand outline into clean non-overlapping rings, and
 * it costs 20-60ms and climbing on a real scribble — per frame, on the drawing client only,
 * which is exactly what froze that window while the receiving one stayed smooth. The raw
 * outline rasterizes identically for a solid fill (overlaps are invisible in one opaque
 * colour), so the union is deferred to commit time where it runs once.
 */
export function strokeToPreviewRings(stroke: BrushStroke): number[][] {
  if (stroke.filled || stroke.type !== StrokeType.BRUSH) return strokeToRings(stroke);
  const outline = strokeToOutline(stroke);
  return outline.length >= 6 ? [outline] : [];
}

// filled → raw polygon; brush → organic perfect-freehand outline; line/shapes → exact geometric stroker
export function strokeToRings(stroke: BrushStroke): number[][] {
  if (stroke.filled) return filledPolygonRings(stroke);
  if (stroke.type !== StrokeType.BRUSH) return geometricRings(stroke);

  const outline = strokeToOutline(stroke);
  if (outline.length < 6) return [];

  const ring: [number, number][] = [];
  for (let i = 0; i < outline.length; i += 2) ring.push([outline[i]!, outline[i + 1]!]);
  ring.push([ring[0]![0], ring[0]![1]]); // close the ring for the clipper

  let result;
  try {
    result = polygonClipping.union([[ring]]);
  } catch {
    return [outline]; // degenerate geometry — fall back to the raw outline
  }

  const rings: number[][] = [];
  for (const poly of result) {
    for (const r of poly) {
      const flat: number[] = [];
      for (const [x, y] of r) flat.push(x, y);
      if (flat.length >= 6) rings.push(flat);
    }
  }
  return rings.length > 0 ? rings : [outline];
}

// lines stay open; rect/ellipse/triangle close the loop (first point repeated by the generators)
function geometricRings(stroke: BrushStroke): number[][] {
  const pts = stroke.points;
  if (pts.length < 2) return [];
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const closed = pts.length >= 4 && first.x === last.x && first.y === last.y;
  return strokeOutlineRings(pts, stroke.size, closed);
}

// outer ring from points + optional inner holes (e.g. erased-out regions)
function filledPolygonRings(stroke: BrushStroke): number[][] {
  if (stroke.points.length < 3) return [];
  const rings = [flattenPoints(stroke.points)];
  for (const hole of stroke.holes ?? []) {
    if (hole.length >= 3) rings.push(flattenPoints(hole));
  }
  return rings;
}

function flattenPoints(points: readonly { x: number; y: number }[]): number[] {
  const ring: number[] = [];
  for (const p of points) ring.push(p.x, p.y);
  return ring;
}

// local frame keeps coords near zero — float32-safe and precise at extreme zoom
export function projectToScreen(
  outline: readonly number[],
  origin: { readonly x: number; readonly y: number },
  zoom: number,
): number[] {
  const out = new Array<number>(outline.length);
  for (let i = 0; i < outline.length; i += 2) {
    out[i]     = (outline[i]!     - origin.x) * zoom;
    out[i + 1] = (outline[i + 1]! - origin.y) * zoom;
  }
  return out;
}
