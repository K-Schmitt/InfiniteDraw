import type { Container } from 'pixi.js';
import type { BrushStroke, Color, Point } from '@shared/stroke';
import type { ProjCamera } from '../coords/viewProject';
import type { HierCamera } from '../app/HierCamera';
import type { FillTargetResult, FrameCandidate } from '../drawing/StrokeRenderer';
import type { ShapeKind } from './shapeGeometry';

/** Axis-aligned bounds in camera-frame local units. */
export interface FrameBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Mutable drawing settings shared by every tool and the toolbar UI. */
export interface ToolSettings {
  primary: Color;
  secondary: Color;
  /** Brush / line / shape thickness in *screen* pixels (divided by zoom at draw time). */
  size: number;
  shape: ShapeKind;
  layerId: string;
}

/**
 * Per-pointer-event context handed to a tool. `frame` is the pointer in camera-frame local
 * units (offset from the camera origin); `projCamera` + `cameraScale` let the tool anchor the
 * gesture and derive on-screen widths. No world coordinates — those collapse past float64 zoom.
 */
export interface ToolContext {
  frame: Point;
  projCamera: ProjCamera;
  /** World→pixel scale at gesture time (= 2^(level+frac)). */
  cameraScale: number;
  pressure: number;
}

/** How tools mutate the scene and query existing strokes (implemented by PixiApp). */
export interface CanvasApi {
  add(stroke: BrushStroke): void;
  /** Apply one eraser step live (no history). */
  eraseLive(removeIds: readonly string[], additions: readonly BrushStroke[]): void;
  /** Seal the current erase gesture into a single undo step. */
  eraseEnd(): void;
  /** Strokes overlapping a frame box, with their rings already projected to the camera frame. */
  strokesInFrame(box: FrameBox, camera: ProjCamera): FrameCandidate[];
  pickColorAt(frame: Point, camera: ProjCamera): Color | undefined;
  /** Paint-bucket target under the point: a region to fill, a group to recolor, or null. */
  fillTarget(frame: Point, camera: ProjCamera, color: Color): FillTargetResult | null;
  /** Recolors several strokes in one undo step (in-place recolor). */
  recolorMany(ids: readonly string[], color: Color): void;
}

/**
 * A drawing tool. Pointer callbacks receive camera-frame coordinates, so every tool stays
 * correct at any zoom depth. `preview` is the tool's overlay graphics.
 */
export interface Tool {
  readonly preview: Container;
  /** Non-null while a stroke is being recorded live (BrushTool). Null for instant-commit tools. */
  readonly tentativeStrokeId: string | null;
  onDown(ctx: ToolContext): void;
  onMove(ctx: ToolContext): void;
  onUp(ctx: ToolContext): void;
  refreshPreview(camera: HierCamera): void;
  cancel(): void;
}
