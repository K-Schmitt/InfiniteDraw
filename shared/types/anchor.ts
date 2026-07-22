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
