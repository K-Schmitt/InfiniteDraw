import polygonClipping from 'polygon-clipping';
import { frameForRings, mapPair, unmapPair, ringToPairs, type Pair } from './polyScale';
import { pointInPolygon } from './hitTest';
import { log } from '../debug/logger';

/** Relative tolerance for treating a vertex as ON another ring's boundary. */
const BOUNDARY_EPS = 1e-9;

/** Axis-aligned box in camera-frame units. Frame (0,0) is the viewport's top-left pixel. */
export interface FrameBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Intersects a stroke's camera-frame rings with the visible box.
 *
 * This is what replaces a single-point inside/outside test for a stroke too large to bake: a
 * stroke whose painted edge crosses the viewport covers *part* of it, and no one probe point can
 * express that. Probing the frame origin — the top-left pixel, since `HierCamera` applies no
 * centring offset — either flooded the viewport with the stroke's colour or hid the stroke
 * outright, so zooming towards a wall made the wall vanish the moment the top-left pixel fell on
 * its empty side.
 *
 * Returns the surviving rings (`[]` when the stroke covers none of the box), or null when the
 * clip could not be computed at all, so the caller can fall back to the coarse decision.
 */
export function clipFrameRingsToView(
  rings: readonly number[][],
  view: FrameBox,
): number[][] | null {
  if (rings.length === 0) return null;
  const rect = boxRing(view);
  const polys = rings.map(ringToPairs);
  // Same conditioning as every other polygon-clipping call site: frame coords at deep zoom are
  // enormous next to a viewport-sized rect, and the clipper degrades on that spread.
  const frame = frameForRings([...polys, rect]);
  if (!frame) return null;
  // `rings` is a FLATTENED MultiPolygon (strokeToRings output, even-odd semantics), so the
  // nesting must be rebuilt: fed as one Polygon, a disjoint island would clip as a "hole".
  const subject = nestRings(rings).map((poly) =>
    poly.map((i) => polys[i]!.map((p) => mapPair(p, frame))),
  );
  const clip = [rect.map((p) => mapPair(p, frame))];
  try {
    return flattenRings(polygonClipping.intersection(subject, clip), frame);
  } catch (err) {
    // The known "Unable to complete output ring" failure. Null (not []) so the caller keeps the
    // stroke's coarse decision rather than silently dropping a stroke that does cover the view.
    log('error', 'polygon-clipping FAILED (clipFrameRingsToView)', {
      message: err instanceof Error ? err.message : String(err),
      rings: rings.length, vertices: polys.reduce((n, r) => n + r.length, 0), view,
    });
    return null;
  }
}

/**
 * Groups flattened even-odd ring indexes into polygon-clipping polygons: even containment depth
 * makes a ring an exterior, odd depth a hole of its innermost enclosing exterior. O(n²) over the
 * ring count, which stays tiny for stroke geometry.
 */
function nestRings(rings: readonly number[][]): number[][] {
  const depths = ringDepths(rings);
  const polyByExterior = new Map<number, number[]>();
  const out: number[][] = [];
  depths.forEach((depth, i) => {
    if (depth % 2 !== 0) return;
    const poly = [i];
    polyByExterior.set(i, poly);
    out.push(poly);
  });
  depths.forEach((depth, i) => {
    if (depth % 2 === 0) return;
    const parent = innermostEnclosing(i, rings, depths);
    polyByExterior.get(parent)?.push(i);
  });
  return out;
}

/** Even-odd containment depth of each ring: how many other rings contain it. */
function ringDepths(rings: readonly number[][]): number[] {
  return rings.map((ring, i) => {
    let depth = 0;
    for (let j = 0; j < rings.length; j++) {
      if (j !== i && ringContains(rings[j]!, ring)) depth++;
    }
    return depth;
  });
}

function innermostEnclosing(
  hole: number,
  rings: readonly number[][],
  depths: readonly number[],
): number {
  for (let j = 0; j < rings.length; j++) {
    if (j === hole || depths[j] !== depths[hole]! - 1) continue;
    if (ringContains(rings[j]!, rings[hole]!)) return j;
  }
  return -1;
}

/**
 * True when `inner` lies inside `outer`. Rings never cross (strokeToRings unions them), so the
 * first vertex clear of `outer`'s boundary decides; a hole hugging its outer's edge (a wall
 * annulus) has vertices exactly ON that boundary, where ray-casting is undefined — skip those.
 */
function ringContains(outer: readonly number[], inner: readonly number[]): boolean {
  for (let i = 0; i < inner.length; i += 2) {
    const x = inner[i]!;
    const y = inner[i + 1]!;
    if (pointOnRing(x, y, outer)) continue;
    return pointInPolygon(x, y, outer);
  }
  return true; // fully coincident boundaries: even-odd cancels them either way
}

function pointOnRing(px: number, py: number, ring: readonly number[]): boolean {
  const n = ring.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const ax = ring[j]!;
    const ay = ring[j + 1]!;
    const dx = ring[i]! - ax;
    const dy = ring[i + 1]! - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    if (t < 0 || t > 1) continue;
    const distSq = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
    const tol = BOUNDARY_EPS * Math.max(1, Math.abs(ax), Math.abs(ay), Math.abs(dx), Math.abs(dy));
    if (distSq <= tol * tol) return true;
  }
  return false;
}

function boxRing(view: FrameBox): Pair[] {
  return [
    [view.minX, view.minY],
    [view.maxX, view.minY],
    [view.maxX, view.maxY],
    [view.minX, view.maxY],
  ];
}

function flattenRings(clipped: Pair[][][], frame: Parameters<typeof unmapPair>[1]): number[][] {
  const out: number[][] = [];
  for (const poly of clipped) {
    for (const ring of poly) {
      const flat: number[] = [];
      for (const p of ring) {
        const [x, y] = unmapPair(p, frame);
        flat.push(x, y);
      }
      if (flat.length >= 6) out.push(flat);
    }
  }
  return out;
}
