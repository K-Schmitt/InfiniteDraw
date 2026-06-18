import { Graphics } from 'pixi.js';
import type { BrushStroke, Color } from '@shared/stroke';
import type { Camera } from '@shared/camera';
import { StrokeRecorder } from '../drawing/StrokeRecorder';
import { strokeToRings } from '../drawing/strokeToPath';
import { fillRings, type FillOptions } from '../drawing/fillRings';

// above this threshold the ring resolution is throttled to avoid blocking the frame loop
const PREVIEW_FRAME_RESOLVE_LIMIT = 300;
const PREVIEW_THROTTLE_MS = 33;

export interface BrushConfig {
  color: Color;
  size: number;
  layerId: string;
}

const DEFAULT_CONFIG: BrushConfig = {
  color: { r: 20, g: 20, b: 20, a: 255 },
  size: 8,
  layerId: 'default',
};

export class BrushTool {
  readonly previewGraphics = new Graphics();
  private readonly recorder = new StrokeRecorder();
  config: BrushConfig = { ...DEFAULT_CONFIG };

  private previewRings: number[][] = [];
  private previewPointCount = 0;
  private lastResolveAt = 0;

  constructor(private readonly onCommit: (stroke: BrushStroke) => void) {}

  onPointerDown(
    world: { readonly x: number; readonly y: number },
    pressure: number,
    zoom: number,
  ): void {
    this.recorder.begin({
      id: crypto.randomUUID(),
      color: { ...this.config.color },
      size: this.config.size / zoom, // apparent screen size stays constant regardless of zoom
      layerId: this.config.layerId,
      x: world.x,
      y: world.y,
      pressure,
    });
  }

  onPointerMove(worldX: number, worldY: number, pressure: number): void {
    if (!this.recorder.isRecording()) return;
    this.recorder.addPoint(worldX, worldY, pressure);
  }

  onPointerUp(): void {
    this.resetPreview();
    const stroke = this.recorder.commit();
    if (stroke && stroke.points.length >= 2) {
      this.onCommit(stroke);
    }
  }

  cancel(): void {
    this.recorder.cancel();
    this.resetPreview();
  }

  private resetPreview(): void {
    this.previewGraphics.clear();
    this.previewRings = [];
    this.previewPointCount = 0;
    this.lastResolveAt = 0;
  }

  // resolves rings + holes every frame (light strokes) or throttled (heavy) so closed shapes preview correctly
  refreshPreview(camera: Camera): void {
    if (!this.recorder.isRecording()) return;
    const stroke = this.recorder.getPreviewStroke();
    if (!stroke || stroke.points.length < 2) return;

    const grew = stroke.points.length !== this.previewPointCount;
    const light = stroke.points.length <= PREVIEW_FRAME_RESOLVE_LIMIT;
    const now = performance.now();
    if (grew && (light || now - this.lastResolveAt >= PREVIEW_THROTTLE_MS)) {
      this.previewRings = strokeToRings(stroke as BrushStroke);
      this.previewPointCount = stroke.points.length;
      this.lastResolveAt = now;
    }

    this.previewGraphics.clear();
    const opts: FillOptions = {
      originX: camera.x,
      originY: camera.y,
      scale: camera.zoom,
      color: (stroke.color.r << 16) | (stroke.color.g << 8) | stroke.color.b,
      alpha: stroke.color.a / 255,
    };
    fillRings(this.previewGraphics, this.previewRings, opts);
  }
}
