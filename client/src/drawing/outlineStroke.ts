import polygonClipping from 'polygon-clipping';
import type { Point } from '@shared/stroke';
import { pointInPointPolygon, distancePointToSegment } from './hitTest';
import { frameForRings, mapPair, unmapPair, type Pair } from './polyScale';
import { log } from '../debug/logger';

const MIN_MITER_COS = 0.2; // clamp miter length on sharp corners to avoid spikes
const MIN_HOLE_AREA_FRACTION = 1e-6; // slivers left by a near-total collapse are not holes
const MIN_HOLE_DEPTH_FRACTION = 0.5; // a true erosion interior sits ≥ half-width from the outline

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
 * smoothing. Closed shapes return an outer ring plus the hole(s) of the true inward
 * erosion — usually one, several when the pen pinches a concave shape apart, none once
 * the pen swallows the interior.
 */
export function strokeOutlineRings(points: readonly Point[], width: number, closed: boolean): number[][] {
  const half = width / 2;
  if (closed) {
    const ring = orientPositive(dedupeClosed(points)); // fixed winding → outward offset is stable
    if (ring.length < 3) return [];
    const outer = flatten(offsetClosed(ring, half));
    const inner = offsetClosed(ring, -half);
    if (survivesOffset(ring, inner)) return [outer, flatten(inner)];
    return [outer, ...erodedHoles(ring, inner, half).map(flatten)];
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
  return signedArea(pts) < 0 ? pts.slice().reverse() : pts;
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

/**
 * True while the inward offset is still a valid hole as-is. Two ways it stops being one, and a
 * ring can fail either without failing the other, so both are checked. Failing rings are not
 * dropped outright — a single locally-inverted tip edge would delete a hole that mostly exists
 * (S1/S3: the shape renders solid and its hollow reads as ink) — they go through `erodedHoles`
 * to be trimmed down to the true erosion instead.
 */
function survivesOffset(source: readonly Point[], offset: readonly Point[]): boolean {
  return keepsEdgeDirections(source, offset) && isSimple(offset);
}

/**
 * Inversion. Offsetting inward past the shape's own half-extent pushes each vertex beyond the
 * opposite side, so the offset edge runs *backwards* relative to its source — the ring comes out
 * inside-out (a 40px pen on a 20px rectangle). Per-edge rather than by signed area: a rectangle
 * or ellipse can collapse across its short axis alone, leaving total area positive while the ring
 * is already invalid.
 */
function keepsEdgeDirections(source: readonly Point[], offset: readonly Point[]): boolean {
  const n = source.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const src = sub(source[j]!, source[i]!);
    const off = sub(offset[j]!, offset[i]!);
    if (src.x * off.x + src.y * off.y <= 0) return false;
  }
  return true;
}

/**
 * Folding, which only a concave outline can do: a notch's floor offsets down past the outer floor
 * it faces, and the ring crosses itself while every edge still points the way its source did — so
 * direction alone accepts it. O(n²), but n is the shape's own vertex count (4 for a rectangle,
 * ELLIPSE_SEGMENTS for an ellipse) and this runs once per bake, not per frame.
 */
function isSimple(ring: readonly Point[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // the last edge shares a vertex with the first
      const a = { from: ring[i]!, to: ring[i + 1]! };
      const b = { from: ring[j]!, to: ring[(j + 1) % n]! };
      if (crosses(a, b)) return false;
    }
  }
  return true;
}

interface Segment {
  readonly from: Point;
  readonly to: Point;
}

/** Proper crossing only — segments that merely touch at a vertex are left alone. */
function crosses(a: Segment, b: Segment): boolean {
  const da = sub(a.to, a.from);
  const db = sub(b.to, b.from);
  const straddlesA = cross(da, sub(b.from, a.from)) * cross(da, sub(b.to, a.from));
  const straddlesB = cross(db, sub(a.from, b.from)) * cross(db, sub(a.to, b.from));
  return straddlesA < 0 && straddlesB < 0;
}

