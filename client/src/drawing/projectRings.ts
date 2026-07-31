import type { Point } from '@shared/stroke';
import { LOCAL_SPAN_N, type CellAnchor } from '@shared/anchor';
import { projectToFrame, CULLED, MAX_EXACT_GAP, type ProjCamera } from '../coords/viewProject';
import { ldexp } from '../coords/ldexp';
import { pointInRings } from './hitTest';

/**
 * Project a stroke's anchor-local rings into the camera frame — the exact transform the
 * renderer uses to place baked geometry, so hit-testing and fill share one basis. Returns
 * null when any vertex is culled (off the representable frame → treat as not present).
 */
export function ringsToFrame(
  anchor: CellAnchor,
  rings: readonly number[][],
  camera: ProjCamera,
): number[][] | null {
  const out: number[][] = [];
  for (const ring of rings) {
    const flat = new Array<number>(ring.length);
    for (let i = 0; i < ring.length; i += 2) {
      const p = projectToFrame(anchor, ring[i]!, ring[i + 1]!, camera);
      if (p === CULLED) return null;
      flat[i] = p.fx;
      flat[i + 1] = p.fy;
    }
    out.push(flat);
  }
  return out;
}

/**
 * Project a stroke's anchor-local bbox into the camera frame using only its two corners.
 * Per anchor the projection is `const + positiveScale · local` on each axis, so it is strictly
 * increasing and the corners map to the frame bbox exactly. Lets callers reject a stroke in O(1)
 * instead of projecting every vertex via `ringsToFrame`.
 */
export function localBboxToFrame(
  anchor: CellAnchor,
  bounds: LocalBounds,
  camera: ProjCamera,
): LocalBounds | null {
  const lo = projectToFrame(anchor, bounds.minX, bounds.minY, camera);
  const hi = projectToFrame(anchor, bounds.maxX, bounds.maxY, camera);
  if (lo === CULLED || hi === CULLED) return null;
  return { minX: lo.fx, minY: lo.fy, maxX: hi.fx, maxY: hi.fy };
}

/** Shoelace area of a flat [x0,y0,x1,y1,…] ring. */
export function ringArea(ring: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const nx = (i + 2) % ring.length;
    sum += ring[i]! * ring[nx + 1]! - ring[nx]! * ring[i + 1]!;
  }
  return Math.abs(sum) / 2;
}

/** Axis-aligned frame bbox of a flat ring set. */
export function frameBboxOf(rings: readonly number[][]): {
  minX: number; minY: number; maxX: number; maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i]!); maxX = Math.max(maxX, ring[i]!);
      minY = Math.min(minY, ring[i + 1]!); maxY = Math.max(maxY, ring[i + 1]!);
    }
  }
  return { minX, minY, maxX, maxY };
}

export interface LocalBounds {
  minX: number; minY: number; maxX: number; maxY: number;
}

/** A stroke's baked anchor-local geometry: its rings plus their cached bbox. */
export interface StrokeGeometry {
  readonly bounds: LocalBounds;
  readonly rings: readonly number[][];
}

/**
 * The camera's frame origin expressed in an anchor's local coordinates. Null when the anchor is
 * finer than the camera — a finer stroke can never enclose the viewport, so there is nothing to
 * test against.
 */
export function cameraLocalPoint(anchor: CellAnchor, camera: ProjCamera): Point | null {
  const gap = camera.level - anchor.level;
  if (gap < 0) return null;
  return {
    x: localAxis({ cell: camera.cell.x, sub: camera.sub.x, anchorCell: anchor.cell.x }, gap),
    y: localAxis({ cell: camera.cell.y, sub: camera.sub.y, anchorCell: anchor.cell.y }, gap),
  };
}

interface CameraAxis {
  readonly cell: bigint;
  readonly sub: number;
  readonly anchorCell: bigint;
}

/**
 * One axis of the camera origin in anchor-local units: (cell·SPAN + sub)/2^gap − anchorCell·SPAN.
 *
 * The shift is split into quotient + remainder rather than left as `(cell·SPAN) >> gap`: that
 * shift alone drops up to 2^gap − 1 camera units, i.e. up to a whole anchor-local unit, and
 * always downward. Dropped integer bits, not a float limit — and this is the probe that decides
 * whether the camera stands on a coarse stroke's ink, so any painted band thinner than one anchor
 * unit could read the wrong side of itself (a 4-unit wall lost a quarter of its width).
 */
function localAxis(axis: CameraAxis, gap: number): number {
  const units = axis.cell * LOCAL_SPAN_N;
  const whole = units >> BigInt(gap); // arithmetic shift = floor, so the remainder stays positive
  return Number(whole - axis.anchorCell * LOCAL_SPAN_N)
    + fractionOf(units - (whole << BigInt(gap)), gap)
    + ldexp(axis.sub, -gap);
}

/** `r / 2^gap` for r in [0, 2^gap) — keeps the top 53 bits so `Number(r)` cannot reach Infinity. */
function fractionOf(r: bigint, gap: number): number {
  if (gap <= MAX_EXACT_GAP) return ldexp(Number(r), -gap);
  return ldexp(Number(r >> BigInt(gap - MAX_EXACT_GAP)), -MAX_EXACT_GAP); // rest is sub-ULP of 1
}

/**
 * True when the camera sits over a much-coarser stroke's *painted* area — the stroke has no
 * visible detail at this depth but must never vanish (spec §4 bleeding anchor).
 *
 * The bbox alone is not the painted area: for a closed shape the outline is an annulus, so its
 * bbox covers the hollow interior. Testing the bbox made zooming into that interior bleed the
 * stroke's colour over the whole viewport past the deep-zoom threshold — an empty centre going
 * solid. The bbox therefore only serves as the O(1) pre-reject; the even-odd ring test decides.
 */
export function cameraInsideStroke(
  geometry: StrokeGeometry,
  anchor: CellAnchor,
  camera: ProjCamera,
): boolean {
  const cam = cameraLocalPoint(anchor, camera);
  if (cam === null || !insideBounds(cam, geometry.bounds)) return false;
  return pointInRings(cam.x, cam.y, geometry.rings);
}

function insideBounds(p: Point, b: LocalBounds): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

/** Local (anchor-frame) bbox of a stroke's baked rings. */
export function localBoundsOf(rings: readonly number[][]): LocalBounds {
  return frameBboxOf(rings);
}
