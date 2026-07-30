import type { BrushStroke, Color } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import { originAnchor, originBbox } from '@shared/anchor';
import type { ProjCamera } from '../coords/viewProject';
import { frameScaleOf } from '../coords/viewScale';
import { toLocalWidth } from './strokeWidth';
import { commitAnchor, type FramePoint } from './anchorCommit';

interface BeginOptions {
  id: string;
  color: Color;
  /** Requested on-screen thickness in pixels. */
  screenSize: number;
  layerId: string;
  frame: FramePoint;
  pressure: number;
  camera: ProjCamera;
  cameraScale: number;
}

/**
 * Accumulates pointer events into a stroke while drawing is in progress. Points are stored in
 * the gesture's *camera frame* (frozen at onDown). The live preview reads them frame-local;
 * `commit` reprojects the whole gesture to its own hierarchical anchor.
 */
export class StrokeRecorder {
  private current: BrushStroke | null = null;
  private camera: ProjCamera | null = null;
  private cameraScale = 1;
  private screenSize = 1;

  begin(options: BeginOptions): void {
    this.camera = options.camera;
    this.cameraScale = options.cameraScale;
    this.screenSize = options.screenSize;
    const frameScale = frameScaleOf(options.cameraScale, options.camera.level);
    this.current = {
      id: options.id,
      type: StrokeType.BRUSH,
      color: options.color,
      // frame-local width for the live preview; the committed width is re-derived per anchor.
      size: toLocalWidth(options.screenSize, frameScale),
      points: [{ x: options.frame.x, y: options.frame.y }],
      pressures: [clampPressure(options.pressure)],
      layerId: options.layerId,
      createdAt: Date.now(),
      anchor: originAnchor(),
      zIndex: 0,
      cellBbox: originBbox(),
    };
  }

  addPoint(fx: number, fy: number, pressure: number): void {
    if (!this.current) return;
    this.current.points.push({ x: fx, y: fy });
    this.current.pressures.push(clampPressure(pressure));
  }

  /** Frame-local view of the in-progress stroke for preview rendering. */
  getPreviewStroke(): Readonly<BrushStroke> | null {
    return this.current;
  }

  /** Reprojects the gesture onto its own anchor and returns the committed stroke. Resets state. */
  commit(): BrushStroke | null {
    const stroke = this.current;
    const camera = this.camera;
    this.current = null;
    this.camera = null;
    if (!stroke || !camera || stroke.points.length < 2) return stroke;
    const { anchor, localPoints, cellBbox } = commitAnchor(stroke.points, camera);
    stroke.anchor = anchor;
    stroke.cellBbox = cellBbox;
    stroke.points = localPoints;
    stroke.size = toLocalWidth(this.screenSize, anchorScale(this.cameraScale, anchor.level));
    return stroke;
  }

  cancel(): void {
    this.current = null;
    this.camera = null;
  }

  isRecording(): boolean {
    return this.current !== null;
  }
}

/** Screen px per anchor-level local unit at gesture time. */
function anchorScale(cameraScale: number, anchorLevel: number): number {
  return cameraScale * 2 ** -anchorLevel;
}

/** Ensures pressure is in [0, 1]; falls back to 0.5 for mouse (which reports 0). */
function clampPressure(raw: number): number {
  if (raw <= 0) return 0.5;
  return Math.min(1, raw);
}
