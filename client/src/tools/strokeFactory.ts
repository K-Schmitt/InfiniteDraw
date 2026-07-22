import type { BrushStroke, Color, Point, StrokeType } from '@shared/stroke';
import { originAnchor, originBbox, type CellAnchor, type CellBbox } from '@shared/anchor';

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
  /** Hierarchical anchor; defaults to level-0 origin until Phase F wires real anchoring. */
  anchor?: CellAnchor;
  zIndex?: number;
  cellBbox?: CellBbox;
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
    anchor: spec.anchor ?? originAnchor(),
    zIndex: spec.zIndex ?? 0,
    cellBbox: spec.cellBbox ?? originBbox(),
    ...(spec.filled ? { filled: true } : {}), // omit unless set (exactOptionalPropertyTypes)
    ...(spec.holes && spec.holes.length > 0 ? { holes: spec.holes } : {}),
    ...(spec.background ? { background: true } : {}),
  };
}
