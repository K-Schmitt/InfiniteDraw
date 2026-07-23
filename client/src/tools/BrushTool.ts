import { Graphics } from 'pixi.js';
import type { BrushStroke } from '@shared/stroke';
import type { HierCamera } from '../app/HierCamera';
import { StrokeRecorder } from '../drawing/StrokeRecorder';
import { strokeToRings } from '../drawing/strokeToPath';
import { fillRings, type FillOptions } from '../drawing/fillRings';
import type { Tool, ToolContext, ToolSettings, CanvasApi } from './Tool';

// above this point count the ring resolution is throttled to avoid blocking the frame loop
const PREVIEW_FRAME_RESOLVE_LIMIT = 300;
const PREVIEW_THROTTLE_MS = 33;

/** Pressure-sensitive freehand brush, rendered via perfect-freehand. */
export class BrushTool implements Tool {
  readonly preview = new Graphics();
  private readonly recorder = new StrokeRecorder();
  private previewRings: number[][] = [];
  private previewPointCount = 0;
  private lastResolveAt = 0;

  get tentativeStrokeId(): string | null {
    return this.recorder.getPreviewStroke()?.id ?? null;
  }

  constructor(
    private readonly settings: ToolSettings,
    private readonly api: CanvasApi,
  ) {}

  onDown(ctx: ToolContext): void {
    this.recorder.begin({
      id: crypto.randomUUID(),
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
  }

  onUp(): void {
    const stroke = this.recorder.commit();
    this.resetPreview();
    if (stroke && stroke.points.length >= 2) this.api.add(stroke);
  }

  cancel(): void {
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

  // resolves rings every frame (light strokes) or throttled (heavy) so closed shapes preview right
  private resolveRings(stroke: Readonly<BrushStroke>): void {
    const grew = stroke.points.length !== this.previewPointCount;
    const light = stroke.points.length <= PREVIEW_FRAME_RESOLVE_LIMIT;
    const now = performance.now();
    if (grew && (light || now - this.lastResolveAt >= PREVIEW_THROTTLE_MS)) {
      this.previewRings = strokeToRings(stroke as BrushStroke);
      this.previewPointCount = stroke.points.length;
      this.lastResolveAt = now;
    }
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
    this.lastResolveAt = 0;
  }
}
