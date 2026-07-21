import { Graphics } from 'pixi.js';
import type { BrushStroke, Color, Point, StrokeType } from '@shared/stroke';
import { StrokeType as Type } from '@shared/stroke';
import type { Camera } from '@shared/camera';
import { buildStroke } from './strokeFactory';
import { drawStrokePreview } from './strokePreview';
import { shapePoints, type ShapeKind } from './shapeGeometry';
import type { Tool, ToolContext, ToolSettings, CanvasApi } from './Tool';

/** Rectangle / ellipse / triangle dragged from one corner to the opposite. Outlined (use Fill to fill). */
export class ShapeTool implements Tool {
  readonly preview = new Graphics();
  private start: Point | null = null;
  private current: Point | null = null;
  private worldSize = 1;
  private color: Color = { r: 0, g: 0, b: 0, a: 255 };
  private kind: ShapeKind = 'rectangle';

  constructor(
    private readonly settings: ToolSettings,
    private readonly api: CanvasApi,
  ) {}

  onDown(ctx: ToolContext): void {
    this.start = { ...ctx.world };
    this.current = { ...ctx.world };
    this.worldSize = this.settings.size / ctx.zoom;
    this.color = { ...this.settings.primary };
    this.kind = this.settings.shape;
  }

  onMove(ctx: ToolContext): void {
    if (this.start) this.current = { ...ctx.world };
  }

  onUp(): void {
    this.commit();
    this.cancel();
  }

  cancel(): void {
    this.start = null;
    this.current = null;
    this.preview.clear();
  }

  refreshPreview(camera: Camera): void {
    if (this.start && this.current) drawStrokePreview(this.preview, this.makeStroke(), camera);
  }

  private commit(): void {
    if (!this.start || !this.current) return;
    if (this.start.x === this.current.x && this.start.y === this.current.y) return;
    this.api.add(this.makeStroke());
  }

  private makeStroke(): BrushStroke {
    return buildStroke({
      type: strokeTypeFor(this.kind),
      color: this.color,
      size: this.worldSize,
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
