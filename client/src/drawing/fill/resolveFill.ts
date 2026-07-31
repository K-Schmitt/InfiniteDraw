import { log } from '../../debug/logger';
import { boundingWallIndices } from './boundingWalls';
import { exactRegionAt } from './exactRegion';
import { floodRegion } from './floodRegion';
import type { PixelBuffer, RegionMask } from './maskBuffer';
import { maskPxToFrame, type MaskOrigin } from './maskLayout';
import { fitVertexBudget } from './simplifyRing';
import { groupRings, traceMask, type TracedRegion } from './traceMask';

/** Douglas-Peucker tolerance in screen pixels for the raster fallback contour. */
const TRACE_TOLERANCE_PX = 1;

/** Unpadded buffer: pixel (0,0) is the viewport's top-left, the frame origin. */
const VIEWPORT_ORIGIN: MaskOrigin = { x: 0, y: 0 };

export interface FillPixelSource {
  readonly buffer: PixelBuffer;
  /** ORIGINAL (unclipped) frame rings of the walls, indexed exactly as painted into `buffer`. */
  readonly wallRings: readonly number[][][];
}

export interface ResolveFillRequest {
  readonly source: FillPixelSource;
  /** Seed in BUFFER pixels (screen px minus `originPx`). */
  readonly seedPx: { readonly x: number; readonly y: number };
  /** Screen pixels per camera-frame unit — converts the traced contour back to frame units. */
  readonly frameScale: number;
  /** Screen-px position of buffer pixel (0,0). Omitted = buffer starts at the frame origin. */
  readonly originPx?: MaskOrigin;
}

export interface ResolvedFill {
  readonly rings: number[][];
  /** True when the exact geometric stage produced the boundary; false = traced raster contour. */
  readonly exact: boolean;
  readonly wallIndices: number[];
}

/**
 * Two-stage paint bucket.
 *
 * Stage 1 (raster) answers *which* region and *which* strokes bound it, in bounded screen space,
 * so it is equally cheap and equally correct at 1× and at 10^40×. Stage 2 (exact) rebuilds that
 * region's boundary from the bounding strokes alone, giving a resolution-free polygon. Only when
 * stage 2 fails does the ~1px traced contour reach the committed stroke.
 */
export function resolveFill(request: ResolveFillRequest): ResolvedFill | null {
  const mask = floodRegion(request.source.buffer, request.seedPx);
  if (!mask || mask.count === 0) return null;
  // An escaped flood is the open exterior, not a region. Committing it would paint a
  // viewport-sized background stroke, broadcast it to every peer and append it to the journal —
  // the destructive failure the old `enclosedRegionAt.touchesBoundary` existed to prevent.
  if (mask.escaped) {
    log('geom', 'fill refused: region is open', { pixels: mask.count });
    return null;
  }
  const wallIndices = boundingWallIndices(mask, request.source.buffer);
  const traced = frameRegion(mask, request.frameScale, request.originPx ?? VIEWPORT_ORIGIN);
  if (!traced) return null;
  const exact = tryExact(request, wallIndices, traced);
  // The budget is a wire-size guarantee, so it has to bind on the path that normally wins too —
  // an exact face inherits every perfect-freehand vertex of its bounding strokes. Tolerance here
  // is in frame units, not pixels: TRACE_TOLERANCE_PX / frameScale.
  if (exact) {
    const fitted = fitVertexBudget(
      { outer: exact[0]!, holes: exact.slice(1) },
      TRACE_TOLERANCE_PX / request.frameScale,
    );
    return { rings: [fitted.outer, ...fitted.holes], exact: true, wallIndices };
  }
  log('geom', 'fill fell back to traced contour', {
    walls: wallIndices.length, pixels: mask.count, vertices: traced.outer.length / 2,
  });
  return { rings: [traced.outer, ...traced.holes], exact: false, wallIndices };
}

/** Traced, simplified, budget-fitted contour of the mask, converted to camera-frame units. */
function frameRegion(
  mask: RegionMask,
  frameScale: number,
  originPx: MaskOrigin,
): TracedRegion | null {
  // A 4-connected flood has exactly one outer ring, so there is nothing to choose between —
  // and ranking by `outer.length` would rank by vertex count, not area, if there ever were.
  const largest = groupRings(traceMask(mask))[0];
  if (!largest) return null;
  const fitted = fitVertexBudget(largest, TRACE_TOLERANCE_PX);
  return {
    outer: maskPxToFrame(fitted.outer, frameScale, originPx),
    holes: fitted.holes.map((h) => maskPxToFrame(h, frameScale, originPx)),
  };
}

/**
 * The seed is the user's own click, converted to frame units — provably inside the region, because
 * the flood started there. A vertex centroid is not: it falls outside any L-shape or crescent, and
 * `pickFace` would then reject a perfectly good exact face and drop to the 1px raster contour.
 *
 * The wall set is the colour-derived index set **unioned with** any wall whose frame bbox overlaps
 * the region: `renderWallMask` paints walls in array order with opaque colours, so a wall fully
 * overpainted by a later one contributes zero pixels and never appears in `boundingWallIndices`
 * even though it geometrically bounds the region — and stage 2 would then leak through it.
 */
function tryExact(
  request: ResolveFillRequest,
  wallIndices: readonly number[],
  traced: TracedRegion,
): number[][] | null {
  const bbox = ringBbox(traced.outer);
  const walls = wallsFor(request.source.wallRings, wallIndices, bbox);
  if (walls.length === 0) return null;
  const origin = request.originPx ?? VIEWPORT_ORIGIN;
  const seed = {
    x: (request.seedPx.x + origin.x) / request.frameScale,
    y: (request.seedPx.y + origin.y) / request.frameScale,
  };
  return exactRegionAt({ seed, walls, hint: bbox });
}

function wallsFor(
  all: readonly number[][][],
  indices: readonly number[],
  bbox: RegionHintBox,
): number[][][] {
  const chosen = new Set(indices);
  const out: number[][][] = [];
  for (let i = 0; i < all.length; i++) {
    const rings = all[i];
    if (!rings) continue;
    if (chosen.has(i) || overlaps(ringBbox(rings.flat()), bbox)) out.push(rings);
  }
  return out;
}

function overlaps(a: RegionHintBox, b: RegionHintBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

interface RegionHintBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function ringBbox(ring: readonly number[]): RegionHintBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]!); maxX = Math.max(maxX, ring[i]!);
    minY = Math.min(minY, ring[i + 1]!); maxY = Math.max(maxY, ring[i + 1]!);
  }
  return { minX, minY, maxX, maxY };
}
