import { Graphics } from 'pixi.js';
import type { BrushStroke } from '@shared/stroke';
import type { HierCamera } from '../app/HierCamera';
import { StrokeRecorder } from '../drawing/StrokeRecorder';
import { strokeToPreviewRings } from '../drawing/strokeToPath';
import { fillRings, type FillOptions } from '../drawing/fillRings';
import type { Tool, ToolContext, ToolSettings, CanvasApi } from './Tool';
import { log, logThrottled } from '../debug/logger';

/** Pressure-sensitive freehand brush, rendered via perfect-freehand. */
export class BrushTool implements Tool {
  readonly preview = new Graphics();
  private readonly recorder = new StrokeRecorder();
  private previewRings: number[][] = [];
  private previewPointCount = 0;

  get tentativeStrokeId(): string | null {
    return this.recorder.getPreviewStroke()?.id ?? null;
  }

  constructor(
    private readonly settings: ToolSettings,
    private readonly api: CanvasApi,
  ) {}

  onDown(ctx: ToolContext): void {
    const id = crypto.randomUUID();
    log('tool', 'brush begin', {
      id, frame: ctx.frame, pressure: +ctx.pressure.toFixed(3),
      color: this.settings.primary, screenSize: this.settings.size,
      level: ctx.projCamera.level, cameraScale: ctx.cameraScale,
    });
    this.recorder.begin({
      id,
      color: { ...this.settings.primary },
      screenSize: this.settings.size, // constant on-screen thickness at any zoom
      layerId: this.settings.layerId,
      frame: { ...ctx.frame },
      pressure: ctx.pressure,
      camera: ctx.projCamera,
      cameraScale: ctx.cameraScale,
    });
  }

  onMove(ctx: ToolContext): void {
    if (!this.recorder.isRecording()) return;
    this.recorder.addPoint(ctx.frame.x, ctx.frame.y, ctx.pressure);
    logThrottled('brush:pt', 100, () => ({
      cat: 'pointer', msg: 'brush point',
      data: {
        frame: ctx.frame, pressure: +ctx.pressure.toFixed(3),
        total: this.recorder.getPreviewStroke()?.points.length ?? 0,
      },
    }));
  }

  onUp(): void {
    const stroke = this.recorder.commit();
    this.resetPreview();
    log('tool', 'brush commit', {
      id: stroke?.id, points: stroke?.points.length ?? 0,
      accepted: !!stroke && stroke.points.length >= 2,
      anchorLevel: stroke?.anchor.level, size: stroke?.size,
    });
    if (stroke && stroke.points.length >= 2) this.api.add(stroke);
  }

  cancel(): void {
    log('tool', 'brush cancel', { wasRecording: this.recorder.isRecording() });
    this.recorder.cancel();
    this.resetPreview();
  }

  refreshPreview(camera: HierCamera): void {
    if (!this.recorder.isRecording()) return;
    const stroke = this.recorder.getPreviewStroke();
    if (!stroke || stroke.points.length < 2) return;
    this.resolveRings(stroke);
    this.drawPreview(stroke, camera.frameScale);
  }

  // Rebuilds only when a point was actually added. No time-based throttle: the preview path
  // costs ~1-2ms flat now that it skips the polygon union, so skipping frames would only make
  // the stroke lag the finger without buying anything back.
  private resolveRings(stroke: Readonly<BrushStroke>): void {
    if (stroke.points.length === this.previewPointCount) return;
    this.previewRings = strokeToPreviewRings(stroke as BrushStroke);
    this.previewPointCount = stroke.points.length;
  }

  private drawPreview(stroke: Readonly<BrushStroke>, frameScale: number): void {
    this.preview.clear();
    const opts: FillOptions = {
      originX: 0,
      originY: 0,
      scale: frameScale,
      color: (stroke.color.r << 16) | (stroke.color.g << 8) | stroke.color.b,
      alpha: stroke.color.a / 255,
    };
    fillRings(this.preview, this.previewRings, opts);
  }

  private resetPreview(): void {
    this.preview.clear();
    this.previewRings = [];
    this.previewPointCount = 0;
  }
}
