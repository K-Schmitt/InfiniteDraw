import { getStroke } from 'perfect-freehand';
import polygonClipping from 'polygon-clipping';
import type { BrushStroke } from '@shared/stroke';

const STROKE_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
} as const;

export function strokeToOutline(stroke: BrushStroke): number[] {
  if (stroke.points.length < 2) return [];

  const input = stroke.points.map(
    (p, i) => [p.x, p.y, stroke.pressures[i] ?? 0.5] as [number, number, number],
  );

  return getStroke(input, { ...STROKE_OPTIONS, size: stroke.size }).flat();
}

// polygon union resolves perfect-freehand's self-intersecting outline into outer ring + holes for closed shapes
export function strokeToRings(stroke: BrushStroke): number[][] {
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
