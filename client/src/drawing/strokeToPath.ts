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
 * Converts a BrushStroke into a flat polygon in *world space*.
 * stroke.size is in world units — the outline scales with camera zoom.
 * Computed once when a stroke is committed, then cached.
 */
export function strokeToOutline(stroke: BrushStroke): number[] {
  if (stroke.points.length < 2) return [];

  const input = stroke.points.map(
    (p, i) => [p.x, p.y, stroke.pressures[i] ?? 0.5] as [number, number, number],
  );

  return getStroke(input, { ...STROKE_OPTIONS, size: stroke.size }).flat();
}

/**
 * Projects a world-space outline to screen space.
 * This is a simple O(vertices) linear transform — no perfect-freehand involved.
 * Call each frame for visible strokes instead of re-running strokeToOutline.
 */
export function projectToScreen(worldOutline: number[], camera: Camera): number[] {
  const { x: cx, y: cy, zoom } = camera;
  const out = new Array<number>(worldOutline.length);
  for (let i = 0; i < worldOutline.length; i += 2) {
    out[i]     = (worldOutline[i]!     - cx) * zoom;
    out[i + 1] = (worldOutline[i + 1]! - cy) * zoom;
  }
  return out;
}