function cross(a: Vec, b: Vec): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Trims a self-intersecting inward offset down to the true erosion. A squashed ellipse's tip
 * (curvature radius ry²/rx) inverts a few offset edges at ordinary pen widths while the hollow
 * plainly persists; a concave fold crosses itself while real hollows remain in the arms. The
 * union resolves the crossings into candidate regions; a candidate is a genuine hole only when
 * a point inside it is a true erosion interior point: positively wound by the raw offset (kills
 * retrograde loops the miter overshoot traced), inside the source, and at least ~half-width from
 * the outline (kills inside-out rings, which can come back positively wound after a double
 * inversion). Anything rejected leaves the shape solid there — never less ink than the geometry.
 */
function erodedHoles(source: readonly Point[], inner: readonly Point[], half: number): Point[][] {
  const minArea = MIN_HOLE_AREA_FRACTION * Math.abs(signedArea(source));
  const holes: Point[][] = [];
  for (const candidate of dissolveSelfIntersections(inner)) {
    if (Math.abs(signedArea(candidate)) <= minArea) continue;
    const rep = interiorPoint(candidate);
    if (!rep) continue;
    if (windingNumber(inner, rep) <= 0) continue;
    if (!pointInPointPolygon(rep.x, rep.y, source)) continue;
    if (distToRing(rep, source) < half * MIN_HOLE_DEPTH_FRACTION) continue;
    holes.push(candidate);
  }
  return holes;
}

// self-union splits a self-crossing ring into clean regions; conditioned into the ~[0,1000]
// frame like every other polygon-clipping call site, and its known throw falls back to []
function dissolveSelfIntersections(ring: readonly Point[]): Point[][] {
  const pairs: Pair[] = ring.map((p) => [p.x, p.y]);
  const frame = frameForRings([pairs]);
  if (!frame) return [];
  try {
    const result = polygonClipping.union([[pairs.map((p) => mapPair(p, frame))]]);
    return result.map((poly) => unmapRing(poly[0]!, frame)).filter((r) => r.length >= 3);
  } catch (err) {
    log('error', 'polygon-clipping union FAILED (erodedHoles)', {
      message: err instanceof Error ? err.message : String(err), vertices: ring.length,
    });
    return [];
  }
}

// exterior ring of one union output polygon → Points, closing duplicate dropped
function unmapRing(ring: readonly Pair[], frame: Parameters<typeof unmapPair>[1]): Point[] {
  const pts = ring.map((p) => {
    const [x, y] = unmapPair(p, frame);
    return { x, y };
  });
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first && last && first.x === last.x && first.y === last.y) pts.pop();
  return pts;
}

function signedArea(pts: readonly Point[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    area += cross(pts[i]!, pts[(i + 1) % pts.length]!);
  }
  return area / 2;
}

// a point strictly inside the ring: centroid when it lands inside (convex-ish regions), else
// the widest interior span of the centroid's scanline (concave regions); null on degenerates
function interiorPoint(ring: readonly Point[]): Point | null {
  const c = ringCentroid(ring);
  if (!c) return null;
  if (pointInPointPolygon(c.x, c.y, ring)) return c;
  return widestSpanMidpoint(ring, c.y);
}

function ringCentroid(ring: readonly Point[]): Point | null {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const c = cross(a, b);
    area += c;
    cx += (a.x + b.x) * c;
    cy += (a.y + b.y) * c;
  }
  return area === 0 ? null : { x: cx / (3 * area), y: cy / (3 * area) };
}

function widestSpanMidpoint(ring: readonly Point[], y: number): Point | null {
  const xs: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    if (a.y > y === b.y > y) continue;
    xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  xs.sort((p, q) => p - q);
  let best: Point | null = null;
  let bestWidth = 0;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const width = xs[i + 1]! - xs[i]!;
    if (width > bestWidth) {
      bestWidth = width;
      best = { x: (xs[i]! + xs[i + 1]!) / 2, y };
    }
  }
  return best;
}

// signed winding of the (possibly self-crossing) ring around p — the nonzero fill rule
function windingNumber(ring: readonly Point[], p: Point): number {
  let w = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    if (a.y <= p.y) {
      if (b.y > p.y && cross(sub(b, a), sub(p, a)) > 0) w++;
    } else if (b.y <= p.y && cross(sub(b, a), sub(p, a)) < 0) {
      w--;
    }
  }
  return w;
}

function distToRing(p: Point, ring: readonly Point[]): number {
  let min = Infinity;
  for (let i = 0; i < ring.length; i++) {
    min = Math.min(min, distancePointToSegment(p, ring[i]!, ring[(i + 1) % ring.length]!));
  }
  return min;
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
