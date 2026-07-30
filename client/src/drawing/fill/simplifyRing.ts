import type { TracedRegion } from './traceMask';

/**
 * Hard ceiling on the vertices a single committed fill may carry. Every fill crosses the socket
 * and appends to the binary journal at 9 bytes per point, so this is a wire-size guarantee, not
 * a cosmetic knob. 1200 vertices ≈ 11 KB on disk — comparable to a long freehand stroke.
 */
export const MAX_FILL_VERTICES = 1200;

/** Safety stop on the tolerance-doubling loop; 2^12 px is far larger than any viewport. */
const MAX_DOUBLINGS = 12;
/** Below this a ring has no area worth simplifying. */
const MIN_RING_POINTS = 3;

/**
 * Douglas-Peucker on a closed ring. `tolerance` is a perpendicular distance in the ring's own
 * units — pixels for a traced mask, frame units for an exact face (divide by `frameScale` there).
 *
 * DP on a ring can collapse to two points when the chord from vertex 0 to the far vertex covers
 * everything; a raster staircase does exactly that. Returning the *original* ring in that case
 * would make the vertex budget a no-op (every tolerance doubling reproduces the same 2-point
 * result), so decimate instead: three evenly-spaced vertices beat ten thousand lattice steps, and
 * the shape is degenerate at that tolerance either way.
 */
export function simplifyRing(ring: readonly number[], tolerance: number): number[] {
  const points = toPoints(ring);
  if (points.length <= MIN_RING_POINTS) return [...ring];
  const kept = douglasPeucker(collinearRuns(points), tolerance * tolerance);
  return kept.length >= MIN_RING_POINTS ? flatten(kept) : decimate(points);
}

/** Evenly-spaced fallback so a collapsed ring still has an area and still fits the budget. */
function decimate(points: readonly Pt[]): number[] {
  const step = points.length / MIN_RING_POINTS;
  const out: Pt[] = [];
  for (let i = 0; i < MIN_RING_POINTS; i++) out.push(points[Math.floor(i * step)]!);
  return flatten(out);
}

/**
 * Drops interior vertices of straight runs before DP sees them. A lattice contour is ~75%
 * collinear by construction (one vertex per pixel along every straight raster edge), so this one
 * O(n) pass cuts DP's input ~4× — and `fitVertexBudget` runs DP up to 13 times.
 */
function collinearRuns(points: readonly Pt[]): Pt[] {
  const n = points.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const prev = points[(i - 1 + n) % n]!;
    const next = points[(i + 1) % n]!;
    const cross = (p.x - prev.x) * (next.y - prev.y) - (p.y - prev.y) * (next.x - prev.x);
    if (cross !== 0) out.push(p);
  }
  return out.length >= MIN_RING_POINTS ? out : [...points];
}

/** Applies `simplifyRing` to the outer contour and every hole. */
export function simplifyRegion(region: TracedRegion, tolerance: number): TracedRegion {
  return {
    outer: simplifyRing(region.outer, tolerance),
    holes: region.holes.map((h) => simplifyRing(h, tolerance)),
  };
}

/** Simplifies with a growing tolerance until the region fits `MAX_FILL_VERTICES`. */
export function fitVertexBudget(region: TracedRegion, tolerance: number): TracedRegion {
  let current = simplifyRegion(region, tolerance);
  let step = tolerance;
  for (let i = 0; i < MAX_DOUBLINGS && vertexCount(current) > MAX_FILL_VERTICES; i++) {
    step *= 2;
    current = simplifyRegion(region, step);
  }
  return current;
}

function vertexCount(region: TracedRegion): number {
  return region.outer.length / 2 + region.holes.reduce((n, h) => n + h.length / 2, 0);
}

interface Pt {
  readonly x: number;
  readonly y: number;
}

function toPoints(ring: readonly number[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ring.length; i += 2) out.push({ x: ring[i]!, y: ring[i + 1]! });
  return out;
}

function flatten(points: readonly Pt[]): number[] {
  const out: number[] = [];
  for (const p of points) out.push(p.x, p.y);
  return out;
}

function douglasPeucker(points: readonly Pt[], sqTolerance: number): Pt[] {
  if (points.length <= 2) return [...points];
  let maxSq = 0;
  let index = 0;
  const last = points.length - 1;
  for (let i = 1; i < last; i++) {
    const sq = sqSegmentDistance(points[i]!, points[0]!, points[last]!);
    if (sq > maxSq) {
      maxSq = sq;
      index = i;
    }
  }
  if (maxSq <= sqTolerance) return [points[0]!, points[last]!];
  const left = douglasPeucker(points.slice(0, index + 1), sqTolerance);
  const right = douglasPeucker(points.slice(index), sqTolerance);
  return [...left.slice(0, -1), ...right];
}

function sqSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  let x = a.x;
  let y = a.y;
  const dx = b.x - x;
  const dy = b.y - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b.x; y = b.y; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  return (p.x - x) ** 2 + (p.y - y) ** 2;
}
