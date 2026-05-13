import { Graphics } from 'pixi.js';
import type { BrushStroke, Color } from '@shared/stroke';
import type { Camera } from '@shared/camera';
import { StrokeRecorder } from '../drawing/StrokeRecorder';
import { strokeToOutline, projectToScreen } from '../drawing/strokeToPath';

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
 * The preview uses the same world→screen projection as StrokeRenderer so its
 * appearance matches the committed stroke at all zoom levels.
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

  onPointerMove(worldX: number, worldY: number, pressure: number): void {
    if (!this.recorder.isRecording()) return;
    this.recorder.addPoint(worldX, worldY, pressure);
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

  /**
   * Called each tick. Rebuilds the live preview using the current camera so the
   * preview stays aligned when the camera moves while drawing.
   */
  refreshPreview(camera: Camera): void {
    if (!this.recorder.isRecording()) return;
    const stroke = this.recorder.getPreviewStroke();
    if (!stroke || stroke.points.length < 2) return;

    const worldOutline = strokeToOutline(stroke as BrushStroke);
    this.previewGraphics.clear();
    if (worldOutline.length < 6) return;

    const screenOutline = projectToScreen(worldOutline, camera);
    const hex = (stroke.color.r << 16) | (stroke.color.g << 8) | stroke.color.b;
    this.previewGraphics.poly(screenOutline).fill({ color: hex, alpha: stroke.color.a / 255 });
  }
}
