import polygonClipping from 'polygon-clipping';
import type { Point } from '@shared/stroke';
import { frameForRings, mapPair, unmapPair, ringToPairs, type Pair } from './polyScale';
import { pointInPolygon } from './hitTest';
import { log } from '../debug/logger';

type MultiPolygon = Pair[][][];

const CIRCLE_SEGMENTS = 16;
// A difference whose area is within this fraction of the subject counts as "unchanged" (miss).
const AREA_EPS = 1e-3;

interface Box {
  minX: number; minY: number; maxX: number; maxY: number;
}

/** Eraser footprint along `path`: a capsule (segment rectangles + round ends) of the given radius. */
export function eraserStamp(path: readonly Point[], radius: number): MultiPolygon {
  const parts: Pair[][][] = [];
  for (const p of path) parts.push(circle(p, radius));
  for (let i = 1; i < path.length; i++) {
    const quad = segmentQuad(path[i - 1]!, path[i]!, radius);
    if (quad) parts.push(quad);
  }
  if (parts.length === 0) return [];
  try {
    return polygonClipping.union(parts[0]!, ...parts.slice(1));
  } catch (err) {
    // polygon-clipping is known to fail on near-degenerate input ("Unable to complete output
    // ring"). Capture the exact geometry that broke it rather than letting the throw escape
    // and abort the gesture mid-way, which leaves the eraser's `last` point unset.
    log('error', 'polygon-clipping union FAILED (eraserStamp)', {
      message: err instanceof Error ? err.message : String(err),
      radius, pathLength: path.length, parts: parts.length,
      path: path.slice(0, 8),
    });
    return [];
  }
}

/**
 * Subtracts the stamp from a stroke's rendered rings. Returns null when the stamp does
 * not touch the stroke, otherwise the remaining geometry (possibly empty = fully erased).
 */
export function subtractStamp(rings: readonly number[][], stamp: MultiPolygon): MultiPolygon | null {
  if (rings.length === 0 || stamp.length === 0) return null;
  const subject = rings.map(ringToPairs);
  // Cheap bbox reject before any polygon-clipping — this runs per stroke per pointermove step, so
  // the common "stamp nowhere near this stroke" case must stay O(1) and never touch the clipper.
  if (!boxOverlap(bboxOfPolys(subject), bboxOfMulti(stamp))) return null;
  // normalize subject + stamp together so polygon-clipping stays robust at extreme zoom
  const frame = frameForRings([...subject, ...stamp.flat()]);
  if (!frame) return null;
  const subjectM = subject.map((r) => r.map((p) => mapPair(p, frame)));
  const stampM = stamp.map((poly) => poly.map((r) => r.map((p) => mapPair(p, frame))));
  try {
    // One clip, not two. The old intersection() pre-check doubled the per-stroke cost; the area
    // of the difference tells us the same thing: unchanged area ⇒ the stamp missed.
    const diff = polygonClipping.difference(subjectM, stampM);
    const subjArea = polyArea(subjectM);
    if (multiArea(diff) >= subjArea * (1 - AREA_EPS)) return null; // grazed bbox, cut nothing
    if (diff.length === 0) {
      // Fully removed. Accept a whole-stroke erase only when the stamp genuinely covers the
      // stroke; an empty diff on a thin sliver is polygon-clipping precision collapse (which used
      // to silently delete the entire stroke with no remnant), so treat that as a miss instead.
      return stampCovers(subjectM, stampM) ? [] : null;
    }
    return diff.map((poly) => poly.map((r) => r.map((p) => unmapPair(p, frame))));
  } catch (err) {
    // Same known failure as in `eraserStamp`. Treating it as "stamp missed" keeps the gesture
    // alive; the alternative (rethrow) aborts the eraser mid-drag and wedges its state.
    log('error', 'polygon-clipping FAILED (subtractStamp)', {
      message: err instanceof Error ? err.message : String(err),
      subjectRings: subject.length,
      subjectVertices: subject.reduce((n, r) => n + r.length, 0),
      stampPolys: stamp.length, frame,
    });
    return null;
  }
}

function circle(c: Point, r: number): Pair[][] {
  const ring: Pair[] = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    ring.push([c.x + r * Math.cos(a), c.y + r * Math.sin(a)]);
  }
  return [ring];
}

function bboxOfPolys(polys: readonly Pair[][]): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const ring of polys) accumulate(ring, box);
  return box;
}

function bboxOfMulti(multi: MultiPolygon): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const poly of multi) for (const ring of poly) accumulate(ring, box);
  return box;
}

function accumulate(ring: readonly Pair[], box: Box): void {
  for (const [x, y] of ring) {
    if (x < box.minX) box.minX = x;
    if (x > box.maxX) box.maxX = x;
    if (y < box.minY) box.minY = y;
    if (y > box.maxY) box.maxY = y;
  }
}

function boxOverlap(a: Box, b: Box): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;
}

// Area of one polygon: outer ring minus its holes (shoelace, absolute).
function polyArea(poly: readonly Pair[][]): number {
  let area = ringArea(poly[0] ?? []);
  for (let h = 1; h < poly.length; h++) area -= ringArea(poly[h]!);
  return area;
}

// Total area across every polygon of a multipolygon.
function multiArea(multi: MultiPolygon): number {
  let total = 0;
  for (const poly of multi) total += polyArea(poly);
  return total;
}

function ringArea(ring: readonly Pair[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

// True when every outer-ring vertex of the subject lies inside the stamp — a genuine full erase.
function stampCovers(subject: readonly Pair[][], stamp: MultiPolygon): boolean {
  const outer = subject[0];
  if (!outer || outer.length === 0) return false;
  const stampFlats = stamp.map((poly) => flatten(poly[0] ?? []));
  for (const [x, y] of outer) {
    if (!stampFlats.some((flat) => pointInPolygon(x, y, flat))) return false;
  }
  return true;
}

function flatten(ring: readonly Pair[]): number[] {
  const flat: number[] = [];
  for (const [x, y] of ring) flat.push(x, y);
  return flat;
}

function segmentQuad(a: Point, b: Point, r: number): Pair[][] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const nx = (-dy / len) * r;
  const ny = (dx / len) * r;
  return [[[a.x + nx, a.y + ny], [b.x + nx, b.y + ny], [b.x - nx, b.y - ny], [a.x - nx, a.y - ny]]];
}
