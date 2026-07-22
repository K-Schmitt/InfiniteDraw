import { LOCAL_SPAN, type CellAnchor } from '@shared/anchor';
import { frameToAnchor } from '../coords/worldAnchor';
import type { ProjCamera } from '../coords/viewProject';
import type { Bbox } from './SpatialIndex';

/** Frozen-camera gesture → anchored stroke geometry (anchor + cell-local points + cellBbox). */
export function commitAnchor(
  framePoints: readonly { x: number; y: number }[],
  camera: ProjCamera,
): { anchor: CellAnchor; localPoints: { x: number; y: number }[]; cellBbox: Bbox } {
  let minFx = Infinity;
  let minFy = Infinity;
  for (const p of framePoints) {
    minFx = Math.min(minFx, p.x);
    minFy = Math.min(minFy, p.y);
  }
  const base = frameToAnchor(minFx, minFy, camera); // anchor at the gesture's min corner
  const anchor = base.anchor;
  const localPoints = framePoints.map((p) => ({
    x: p.x - minFx + base.lx,
    y: p.y - minFy + base.ly,
  }));
  return { anchor, localPoints, cellBbox: bboxOf(anchor, localPoints) };
}

function bboxOf(anchor: CellAnchor, pts: readonly { x: number; y: number }[]): Bbox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const cx = anchor.cell.x;
  const cy = anchor.cell.y;
  return {
    minX: cx + BigInt(Math.floor(minX / LOCAL_SPAN)),
    minY: cy + BigInt(Math.floor(minY / LOCAL_SPAN)),
    maxX: cx + BigInt(Math.floor(maxX / LOCAL_SPAN)),
    maxY: cy + BigInt(Math.floor(maxY / LOCAL_SPAN)),
  };
}
