import type { CellAnchor } from '@shared/anchor';
import type { ProjCamera } from '../coords/viewProject';

export type Bbox = { minX: bigint; minY: bigint; maxX: bigint; maxY: bigint };
export interface IndexHit {
  id: string;
  zIndex: number;
}
interface Entry {
  anchor: CellAnchor;
  bbox: Bbox;
  zIndex: number;
}

/**
 * Spatial index over anchored strokes. Query brings each entry's cell bbox to the camera level
 * in BigInt and tests overlap ± a cell radius — a coarse reject entirely in BigInt, before any
 * float. (Linear scan for now; bucketing is added only if the perf bench demands it.)
 */
export class SpatialIndex {
  private readonly entries = new Map<string, Entry>();

  insert(id: string, anchor: CellAnchor, cellBbox: Bbox, zIndex: number): void {
    this.entries.set(id, { anchor, bbox: cellBbox, zIndex });
  }

  remove(id: string): void {
    this.entries.delete(id);
  }

  queryViewport(camera: ProjCamera, radiusCells: bigint): IndexHit[] {
    const hits: IndexHit[] = [];
    for (const [id, e] of this.entries) {
      if (overlaps(e, camera, radiusCells)) hits.push({ id, zIndex: e.zIndex });
    }
    return hits;
  }
}

function overlaps(e: Entry, cam: ProjCamera, r: bigint): boolean {
  const b = bringBboxToLevel(e.bbox, e.anchor.level - cam.level);
  return b.minX <= cam.cell.x + r && b.maxX >= cam.cell.x - r
      && b.minY <= cam.cell.y + r && b.maxY >= cam.cell.y - r;
}

// dL>0: entry finer → shift cells right (coarsen); dL<0: entry coarser → shift left.
function bringBboxToLevel(b: Bbox, dL: number): Bbox {
  if (dL === 0) return b;
  const g = BigInt(Math.abs(dL));
  const f = dL > 0 ? (v: bigint): bigint => v >> g : (v: bigint): bigint => v << g;
  return { minX: f(b.minX), minY: f(b.minY), maxX: f(b.maxX), maxY: f(b.maxY) };
}
