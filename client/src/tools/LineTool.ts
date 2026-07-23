import { Graphics } from 'pixi.js';
import type { BrushStroke, Color, Point } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import type { ProjCamera } from '../coords/viewProject';
import type { HierCamera } from '../app/HierCamera';
import { buildStroke, anchoredStroke } from './strokeFactory';
import { drawStrokePreview } from './strokePreview';
import type { Tool, ToolContext, ToolSettings, CanvasApi } from './Tool';

/** Straight line from press to release. Two-point stroke, constant on-screen thickness. */
export class LineTool implements Tool {
  readonly preview = new Graphics();
  private start: Point | null = null;
  private end: Point | null = null;
  private camera: ProjCamera | null = null;
  private cameraScale = 1;
  private color: Color = { r: 0, g: 0, b: 0, a: 255 };

  constructor(
    private readonly settings: ToolSettings,
    private readonly api: CanvasApi,
  ) {}

  onDown(ctx: ToolContext): void {
    this.start = { ...ctx.frame };
    this.end = { ...ctx.frame };
    this.camera = ctx.projCamera;
    this.cameraScale = ctx.cameraScale;
    this.color = { ...this.settings.primary };
  }

  onMove(ctx: ToolContext): void {
    if (this.start) this.end = { ...ctx.frame };
  }

  onUp(): void {
    this.commit();
    this.cancel();
  }

  cancel(): void {
    this.start = null;
    this.end = null;
    this.camera = null;
    this.preview.clear();
  }

  refreshPreview(camera: HierCamera): void {
    if (this.start && this.end) drawStrokePreview(this.preview, this.previewStroke(camera), camera.frameScale);
  }

  private commit(): void {
    if (!this.start || !this.end || !this.camera) return;
    if (this.start.x === this.end.x && this.start.y === this.end.y) return;
    this.api.add(anchoredStroke({
      type: StrokeType.LINE,
      color: this.color,
      screenSize: this.settings.size,
      framePoints: [{ ...this.start }, { ...this.end }],
      layerId: this.settings.layerId,
      camera: this.camera,
      cameraScale: this.cameraScale,
    }));
  }

  // frame-local stroke for the live preview (points frame, width in frame units)
  private previewStroke(camera: HierCamera): BrushStroke {
    return buildStroke({
      type: StrokeType.LINE,
      color: this.color,
      size: this.settings.size / camera.frameScale,
      points: [{ ...this.start! }, { ...this.end! }],
      layerId: this.settings.layerId,
    });
  }
}
