import type { BrushStroke, Color, Point, StrokeType } from '@shared/stroke';
import { originAnchor, originBbox, type CellAnchor, type CellBbox } from '@shared/anchor';
import type { ProjCamera } from '../coords/viewProject';
import {
  anchorForPoints,
  reprojectPointsToAnchor,
  cellBboxOfLocal,
  type FramePoint,
} from '../drawing/anchorCommit';
import { toLocalWidth } from '../drawing/strokeWidth';

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

export interface AnchoredSpec {
  type: StrokeType;
  color: Color;
  /** Requested on-screen thickness in pixels; converted to anchor-local width. */
  screenSize: number;
  framePoints: FramePoint[];
  layerId: string;
  camera: ProjCamera;
  cameraScale: number;
  filled?: boolean;
  frameHoles?: FramePoint[][];
  background?: boolean;
  zIndex?: number;
}

/**
 * Builds a committed stroke from camera-frame points: picks the minimal enclosing anchor for the
 * whole geometry (outer + holes), reprojects every ring to anchor-local coords, and derives the
 * stored width from the gesture scale. Single anchoring path shared by line/shape/fill/eraser.
 */
export function anchoredStroke(spec: AnchoredSpec): BrushStroke {
  const holes = spec.frameHoles ?? [];
  const all = [...spec.framePoints, ...holes.flat()];
  const anchor = anchorForPoints(all, spec.camera);
  const outer = reprojectPointsToAnchor(spec.framePoints, spec.camera, anchor);
  const localHoles = holes.map((h) => reprojectPointsToAnchor(h, spec.camera, anchor));
  const cellBbox = cellBboxOfLocal(anchor, [...outer, ...localHoles.flat()]);
  return buildStroke({
    type: spec.type,
    color: spec.color,
    size: toLocalWidth(spec.screenSize, spec.cameraScale * 2 ** -anchor.level),
    points: outer,
    layerId: spec.layerId,
    anchor,
    cellBbox,
    ...(spec.zIndex !== undefined ? { zIndex: spec.zIndex } : {}),
    ...(spec.filled ? { filled: true } : {}),
    ...(localHoles.length > 0 ? { holes: localHoles } : {}),
    ...(spec.background ? { background: true } : {}),
  });
}
