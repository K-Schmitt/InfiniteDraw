import type { BrushStroke, Color } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';

interface BeginOptions {
  id: string;
  color: Color;
  size: number;
  layerId: string;
  x: number;
  y: number;
  pressure: number;
}

/**
 * Accumulates pointer events into a BrushStroke while drawing is in progress.
 * All coordinates must already be in world space.
 */
export class StrokeRecorder {
  private current: BrushStroke | null = null;

  begin(options: BeginOptions): void {
    this.current = {
      id: options.id,
      type: StrokeType.BRUSH,
      color: options.color,
      size: options.size,
      points: [{ x: options.x, y: options.y }],
      pressures: [clampPressure(options.pressure)],
      layerId: options.layerId,
      createdAt: Date.now(),
    };
  }

  addPoint(x: number, y: number, pressure: number): void {
    if (!this.current) return;
    this.current.points.push({ x, y });
    this.current.pressures.push(clampPressure(pressure));
  }

  /** Returns a readonly view of the in-progress stroke for preview rendering. */
  getPreviewStroke(): Readonly<BrushStroke> | null {
    return this.current;
  }

  /** Finalises and returns the completed stroke. Resets recorder state. */
  commit(): BrushStroke | null {
    const stroke = this.current;
    this.current = null;
    return stroke;
  }

  cancel(): void {
    this.current = null;
  }

  isRecording(): boolean {
    return this.current !== null;
  }
}

/** Ensures pressure is in [0, 1]; falls back to 0.5 for mouse (which reports 0). */
function clampPressure(raw: number): number {
  if (raw <= 0) return 0.5;
  return Math.min(1, raw);
}
