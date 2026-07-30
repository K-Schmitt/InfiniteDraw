import { Graphics } from 'pixi.js';
import type { BrushStroke, Color, Point } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import type { ProjCamera } from '../coords/viewProject';
import type { HierCamera } from '../app/HierCamera';
import { buildStroke, anchoredStroke } from './strokeFactory';
import { drawStrokePreview } from './strokePreview';
import type { Tool, ToolContext, ToolSettings, CanvasApi } from './Tool';
import { log } from '../debug/logger';

/** Straight line from press to release. Two-point stroke, constant on-screen thickness. */
export class LineTool implements Tool {
  readonly preview = new Graphics();
  readonly tentativeStrokeId = null;
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
    log('tool', 'line begin', {
      start: this.start, color: this.color, size: this.settings.size,
      level: ctx.projCamera.level,
    });
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
    if (!this.start || !this.end || !this.camera) {
      log('tool', 'line commit SKIPPED (no gesture)', { hasStart: !!this.start, hasCam: !!this.camera });
      return;
    }
    if (this.start.x === this.end.x && this.start.y === this.end.y) {
      log('tool', 'line commit SKIPPED (zero length)', { at: this.start });
      return;
    }
    const dx = this.end.x - this.start.x;
    const dy = this.end.y - this.start.y;
    log('tool', 'line commit', {
      start: this.start, end: this.end,
      length: +Math.hypot(dx, dy).toFixed(3),
      angleDeg: +((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(2),
      color: this.color, size: this.settings.size,
    });
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
