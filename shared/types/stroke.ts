/**
 * Core stroke data types — mirrors the Lorien binary format.
 *
 * Binary format per stroke (little-endian):
 *   u8   type
 *   u8   color.r
 *   u8   color.g
 *   u8   color.b
 *   u8   color.a        (extension over Lorien, which had no alpha)
 *   u16  size
 *   u16  pointCount
 *   for each point:
 *     f32  x
 *     f32  y
 *     u8   pressure     (0–255, maps to 0.0–1.0)
 */

import type { CellAnchor, CellBbox } from './anchor.js';

export const StrokeType = {
  BRUSH: 0,
  ERASER: 1,
  LINE: 2,
  RECTANGLE: 3,
  ELLIPSE: 4,
  TRIANGLE: 5,
} as const;

export type StrokeType = (typeof StrokeType)[keyof typeof StrokeType];

/** RGBA color with 8-bit channels (0–255). */
export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A 2D point in world space (not screen space). */
export interface Point {
  x: number;
  y: number;
}

/**
 * A single brush stroke.
 *
 * `points` and `pressures` are parallel arrays — `pressures[i]` corresponds to `points[i]`.
 * Pressure range: 0.0 (no pressure) – 1.0 (full pressure).
 *
 * World-space coordinates; the Camera transforms them to screen space at render time.
 */
export interface BrushStroke {
  id: string;
  type: StrokeType;
  color: Color;
  /** Brush diameter in world-space pixels (1–512). */
  size: number;
  points: Point[];
  pressures: number[];
  layerId: string;
  /** User who created this stroke (set by server, never trusted from client). */
  ownerId?: string;
  createdAt: number;
  /** Absolute hierarchical anchor; `points`/`holes` are cell-local floats in [0, LOCAL_SPAN). */
  anchor: CellAnchor;
  /** Stable global paint order; restored across undo/redo, sorted before render. */
  zIndex: number;
  /** Anchored extent in cell units, for viewport culling before any float. */
  cellBbox: CellBbox;
  /**
   * When true the `points` describe a solid polygon to fill (paint-bucket / filled
   * shapes, or eraser remnants) instead of a centerline traced by perfect-freehand.
   * Optional so existing brush/line/outline strokes are unaffected.
   */
  filled?: boolean;
  /** Inner rings cut out of a filled polygon (e.g. an erased hole). Only used when `filled`. */
  holes?: Point[][];
  /** Paint-bucket fills render behind outlines so borders stay visible. */
  background?: boolean;
}

/**
 * Partial stroke sent during live drawing (before the stroke is committed).
 * Only `id`, `points`, and `pressures` are guaranteed.
 */
export type StrokePreview = Pick<BrushStroke, 'id' | 'points' | 'pressures'>;

/** Serialized bytes-per-point constant for the binary format. */
export const BYTES_PER_POINT = 4 + 4 + 1; // f32 x + f32 y + u8 pressure

/**
 * Fixed header size (before point data) per stroke in the binary format:
 *   u8 type + u8 r + u8 g + u8 b + u8 a + u16 size + u16 pointCount
 */
export const STROKE_HEADER_SIZE = 1 + 1 + 1 + 1 + 1 + 2 + 2;
