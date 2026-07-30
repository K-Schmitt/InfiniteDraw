import { LOCAL_SPAN, type CellAnchor } from '@shared/anchor';
import type { ProjCamera } from './viewProject';

/**
 * Inverse of projectToFrame at the camera's level: a camera-frame float offset → an anchor at
 * the camera level plus cell-local coords in [0, LOCAL_SPAN). Absolute world position:
 * worldCellX = camera.cell.x + floor((camera.sub.x + fx) / LOCAL_SPAN).
 */
export function frameToAnchor(
  fx: number,
  fy: number,
  camera: ProjCamera,
): { anchor: CellAnchor; lx: number; ly: number } {
  const worldX = camera.sub.x + fx;
  const worldY = camera.sub.y + fy;
  const cellDX = Math.floor(worldX / LOCAL_SPAN);
  const cellDY = Math.floor(worldY / LOCAL_SPAN);
  return {
    anchor: {
      level: camera.level,
      cell: { x: camera.cell.x + BigInt(cellDX), y: camera.cell.y + BigInt(cellDY) },
    },
    lx: worldX - cellDX * LOCAL_SPAN,
    ly: worldY - cellDY * LOCAL_SPAN,
  };
}
