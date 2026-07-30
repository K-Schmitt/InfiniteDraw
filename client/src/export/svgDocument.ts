import type { Color } from '@shared/stroke';
import { ringsToPathData } from './svgPath';
import type { ExportBounds, ExportItem, ExportScope } from './exportScope';

/** Coordinate decimals kept in the `d` attribute and viewBox. 3 is sub-pixel at any sane scale. */
const PRECISION = 3;
/** Decimals kept for fill-opacity — a 0–1 fraction, deliberately independent of coordinates. */
const OPACITY_PRECISION = 3;
/** Padding added around the content bounds, in reference-local units. */
const PAD = 1;

/**
 * Assembles a standalone SVG. Coordinates are reference-anchor-local (see `buildExportScope`),
 * and the reference is recorded in `data-anchor-*` so an export can be traced back to the exact
 * quadtree cell it was measured from — the closest thing this canvas has to absolute coordinates.
 */
export function buildSvgDocument(scope: ExportScope, background: string): string {
  const view = viewBox(scope.bounds);
  const meta = [
    `data-anchor-level="${scope.reference.level}"`,
    `data-anchor-cell-x="${scope.reference.cell.x}"`,
    `data-anchor-cell-y="${scope.reference.cell.y}"`,
    `data-skipped="${scope.skipped}"`,
  ].join(' ');
  const body = scope.items.map(pathElement).filter((p) => p.length > 0).join('\n  ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" ${meta}>
  ${backgroundRect(scope.bounds, background)}
  ${body}
</svg>
`;
}

function viewBox(b: ExportBounds): string {
  const r = paddedRect(b);
  return `${round(r.x)} ${round(r.y)} ${round(r.width)} ${round(r.height)}`;
}

/**
 * The padded content rect shared by the viewBox and the background fill, so they can't drift.
 * A `<rect>` at a hardcoded `(-PAD, -PAD)` only lines up with the viewBox when the content bounds
 * start at exactly (0,0) — i.e. never, for a real drawing — which paints the canvas colour
 * somewhere other than where the viewBox is looking.
 */
function paddedRect(b: ExportBounds): { x: number; y: number; width: number; height: number } {
  return {
    x: b.minX - PAD,
    y: b.minY - PAD,
    width: b.maxX - b.minX + PAD * 2,
    height: b.maxY - b.minY + PAD * 2,
  };
}

function backgroundRect(b: ExportBounds, fill: string): string {
  const r = paddedRect(b);
  return `<rect x="${round(r.x)}" y="${round(r.y)}" width="${round(r.width)}" `
    + `height="${round(r.height)}" fill="${fill}"/>`;
}

function pathElement(item: ExportItem): string {
  const d = ringsToPathData(item.rings, PRECISION);
  if (d.length === 0) return '';
  const alpha = round(item.color.a / 255, OPACITY_PRECISION);
  const opacity = item.color.a === 255 ? '' : ` fill-opacity="${alpha}"`;
  return `<path d="${d}" fill="${hex(item.color)}"${opacity} fill-rule="evenodd"/>`;
}

function hex(c: Color): string {
  const part = (v: number): string => v.toString(16).padStart(2, '0');
  return `#${part(c.r)}${part(c.g)}${part(c.b)}`;
}

function round(value: number, precision = PRECISION): number {
  return Number(value.toFixed(precision));
}
