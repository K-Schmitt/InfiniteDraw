import polygonClipping from 'polygon-clipping';
import type { Point } from '@shared/stroke';
import { distancePointToSegment } from './hitTest';
import { frameForRings, mapPair, ringToPairs, type Pair } from './polyScale';

const ADJACENT_TOL = 1; // normalized units (~1000 frame): shared edges are exact, gaps are large

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
  return minBoundaryDistance(am, bm) <= ADJACENT_TOL;
}

function minBoundaryDistance(a: Pair[][], b: Pair[][]): number {
  let min = Infinity;
  const scan = (rings: Pair[][], other: Pair[][]): boolean => {
    for (const ring of rings) {
      for (const [x, y] of ring) {
        min = Math.min(min, distanceToRings({ x, y }, other));
        if (min <= ADJACENT_TOL) return true;
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
