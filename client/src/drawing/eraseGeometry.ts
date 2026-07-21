import polygonClipping from 'polygon-clipping';
import type { Point } from '@shared/stroke';
import { frameForRings, mapPair, unmapPair, ringToPairs, type Pair } from './polyScale';

type MultiPolygon = Pair[][][];

const CIRCLE_SEGMENTS = 16;

/** Eraser footprint along `path`: a capsule (segment rectangles + round ends) of the given radius. */
export function eraserStamp(path: readonly Point[], radius: number): MultiPolygon {
  const parts: Pair[][][] = [];
  for (const p of path) parts.push(circle(p, radius));
  for (let i = 1; i < path.length; i++) {
    const quad = segmentQuad(path[i - 1]!, path[i]!, radius);
    if (quad) parts.push(quad);
  }
  if (parts.length === 0) return [];
  return polygonClipping.union(parts[0]!, ...parts.slice(1));
}

/**
 * Subtracts the stamp from a stroke's rendered rings. Returns null when the stamp does
 * not touch the stroke, otherwise the remaining geometry (possibly empty = fully erased).
 */
export function subtractStamp(rings: readonly number[][], stamp: MultiPolygon): MultiPolygon | null {
  if (rings.length === 0 || stamp.length === 0) return null;
  const subject = rings.map(ringToPairs);
  // normalize subject + stamp together so polygon-clipping stays robust at extreme zoom
  const frame = frameForRings([...subject, ...stamp.flat()]);
  if (!frame) return null;
  const subjectM = subject.map((r) => r.map((p) => mapPair(p, frame)));
  const stampM = stamp.map((poly) => poly.map((r) => r.map((p) => mapPair(p, frame))));
  if (polygonClipping.intersection(subjectM, stampM).length === 0) return null;
  const diff = polygonClipping.difference(subjectM, stampM);
  return diff.map((poly) => poly.map((r) => r.map((p) => unmapPair(p, frame))));
}

function circle(c: Point, r: number): Pair[][] {
  const ring: Pair[] = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    ring.push([c.x + r * Math.cos(a), c.y + r * Math.sin(a)]);
  }
  return [ring];
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
