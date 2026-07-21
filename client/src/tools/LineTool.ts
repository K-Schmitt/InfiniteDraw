import { Graphics } from 'pixi.js';
import type { BrushStroke, Color, Point } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import type { Camera } from '@shared/camera';
import { buildStroke } from './strokeFactory';
import { drawStrokePreview } from './strokePreview';
import type { Tool, ToolContext, ToolSettings, CanvasApi } from './Tool';

/** Straight line from press to release. Two-point stroke, constant on-screen thickness. */
export class LineTool implements Tool {
  readonly preview = new Graphics();
  private start: Point | null = null;
  private end: Point | null = null;
  private worldSize = 1;
  private color: Color = { r: 0, g: 0, b: 0, a: 255 };

  constructor(
    private readonly settings: ToolSettings,
    private readonly api: CanvasApi,
  ) {}

  onDown(ctx: ToolContext): void {
    this.start = { ...ctx.world };
    this.end = { ...ctx.world };
    this.worldSize = this.settings.size / ctx.zoom;
    this.color = { ...this.settings.primary };
  }

  onMove(ctx: ToolContext): void {
    if (this.start) this.end = { ...ctx.world };
  }

  onUp(): void {
    this.commit();
    this.cancel();
  }

  cancel(): void {
    this.start = null;
    this.end = null;
    this.preview.clear();
  }

  refreshPreview(camera: Camera): void {
    if (this.start && this.end) drawStrokePreview(this.preview, this.makeStroke(), camera);
  }

  private commit(): void {
    if (!this.start || !this.end) return;
    if (this.start.x === this.end.x && this.start.y === this.end.y) return;
    this.api.add(this.makeStroke());
  }

  private makeStroke(): BrushStroke {
    return buildStroke({
      type: StrokeType.LINE,
      color: this.color,
      size: this.worldSize,
      points: [{ ...this.start! }, { ...this.end! }],
      layerId: this.settings.layerId,
    });
  }
}
