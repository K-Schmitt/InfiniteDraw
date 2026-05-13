import { getStroke } from 'perfect-freehand';
import type { BrushStroke } from '@shared/stroke';
import type { Camera } from '@shared/camera';

const STROKE_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
} as const;

/**
 * Converts a BrushStroke into a flat polygon in *screen space*.
 *
 * stroke.size is in screen pixels (constant visual thickness regardless of zoom).
 * Points are projected from world space via the camera snapshot each call.
 * Intended to be called every frame for visible strokes.
 */
export function strokeToOutline(stroke: BrushStroke, camera: Camera): number[] {
  if (stroke.points.length < 2) return [];

  const { x: cx, y: cy, zoom } = camera;
  const input = stroke.points.map(
    (p, i) => [
      (p.x - cx) * zoom,
      (p.y - cy) * zoom,
      stroke.pressures[i] ?? 0.5,
    ] as [number, number, number],
  );

  return getStroke(input, { ...STROKE_OPTIONS, size: stroke.size }).flat();
}
