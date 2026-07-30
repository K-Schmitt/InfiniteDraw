import { LOCAL_SPAN, type CellAnchor } from '@shared/anchor';
import { ldexp } from '../coords/ldexp';
import { frameToAnchor } from '../coords/worldAnchor';
import type { ProjCamera } from '../coords/viewProject';
import type { Bbox } from './SpatialIndex';

export interface FramePoint {
  x: number;
  y: number;
}

/**
 * Frozen-camera gesture → anchored stroke geometry (spec §3): pick the *minimal enclosing* cell,
 * i.e. the finest level (≤ camera level) at which the whole gesture bbox fits in a single cell,
 * then reproject every point to cell-local coords in [0, LOCAL_SPAN).
 */
export function commitAnchor(
  framePoints: readonly FramePoint[],
  camera: ProjCamera,
): { anchor: CellAnchor; localPoints: FramePoint[]; cellBbox: Bbox } {
  const anchor = anchorForPoints(framePoints, camera);
  const localPoints = reprojectPointsToAnchor(framePoints, camera, anchor);
  return { anchor, localPoints, cellBbox: cellBboxOfLocal(anchor, localPoints) };
}

/**
 * Finest level (≤ camera.level) whose single cell contains the whole gesture bbox — or, when the
 * bbox straddles the origin (no single cell can hold it, since every quadtree boundary aligns at
 * 0), the coarsest cell the search reaches. Downstream (`cellBboxOfLocal`) already tolerates
 * anchor-local points outside one cell, so the min corner is a valid reference either way.
 */
export function anchorForPoints(pts: readonly FramePoint[], camera: ProjCamera): CellAnchor {
  const { minFx, minFy, maxFx, maxFy } = frameBbox(pts);
  const lo = frameToAnchor(minFx, minFy, camera).anchor.cell;
  const hi = frameToAnchor(maxFx, maxFy, camera).anchor.cell;
  let level = camera.level;
  let minX = lo.x;
  let minY = lo.y;
  let maxX = hi.x;
  let maxY = hi.y;
  // Arithmetic `>>` on cells of opposite sign (min < 0 ≤ max) never equalises: -1n >> 1n === -1n
  // stays put while 0n >> 1n === 0n. Stop when a shift makes no progress to avoid spinning the
  // main thread forever (froze the tab with no error when a stroke crossed the origin).
  while (minX !== maxX || minY !== maxY) {
    const nMinX = minX >> 1n, nMaxX = maxX >> 1n, nMinY = minY >> 1n, nMaxY = maxY >> 1n;
    if (nMinX === minX && nMaxX === maxX && nMinY === minY && nMaxY === maxY) break;
    minX = nMinX; maxX = nMaxX; minY = nMinY; maxY = nMaxY;
    level -= 1;
  }
  return { level, cell: { x: minX, y: minY } };
}

/** Camera-frame points → anchor-cell-local coords: shift into the anchor origin, then ÷ 2^gap. */
export function reprojectPointsToAnchor(
  pts: readonly FramePoint[],
  camera: ProjCamera,
  anchor: CellAnchor,
): FramePoint[] {
  const gap = camera.level - anchor.level; // ≥ 0: anchor coarser-or-equal to the camera
  const g = BigInt(gap);
  const originOffX = Number((anchor.cell.x << g) - camera.cell.x) * LOCAL_SPAN;
  const originOffY = Number((anchor.cell.y << g) - camera.cell.y) * LOCAL_SPAN;
  return pts.map((p) => ({
    x: ldexp(camera.sub.x + p.x - originOffX, -gap),
    y: ldexp(camera.sub.y + p.y - originOffY, -gap),
  }));
}

function frameBbox(pts: readonly FramePoint[]): {
  minFx: number; minFy: number; maxFx: number; maxFy: number;
} {
  let minFx = Infinity;
  let minFy = Infinity;
  let maxFx = -Infinity;
  let maxFy = -Infinity;
  for (const p of pts) {
    minFx = Math.min(minFx, p.x); minFy = Math.min(minFy, p.y);
    maxFx = Math.max(maxFx, p.x); maxFy = Math.max(maxFy, p.y);
  }
  return { minFx, minFy, maxFx, maxFy };
}

/** Cell-space bbox (BigInt) of anchor-local points, for viewport culling before any float. */
export function cellBboxOfLocal(anchor: CellAnchor, pts: readonly FramePoint[]): Bbox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const { x: cx, y: cy } = anchor.cell;
  return {
    minX: cx + BigInt(Math.floor(minX / LOCAL_SPAN)),
    minY: cy + BigInt(Math.floor(minY / LOCAL_SPAN)),
    maxX: cx + BigInt(Math.floor(maxX / LOCAL_SPAN)),
    maxY: cy + BigInt(Math.floor(maxY / LOCAL_SPAN)),
  };
}
