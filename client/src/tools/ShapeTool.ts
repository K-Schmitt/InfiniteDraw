import { Graphics } from 'pixi.js';
import type { BrushStroke, Color, Point, StrokeType } from '@shared/stroke';
import { StrokeType as Type } from '@shared/stroke';
import type { ProjCamera } from '../coords/viewProject';
import type { HierCamera } from '../app/HierCamera';
import { buildStroke, anchoredStroke } from './strokeFactory';
import { drawStrokePreview } from './strokePreview';
import { shapePoints, type ShapeKind } from './shapeGeometry';
import type { Tool, ToolContext, ToolSettings, CanvasApi } from './Tool';

/** Rectangle / ellipse / triangle dragged from one corner to the opposite. Outlined (use Fill to fill). */
export class ShapeTool implements Tool {
  readonly preview = new Graphics();
  private start: Point | null = null;
  private current: Point | null = null;
  private camera: ProjCamera | null = null;
  private cameraScale = 1;
  private color: Color = { r: 0, g: 0, b: 0, a: 255 };
  private kind: ShapeKind = 'rectangle';

  constructor(
    private readonly settings: ToolSettings,
    private readonly api: CanvasApi,
  ) {}

  onDown(ctx: ToolContext): void {
    this.start = { ...ctx.frame };
    this.current = { ...ctx.frame };
    this.camera = ctx.projCamera;
    this.cameraScale = ctx.cameraScale;
    this.color = { ...this.settings.primary };
    this.kind = this.settings.shape;
  }

  onMove(ctx: ToolContext): void {
    if (this.start) this.current = { ...ctx.frame };
  }

  onUp(): void {
    this.commit();
    this.cancel();
  }

  cancel(): void {
    this.start = null;
    this.current = null;
    this.camera = null;
    this.preview.clear();
  }

  refreshPreview(camera: HierCamera): void {
    if (this.start && this.current) {
      drawStrokePreview(this.preview, this.previewStroke(camera), camera.frameScale);
    }
  }

  private commit(): void {
    if (!this.start || !this.current || !this.camera) return;
    if (this.start.x === this.current.x && this.start.y === this.current.y) return;
    this.api.add(anchoredStroke({
      type: strokeTypeFor(this.kind),
      color: this.color,
      screenSize: this.settings.size,
      framePoints: shapePoints(this.kind, this.start, this.current),
      layerId: this.settings.layerId,
      camera: this.camera,
      cameraScale: this.cameraScale,
    }));
  }

  // frame-local stroke for the live preview (points frame, width in frame units)
  private previewStroke(camera: HierCamera): BrushStroke {
    return buildStroke({
      type: strokeTypeFor(this.kind),
      color: this.color,
      size: this.settings.size / camera.frameScale,
      points: shapePoints(this.kind, this.start!, this.current!),
      layerId: this.settings.layerId,
    });
  }
}

function strokeTypeFor(kind: ShapeKind): StrokeType {
  if (kind === 'rectangle') return Type.RECTANGLE;
  if (kind === 'triangle') return Type.TRIANGLE;
  return Type.ELLIPSE;
}
