import { getStroke } from 'perfect-freehand';
import type { BrushStroke } from '@shared/stroke';

const STROKE_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
} as const;

/**
 * Converts a BrushStroke's point+pressure data into a flat polygon outline
 * ready for PixiJS Graphics.poly().
 *
 * Returns [] if the stroke has fewer than 2 points.
 */
export function strokeToOutline(stroke: BrushStroke): number[] {
  if (stroke.points.length < 2) return [];

  const input = stroke.points.map(
    (p, i) => [p.x, p.y, stroke.pressures[i] ?? 0.5] as [number, number, number],
  );

  return getStroke(input, { ...STROKE_OPTIONS, size: stroke.size }).flat();
}
