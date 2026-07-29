import { LOCAL_SPAN_N, type CellAnchor } from '@shared/anchor';
import { projectToFrame, CULLED, type ProjCamera } from '../coords/viewProject';
import { ldexp } from '../coords/ldexp';

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

interface LocalBounds {
  minX: number; minY: number; maxX: number; maxY: number;
}

/**
 * True when the camera sits over a much-coarser stroke's painted extent — the stroke has no
 * visible detail at this depth but must never vanish (spec §4 bleeding anchor). Tests the
 * camera's position in the anchor's local frame against the stroke's local bounds, so an empty
 * area that merely shares the stroke's coarse enclosing cell does NOT falsely bleed. Only
 * meaningful when the anchor is coarser than the camera; finer strokes can't enclose it.
 */
export function cameraInsideStroke(
  localBounds: LocalBounds,
  anchor: CellAnchor,
  camera: ProjCamera,
): boolean {
  const gap = camera.level - anchor.level;
  if (gap < 0) return false;
  const g = BigInt(gap);
  const intX = (camera.cell.x * LOCAL_SPAN_N) >> g;
  const intY = (camera.cell.y * LOCAL_SPAN_N) >> g;
  const camX = Number(intX - anchor.cell.x * LOCAL_SPAN_N) + ldexp(camera.sub.x, -gap);
  const camY = Number(intY - anchor.cell.y * LOCAL_SPAN_N) + ldexp(camera.sub.y, -gap);
  return camX >= localBounds.minX && camX <= localBounds.maxX
      && camY >= localBounds.minY && camY <= localBounds.maxY;
}

/** Local (anchor-frame) bbox of a stroke's baked rings. */
export function localBoundsOf(rings: readonly number[][]): LocalBounds {
  return frameBboxOf(rings);
}
