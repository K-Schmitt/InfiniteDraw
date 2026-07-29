import polygonClipping from 'polygon-clipping';
import type { Point } from '@shared/stroke';
import { pointInPolygon, distancePointToSegment } from './hitTest';
import { frameForRings, mapPair, unmapPair, ringToPairs, type Pair } from './polyScale';

const MARGIN = 50; // padding around the normalized [0,1000] frame for the outer box

/**
 * Geometric paint-bucket. Computes (bounding box − all strokes) so the empty space is
 * split into planar faces, then returns the exact face under `world` — its outer ring
 * plus any inner holes (e.g. a band between two nested shapes). Faces are disjoint, so
 * each fillable cell is independent (clean nesting + unambiguous re-coloring). Returns
 * null for the open exterior. Runs in a normalized frame → robust at any zoom. World coords.
 */
export function enclosedRegionAt(world: Point, strokes: readonly number[][][]): number[][] | null {
  if (strokes.length === 0) return null;
  const polys = strokes.map((rings) => rings.map(ringToPairs));
  const frame = frameForRings(polys.flat());
  if (!frame) return null;

  const solid = polys.map((rings) => rings.map((r) => r.map((p) => mapPair(p, frame))));
  let empty;
  try {
    empty = polygonClipping.difference([boxRing()], ...solid);
  } catch {
    return null;
  }
  const cell = pickCell(mapPair([world.x, world.y], frame), empty);
  return cell ? cell.map((ring) => flatUnmap(ring, frame)) : null;
}

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

// returns the enclosed face under the point; rejects faces touching the artificial box (open regions)
function pickCell(world: Pair, faces: Pair[][][]): Pair[][] | null {
  if (faces.length === 0) return null;
  for (let i = 0; i < faces.length; i++) {
    const face = faces[i]!;
    if (touchesBoundary(face)) continue;
    if (inside(world, face[0]!) && !inAnyHole(world, face)) return face;
  }
  return null;
}

function touchesBoundary(face: Pair[][]): boolean {
  // polygon-clipping might generate precise exact intersections on the box edges.
  for (const [x, y] of face[0]!) {
    if (x <= -MARGIN + 1e-4 || x >= 1000 + MARGIN - 1e-4 || y <= -MARGIN + 1e-4 || y >= 1000 + MARGIN - 1e-4) {
      return true;
    }
  }
  return false;
}

function inAnyHole(world: Pair, face: Pair[][]): boolean {
  for (let h = 1; h < face.length; h++) {
    if (inside(world, face[h]!)) return true;
  }
  return false;
}

function boxRing(): Pair[] {
  return [
    [-MARGIN, -MARGIN],
    [1000 + MARGIN, -MARGIN],
    [1000 + MARGIN, 1000 + MARGIN],
    [-MARGIN, 1000 + MARGIN],
  ];
}

function inside(p: Pair, ring: Pair[]): boolean {
  const flat: number[] = [];
  for (const [x, y] of ring) flat.push(x, y);
  return pointInPolygon(p[0], p[1], flat);
}

function flatUnmap(ring: Pair[], frame: Parameters<typeof unmapPair>[1]): number[] {
  const out: number[] = [];
  for (const p of ring) {
    const [x, y] = unmapPair(p, frame);
    out.push(x, y);
  }
  return out;
}
