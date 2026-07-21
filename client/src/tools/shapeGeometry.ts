import type { Point } from '@shared/stroke';

export type ShapeKind = 'rectangle' | 'ellipse' | 'triangle';

const ELLIPSE_SEGMENTS = 64;

/** Builds a closed perimeter (world coords) for the shape inscribed in the a–b bounding box. */
export function shapePoints(kind: ShapeKind, a: Point, b: Point): Point[] {
  if (kind === 'rectangle') return rectanglePoints(a, b);
  if (kind === 'triangle') return trianglePoints(a, b);
  return ellipsePoints(a, b);
}

function rectanglePoints(a: Point, b: Point): Point[] {
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
    { x: a.x, y: a.y },
  ];
}

function trianglePoints(a: Point, b: Point): Point[] {
  const midX = (a.x + b.x) / 2;
  return [
    { x: midX, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
    { x: midX, y: a.y },
  ];
}

function ellipsePoints(a: Point, b: Point): Point[] {
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.abs(b.x - a.x) / 2;
  const ry = Math.abs(b.y - a.y) / 2;
  const points: Point[] = [];
  for (let i = 0; i <= ELLIPSE_SEGMENTS; i++) {
    const t = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
    points.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return points;
}
