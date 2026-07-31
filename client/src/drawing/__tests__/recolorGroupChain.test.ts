import { describe, it, expect } from 'vitest';
import { ringsAdjacent } from '../ringsAdjacent';
import { strokeOutlineRings } from '../outlineStroke';
import { shapePoints } from '../../tools/shapeGeometry';

/**
 * The same-colour recolor group is a BFS over `ringsAdjacent`, so a click anywhere on a painted
 * blob should reach every same-coloured stroke stuck to it — its own outline, the neighbouring
 * shape's outline, and that neighbour's fill.
 *
 * This pins the connectivity the group walk depends on. `StrokeRenderer.sameColorGroup` itself
 * needs a live store and camera, so what is checked here is the geometric rule it runs on, using
 * the geometry the shape tool and the paint bucket actually commit.
 */

function contourOf(from: { x: number; y: number }, to: { x: number; y: number }): number[][] {
  return strokeOutlineRings(shapePoints('rectangle', from, to), 4, true);
}

// A paint-bucket fill of a closed shape lands on that shape's inner ring — the hollow the flood
// found. Taking the outline's own hole is the tightest honest stand-in for it.
function fillOf(contour: number[][]): number[][] {
  return [contour[1]!];
}

// Two rectangles sharing the edge x = 50, each outlined then filled — "une forme collée à une
// autre forme", all in one colour.
const LEFT_CONTOUR = contourOf({ x: 10, y: 10 }, { x: 50, y: 40 });
const RIGHT_CONTOUR = contourOf({ x: 50, y: 10 }, { x: 90, y: 40 });
const LEFT_FILL = fillOf(LEFT_CONTOUR);
const RIGHT_FILL = fillOf(RIGHT_CONTOUR);

/** Ids reachable from `start` by the same pairwise rule `sameColorGroup` walks. */
function reachableFrom(start: string, pool: ReadonlyMap<string, number[][]>): string[] {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = pool.get(queue.pop()!)!;
    for (const [id, rings] of pool) {
      if (seen.has(id) || !ringsAdjacent(current, rings)) continue;
      seen.add(id);
      queue.push(id);
    }
  }
  return [...seen].sort();
}

const POOL = new Map<string, number[][]>([
  ['left-contour', LEFT_CONTOUR],
  ['left-fill', LEFT_FILL],
  ['right-contour', RIGHT_CONTOUR],
  ['right-fill', RIGHT_FILL],
]);

const ALL = ['left-contour', 'left-fill', 'right-contour', 'right-fill'];

describe('same-colour recolor group connectivity', () => {
  it('links a fill to the outline that bounds it', () => {
    expect(ringsAdjacent(LEFT_FILL, LEFT_CONTOUR)).toBe(true);
  });

  it('links two outlines that share an edge', () => {
    expect(ringsAdjacent(LEFT_CONTOUR, RIGHT_CONTOUR)).toBe(true);
  });

  // The behaviour the click on an old contour already gives.
  it('reaches the whole blob from an outline', () => {
    expect(reachableFrom('left-contour', POOL)).toEqual(ALL);
  });

  // The behaviour a click on an old *interior* must give too: today it recolors that one fill.
  it('reaches the whole blob from a fill', () => {
    expect(reachableFrom('left-fill', POOL)).toEqual(ALL);
  });
});
