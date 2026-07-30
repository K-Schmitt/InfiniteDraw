import type { BrushStroke, Color } from '@shared/stroke';

export interface WallCandidate {
  stroke: Pick<BrushStroke, 'color' | 'background'>;
  rings: number[][];
}

/**
 * Walls that bound a new paint-bucket fill. Every stroke bounds the region EXCEPT a
 * same-colour background fill — that is already-painted area a same-colour fill should merge
 * into, not treat as a boundary. Same-colour *outlines* still bound the region, so a shape can
 * be filled with its own outline colour.
 */
export function selectFillWalls(items: readonly WallCandidate[], color: Color): number[][][] {
  const walls: number[][][] = [];
  for (const item of items) {
    if (item.stroke.background && sameColor(item.stroke.color, color)) continue;
    walls.push(item.rings);
  }
  return walls;
}

export function sameColor(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}
