import polygonClipping from 'polygon-clipping';
import { pointInPolygon } from '../hitTest';
import {
  frameForRings, mapPair, unmapPair, ringToPairs, type Frame, type Pair,
} from '../polyScale';

export interface SeedPoint {
  readonly x: number;
  readonly y: number;
}

export interface RegionHint {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface ExactRegionRequest {
  readonly seed: SeedPoint;
  /** Frame rings of the bounding strokes only — never the whole viewport. */
  readonly walls: readonly number[][][];
  /** Frame bbox of the raster region; sets the working box and therefore the conditioning. */
  readonly hint: RegionHint;
}

/** Working box padding, as a multiple of the region's own extent. */
const PAD_RATIO = 0.25;

/**
 * Exact boundary of the region the raster stage already located.
 *
 * The working box is the region's own bbox padded slightly, and the operands are only the walls
 * the flood touched, so `frameForRings` normalizes a span of O(1) region-widths at any zoom — the
 * conditioning failure that makes the current whole-viewport implementation return nothing at
 * some zoom levels cannot occur here. Returns null if the clipper cannot produce a face
 * containing the seed, in which case the caller keeps the traced raster polygon.
 */
export function exactRegionAt(request: ExactRegionRequest): number[][] | null {
  if (request.walls.length === 0) return null;
  const box = workingBox(request.hint);
  const polys = request.walls.map((rings) => rings.map(ringToPairs));
  const frame = frameForRings([box, ...polys.flat()]);
  if (!frame) return null;
  const solid = polys.map((rings) => rings.map((r) => r.map((p) => mapPair(p, frame))));
  const empty = safeDifference(box.map((p) => mapPair(p, frame)), solid);
  if (!empty) return null;
  const seed = mapPair([request.seed.x, request.seed.y], frame);
  const face = pickFace(seed, empty);
  return face ? face.map((ring) => unmapRing(ring, frame)) : null;
}

/** The region's bbox, padded so the boundary walls are fully inside the working area. */
function workingBox(hint: RegionHint): Pair[] {
  const padX = Math.max((hint.maxX - hint.minX) * PAD_RATIO, Number.MIN_VALUE);
  const padY = Math.max((hint.maxY - hint.minY) * PAD_RATIO, Number.MIN_VALUE);
  const x0 = hint.minX - padX;
  const y0 = hint.minY - padY;
  const x1 = hint.maxX + padX;
  const y1 = hint.maxY + padY;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

function safeDifference(box: Pair[], solid: Pair[][][]): Pair[][][] | null {
  try {
    return polygonClipping.difference([box], ...solid);
  } catch {
    return null;
  }
}

/** Normalized coordinates run in [0,1000]; a face vertex this close to the edge is on the box. */
const BOX_EPS = 1e-4;
/** Upper bound of `polyScale`'s normalized range. */
const BOX_SPAN = 1000;

/**
 * The empty face containing the seed, excluding its own holes — and never a face that runs out to
 * the artificial working box. That rejection is what the old `enclosedRegionAt.touchesBoundary`
 * did: without it, any wall set that fails to close (a hand-drawn gap the raster stage sealed with
 * `FILL_GAP_PX`, a degenerate ring, an occluded wall) yields the padded bbox itself, returned with
 * `exact: true` and no fallback log.
 */
function pickFace(seed: Pair, faces: Pair[][][]): Pair[][] | null {
  for (const face of faces) {
    if (!insideRing(seed, face[0]!)) continue;
    if (face.slice(1).some((hole) => insideRing(seed, hole))) continue;
    return touchesBox(face[0]!) ? null : face;
  }
  return null;
}

function touchesBox(ring: Pair[]): boolean {
  for (const [x, y] of ring) {
    if (x <= BOX_EPS || x >= BOX_SPAN - BOX_EPS) return true;
    if (y <= BOX_EPS || y >= BOX_SPAN - BOX_EPS) return true;
  }
  return false;
}

function insideRing(p: Pair, ring: Pair[]): boolean {
  const flat: number[] = [];
  for (const [x, y] of ring) flat.push(x, y);
  return pointInPolygon(p[0], p[1], flat);
}

function unmapRing(ring: Pair[], frame: Frame): number[] {
  const out: number[] = [];
  for (const p of dropClosingDuplicate(ring)) {
    const [x, y] = unmapPair(p, frame);
    out.push(x, y);
  }
  return out;
}

/**
 * polygon-clipping documents its output rings as self-closing (first === last) — every other ring
 * format in this codebase (traceMask, ringToPairs, hitTest's pointInPolygon) is open, closure
 * implicit. Left in, the duplicate makes a downstream Douglas-Peucker pass see a zero-length edge
 * at both wrap points and drop a real corner instead — strip it here so the convention matches
 * every other ring `resolveFill` hands to `fitVertexBudget`.
 */
function dropClosingDuplicate(ring: Pair[]): Pair[] {
  if (ring.length < 2) return ring;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
}
