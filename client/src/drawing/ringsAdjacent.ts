import polygonClipping from 'polygon-clipping';
import type { Point } from '@shared/stroke';
import { distancePointToSegment } from './hitTest';
import { frameForRings, mapPair, ringToPairs, type Pair } from './polyScale';

/**
 * Raw camera-frame units, NOT normalized units — real "touching" geometry (a fill against its
 * bounding outline, two facets either side of a wall) never lands bit-exact: the anchor
 * frame<->local round-trip and the exact-stage's Douglas-Peucker simplification each leave a
 * sub-unit residual. A fixed threshold in the [0,1000]-conditioned frame does NOT stay a fixed
 * physical tolerance: `frameForRings`'s scale `k = 1000 / combinedExtent` shrinks as the pair's
 * combined extent grows, so the identical physical gap reads as "adjacent" for two small shapes
 * and "not adjacent" for two large ones — silently breaking the same-colour recolor group's BFS
 * chain wherever it has to cross a large shape, which is exactly backwards: a real gap should be
 * rejected regardless of scale, and a real touch should be accepted regardless of scale.
 */
const ADJACENT_TOL_PX = 1;

/**
 * True if two strokes are adjacent — their areas overlap, OR their boundaries touch
 * (a fill and its outline share an edge, so bbox/area-overlap alone would miss them).
 */
export function ringsAdjacent(a: readonly number[][], b: readonly number[][]): boolean {
  const A = a.map(ringToPairs);
  const B = b.map(ringToPairs);
  const frame = frameForRings([...A, ...B]);
  if (!frame) return false;
  const am = A.map((r) => r.map((p) => mapPair(p, frame)));
  const bm = B.map((r) => r.map((p) => mapPair(p, frame)));
  try {
    if (polygonClipping.intersection(am, bm).length > 0) return true;
  } catch {
    return false;
  }
  // Convert back to raw units before comparing — the conditioning frame is for polygon-clipping's
  // numerical stability only, the adjacency tolerance itself must stay scale-invariant.
  return minBoundaryDistance(am, bm, ADJACENT_TOL_PX * frame.k) / frame.k <= ADJACENT_TOL_PX;
}

/** `earlyExitNormalized` is the raw-unit tolerance pre-scaled into the same conditioned space
 *  as `a`/`b`, so the early exit can stop scanning as soon as the answer is already decided. */
function minBoundaryDistance(a: Pair[][], b: Pair[][], earlyExitNormalized: number): number {
  let min = Infinity;
  const scan = (rings: Pair[][], other: Pair[][]): boolean => {
    for (const ring of rings) {
      for (const [x, y] of ring) {
        min = Math.min(min, distanceToRings({ x, y }, other));
        if (min <= earlyExitNormalized) return true;
      }
    }
    return false;
  };
  if (scan(a, b)) return min;
  scan(b, a);
  return min;
}

function distanceToRings(p: Point, rings: Pair[][]): number {
  let min = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      min = Math.min(min, distancePointToSegment(p, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }));
    }
  }
  return min;
}
