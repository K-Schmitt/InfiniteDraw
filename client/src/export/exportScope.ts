import type { Color } from '@shared/stroke';
import type { CellAnchor } from '@shared/anchor';
import type { ProjCamera } from '../coords/viewProject';
import { ringsToFrame, frameBboxOf } from '../drawing/projectRings';
import { paintOrder } from '../drawing/StrokeRenderer';

/** A committed stroke reduced to what an export needs, in its own anchor-local coordinates. */
export interface ExportSource {
  readonly id: string;
  readonly anchor: CellAnchor;
  readonly rings: number[][];
  readonly color: Color;
  readonly zIndex: number;
  readonly isBackground: boolean;
}

/** The same stroke, reprojected into the reference anchor's coordinate system. */
export interface ExportItem {
  readonly id: string;
  readonly rings: number[][];
  readonly color: Color;
  readonly zIndex: number;
  readonly isBackground: boolean;
}

export interface ExportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ExportScope {
  readonly reference: CellAnchor;
  readonly items: ExportItem[];
  readonly bounds: ExportBounds;
  /** Strokes too far from the reference to share one float64 frame — a level gap past ~53, or
   *  raw cell-grid distance at a similar level — and therefore not representable. */
  readonly skipped: number;
}

/**
 * A virtual camera parked exactly on the reference cell. Feeding this to `projectToFrame` yields
 * coordinates in the reference cell's local units, so the export reuses the renderer's own
 * projection instead of inventing a second coordinate path (locked invariant 4).
 */
export function referenceCamera(reference: CellAnchor): ProjCamera {
  return { level: reference.level, cell: { ...reference.cell }, sub: { x: 0, y: 0 } };
}

/**
 * Reprojects every stroke into one flat coordinate system so an SVG viewBox exists at all.
 * Strokes whose anchor is too far from the reference are dropped and counted — that is a real
 * mathematical limit of a single float64 frame, not a bug, and the caller surfaces the count.
 */
export function buildExportScope(
  source: readonly ExportSource[],
  reference: CellAnchor,
): ExportScope {
  const camera = referenceCamera(reference);
  const items: ExportItem[] = [];
  let skipped = 0;
  for (const s of source) {
    const rings = ringsToFrame(s.anchor, s.rings, camera);
    if (!rings) {
      skipped++;
      continue;
    }
    items.push({
      id: s.id, rings, color: s.color, zIndex: s.zIndex, isBackground: s.isBackground,
    });
  }
  items.sort(byPaintOrder);
  return { reference, items, bounds: boundsOf(items), skipped };
}

/**
 * Background fills paint under every real stroke. This reuses the renderer's own policy rather
 * than re-deriving it: SVG element order *is* z-order, so a second encoding of the same rule in a
 * second file would drift silently the day `BG_ORDER` or the background split changes.
 */
function byPaintOrder(a: ExportItem, b: ExportItem): number {
  return paintOrder(a.isBackground, a.zIndex) - paintOrder(b.isBackground, b.zIndex);
}

function boundsOf(items: readonly ExportItem[]): ExportBounds {
  const box = frameBboxOf(items.flatMap((i) => i.rings));
  // Guard on finiteness, not on `items.length`: a surviving item can legitimately have zero ring
  // vertices (`ringsToFrame` returns `[]`, not `null`, for a degenerate stroke), and then
  // `frameBboxOf` returns its ±Infinity sentinels — which would emit `viewBox="Infinity …"`.
  if (!Number.isFinite(box.minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY };
}
