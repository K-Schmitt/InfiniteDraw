import type { BrushStroke, Color, Point, StrokeType } from '@shared/stroke';

export interface StrokeSpec {
  type: StrokeType;
  color: Color;
  /** World-space size (caller divides the screen size by zoom for constant on-screen thickness). */
  size: number;
  points: Point[];
  layerId: string;
  filled?: boolean;
  holes?: Point[][];
  background?: boolean;
}

/** Builds a committed BrushStroke with a fresh id and full (1.0) pressure at every point. */
export function buildStroke(spec: StrokeSpec): BrushStroke {
  return {
    id: crypto.randomUUID(),
    type: spec.type,
    color: { ...spec.color },
    size: spec.size,
    points: spec.points,
    pressures: spec.points.map(() => 1),
    layerId: spec.layerId,
    createdAt: Date.now(),
    ...(spec.filled ? { filled: true } : {}), // omit unless set (exactOptionalPropertyTypes)
    ...(spec.holes && spec.holes.length > 0 ? { holes: spec.holes } : {}),
    ...(spec.background ? { background: true } : {}),
  };
}
