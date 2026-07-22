import { ldexp, absBig } from './ldexp';
import { LOCAL_SPAN, LOCAL_SPAN_N, type CellAnchor } from '@shared/anchor';

export interface ProjCamera {
  level: number;
  cell: { x: bigint; y: bigint };
  sub: { x: number; y: number };
}

export const CULLED = Symbol('culled');
export type ProjResult = { fx: number; fy: number } | typeof CULLED;

export const CULL = 2n ** 53n;
export const CULL_CELLS = 2n ** 40n;
export const MAX_EXACT_GAP = 53;

/**
 * Project an anchored local point into the camera frame (pre screen-scale). Always projects in
 * the camera frame; culls in BigInt before any float. Returns CULLED when off-representable.
 */
export function projectToFrame(
  anchor: CellAnchor,
  lx: number,
  ly: number,
  camera: ProjCamera,
): ProjResult {
  const dL = anchor.level - camera.level;
  return dL <= 0 ? coarser(anchor, lx, ly, camera, -dL) : finer(anchor, lx, ly, camera, dL);
}

// stroke coarser-or-equal: bring its integer cell UP to camera level, scale local up.
function coarser(a: CellAnchor, lx: number, ly: number, cam: ProjCamera, up: number): ProjResult {
  const g = BigInt(up);
  const dIntX = ((a.cell.x * LOCAL_SPAN_N) << g) - cam.cell.x * LOCAL_SPAN_N;
  const dIntY = ((a.cell.y * LOCAL_SPAN_N) << g) - cam.cell.y * LOCAL_SPAN_N;
  if (absBig(dIntX) > CULL || absBig(dIntY) > CULL) return CULLED;
  return {
    fx: Number(dIntX) - cam.sub.x + ldexp(lx, up),
    fy: Number(dIntY) - cam.sub.y + ldexp(ly, up),
  };
}

// stroke finer: reduce its cell DOWN to camera level; add sub-cell residue when gap is small.
function finer(a: CellAnchor, lx: number, ly: number, cam: ProjCamera, dL: number): ProjResult {
  const g = BigInt(dL);
  const cellX = a.cell.x >> g;
  const cellY = a.cell.y >> g;
  const dCellX = cellX - cam.cell.x;
  const dCellY = cellY - cam.cell.y;
  if (absBig(dCellX) > CULL_CELLS || absBig(dCellY) > CULL_CELLS) return CULLED;
  const sub = subResidue(a, lx, ly, cellX, cellY, g, dL);
  return {
    fx: Number(dCellX) * LOCAL_SPAN - cam.sub.x + sub.x,
    fy: Number(dCellY) * LOCAL_SPAN - cam.sub.y + sub.y,
  };
}

function subResidue(
  a: CellAnchor,
  lx: number,
  ly: number,
  cellX: bigint,
  cellY: bigint,
  g: bigint,
  dL: number,
): { x: number; y: number } {
  if (dL > MAX_EXACT_GAP) return { x: 0, y: 0 }; // sub-ULP → 0, avoids Number(rem)=Infinity
  const remX = a.cell.x - (cellX << g);
  const remY = a.cell.y - (cellY << g);
  return {
    x: ldexp(Number(remX) * LOCAL_SPAN + lx, -dL),
    y: ldexp(Number(remY) * LOCAL_SPAN + ly, -dL),
  };
}
