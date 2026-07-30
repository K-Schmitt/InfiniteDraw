/** Absolute hierarchical anchor: a cell at a quadtree level (base 2). */
export interface CellAnchor {
  level: number;
  cell: { x: bigint; y: bigint };
}

/** Local float units per cell. Locked. */
export const LOCAL_SPAN = 65536;
export const LOCAL_SPAN_N = 65536n;

/** Stable dictionary key for a cell at a level. */
export function cellKey(level: number, x: bigint, y: bigint): string {
  return `${level}:${x}:${y}`;
}

/** Anchored extent in cell units (for viewport culling before any float). */
export interface CellBbox {
  minX: bigint;
  minY: bigint;
  maxX: bigint;
  maxY: bigint;
}

/** Default anchor at the origin cell of level 0. */
export function originAnchor(): CellAnchor {
  return { level: 0, cell: { x: 0n, y: 0n } };
}

/** Default single-cell bbox at the origin. */
export function originBbox(): CellBbox {
  return { minX: 0n, minY: 0n, maxX: 0n, maxY: 0n };
}
