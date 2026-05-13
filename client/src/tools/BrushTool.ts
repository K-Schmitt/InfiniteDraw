import { Graphics } from 'pixi.js';
import type { BrushStroke, Color } from '@shared/stroke';
import type { Camera } from '@shared/camera';
import { StrokeRecorder } from '../drawing/StrokeRecorder';
import { strokeToOutline } from '../drawing/strokeToPath';

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

/**
 * Handles freehand brush drawing.
 *
 * Receives world-space coordinates from PixiApp (already converted from screen).
 * The preview is rendered in screen space — same constant-thickness approach as
 * StrokeRenderer — so committing a stroke never causes a size jump.
 */
export class BrushTool {
  readonly previewGraphics = new Graphics();
  private readonly recorder = new StrokeRecorder();
  config: BrushConfig = { ...DEFAULT_CONFIG };

  constructor(private readonly onCommit: (stroke: BrushStroke) => void) {}

  onPointerDown(worldX: number, worldY: number, pressure: number): void {
    this.recorder.begin({
      id: crypto.randomUUID(),
      color: { ...this.config.color },
      size: this.config.size,
      layerId: this.config.layerId,
      x: worldX,
      y: worldY,
      pressure,
    });
  }

  onPointerMove(worldX: number, worldY: number, pressure: number, camera: Camera): void {
    if (!this.recorder.isRecording()) return;
    this.recorder.addPoint(worldX, worldY, pressure);
    this.buildPreview(camera);
  }

  onPointerUp(): void {
    this.previewGraphics.clear();
    const stroke = this.recorder.commit();
    if (stroke && stroke.points.length >= 2) {
      this.onCommit(stroke);
    }
  }

  cancel(): void {
    this.recorder.cancel();
    this.previewGraphics.clear();
  }

  /** Call each tick to keep the preview aligned when the camera moves while drawing. */
  refreshPreview(camera: Camera): void {
    if (!this.recorder.isRecording()) return;
    this.buildPreview(camera);
  }

  private buildPreview(camera: Camera): void {
    const stroke = this.recorder.getPreviewStroke();
    if (!stroke || stroke.points.length < 2) return;

    const outline = strokeToOutline(stroke as BrushStroke, camera);
    this.previewGraphics.clear();
    if (outline.length < 6) return;

    const hex = (stroke.color.r << 16) | (stroke.color.g << 8) | stroke.color.b;
    this.previewGraphics.poly(outline).fill({ color: hex, alpha: stroke.color.a / 255 });
  }
}
