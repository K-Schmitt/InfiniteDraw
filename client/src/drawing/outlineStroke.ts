import type { Point } from '@shared/stroke';

const MIN_MITER_COS = 0.2; // clamp miter length on sharp corners to avoid spikes

interface Vec {
  x: number;
  y: number;
}

function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

function unit(v: Vec): Vec {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

// right-hand normal of a direction vector
function normal(dir: Vec): Vec {
  return { x: dir.y, y: -dir.x };
}

/**
 * Constant-width outline for geometric strokes (line / rectangle / ellipse / triangle,
 * and open eraser fragments). Pure geometry — exact at any zoom, with no taper or
 * smoothing. Closed shapes return an outer ring + an inner hole.
 */
export function strokeOutlineRings(points: readonly Point[], width: number, closed: boolean): number[][] {
  const half = width / 2;
  if (closed) {
    const ring = orientPositive(dedupeClosed(points)); // fixed winding → outward offset is stable
    if (ring.length < 3) return [];
    return [flatten(offsetClosed(ring, half)), flatten(offsetClosed(ring, -half))];
  }
  if (points.length < 2) return [];
  return [flatten(ribbon(points, half))];
}

// drops a trailing point equal to the first (shape generators close the loop explicitly)
function dedupeClosed(points: readonly Point[]): Point[] {
  const pts = points.slice();
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (pts.length > 1 && first.x === last.x && first.y === last.y) pts.pop();
  return pts;
}

// shapes built from drag corners can wind either way; force one orientation so offset sign is stable
function orientPositive(pts: Point[]): Point[] {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area < 0 ? pts.slice().reverse() : pts;
}

// miter-offsets a closed convex polygon outward (dist>0) or inward (dist<0)
function offsetClosed(pts: readonly Point[], dist: number): Point[] {
  const n = pts.length;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!;
    const cur = pts[i]!;
    const next = pts[(i + 1) % n]!;
    const n1 = normal(unit(sub(cur, prev)));
    const n2 = normal(unit(sub(next, cur)));
    out.push(miterPoint(cur, n1, n2, dist));
  }
  return out;
}

// open polyline → single ribbon ring (left side forward, right side back)
function ribbon(pts: readonly Point[], half: number): Point[] {
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < pts.length; i++) {
    const normals = vertexNormals(pts, i);
    left.push(miterPoint(pts[i]!, normals.a, normals.b, half));
    right.push(miterPoint(pts[i]!, normals.a, normals.b, -half));
  }
  return [...left, ...right.reverse()];
}

// segment normals on each side of vertex i (endpoints reuse their single segment)
function vertexNormals(pts: readonly Point[], i: number): { a: Vec; b: Vec } {
  const prev = pts[i - 1] ?? pts[i]!;
  const cur = pts[i]!;
  const next = pts[i + 1] ?? pts[i]!;
  const a = i > 0 ? normal(unit(sub(cur, prev))) : normal(unit(sub(next, cur)));
  const b = i < pts.length - 1 ? normal(unit(sub(next, cur))) : a;
  return { a, b };
}

function miterPoint(p: Point, n1: Vec, n2: Vec, dist: number): Point {
  const miter = unit({ x: n1.x + n2.x, y: n1.y + n2.y });
  const cos = miter.x * n1.x + miter.y * n1.y;
  const len = dist / Math.max(Math.abs(cos), MIN_MITER_COS) * Math.sign(cos || 1);
  return { x: p.x + miter.x * len, y: p.y + miter.y * len };
}

function flatten(pts: readonly Point[]): number[] {
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y);
  return out;
}
