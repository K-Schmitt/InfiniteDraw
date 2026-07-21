import type { Point } from '@shared/stroke';

/** Ray-casting test: is (px,py) inside the closed polygon given as a flat [x0,y0,x1,y1,…] ring? */
export function pointInPolygon(px: number, py: number, ring: readonly number[]): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = ring[i]!;
    const yi = ring[i + 1]!;
    const xj = ring[j]!;
    const yj = ring[j + 1]!;
    const crosses = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Ray-casting test against a polygon given as Point[] (implicitly closed). */
export function pointInPointPolygon(px: number, py: number, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    const crosses = a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Even-odd test across a stroke's rings (outer + holes): inside the outer ring but outside holes. */
export function pointInRings(px: number, py: number, rings: readonly number[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    if (pointInPolygon(px, py, ring)) inside = !inside;
  }
  return inside;
}

/** Shortest distance from p to the segment a–b, in world units. */
export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True if p lies within `radius` of any segment of the polyline `path`. */
export function pointNearPolyline(p: Point, path: readonly Point[], radius: number): boolean {
  if (path.length === 0) return false;
  if (path.length === 1) return Math.hypot(p.x - path[0]!.x, p.y - path[0]!.y) <= radius;
  for (let i = 1; i < path.length; i++) {
    if (distancePointToSegment(p, path[i - 1]!, path[i]!) <= radius) return true;
  }
  return false;
}
