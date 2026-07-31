import type { BrushStroke, Color } from '@shared/stroke';

export interface WallCandidate {
  stroke: Pick<BrushStroke, 'background'>;
  rings: number[][];
}

/**
 * Walls that bound a paint-bucket fill: every stroke EXCEPT background fills. A fill is paint —
 * rasterized as a wall it covers its whole interior with ink, so any later click on filled area
 * (a repeat click, or a click inside a sub-shape drawn on top) would land on ink and never flood
 * a region again. Outlines always bound the region, whatever their colour, so a shape can still
 * be filled with its own outline colour.
 */
export function selectFillWalls(items: readonly WallCandidate[]): number[][][] {
  const walls: number[][][] = [];
  for (const item of items) {
    if (item.stroke.background) continue;
    walls.push(item.rings);
  }
  return walls;
}

export function sameColor(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}
