import type { Container } from 'pixi.js';
import type { BrushStroke, Color, Point } from '@shared/stroke';
import type { Camera } from '@shared/camera';
import type { BoundingBox } from '../drawing/Culling';
import type { FillTargetResult } from '../drawing/StrokeRenderer';
import type { ShapeKind } from './shapeGeometry';

/** Mutable drawing settings shared by every tool and the toolbar UI. */
export interface ToolSettings {
  primary: Color;
  secondary: Color;
  /** Brush / line / shape thickness in *screen* pixels (divided by zoom at draw time). */
  size: number;
  shape: ShapeKind;
  layerId: string;
}

/** Per-pointer-event context handed to a tool — always in world space. */
export interface ToolContext {
  world: Point;
  pressure: number;
  zoom: number;
}

/** How tools mutate the scene and query existing strokes (implemented by PixiApp). */
export interface CanvasApi {
  add(stroke: BrushStroke): void;
  /** Apply one eraser step live (no history). */
  eraseLive(removeIds: readonly string[], additions: readonly BrushStroke[]): void;
  /** Seal the current erase gesture into a single undo step. */
  eraseEnd(): void;
  strokesNear(bbox: BoundingBox): BrushStroke[];
  pickColorAt(world: Point): Color | undefined;
  /** Paint-bucket target under the point: a cell to fill, a group to recolor, or null. */
  fillTarget(world: Point, color: Color): FillTargetResult | null;
  /** Recolors several strokes in one undo step (in-place recolor). */
  recolorMany(ids: readonly string[], color: Color): void;
}

/**
 * A drawing tool. Pointer callbacks receive world-space coordinates, so every tool
 * stays correct at any zoom level. `preview` is the tool's overlay graphics.
 */
export interface Tool {
  readonly preview: Container;
  onDown(ctx: ToolContext): void;
  onMove(ctx: ToolContext): void;
  onUp(ctx: ToolContext): void;
  refreshPreview(camera: Camera): void;
  cancel(): void;
}
