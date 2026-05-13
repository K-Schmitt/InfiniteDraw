import type { Camera, Viewport } from '@shared/camera';
import { DEFAULT_CAMERA } from '@shared/camera';

/**
 * Hard cap on the rendering zoom to prevent float64 overflow (exp overflows at ~710).
 * exp(600) ≈ 2e260, safely below float64 max (~1.8e308).
 * StrokeRenderer independently skips strokes whose thickness would overflow float32.
 * The *conceptual* zoom (logZoom) has no limit at all.
 */
const RENDER_LOG_LIMIT = 600;

/**
 * Manages the infinite canvas camera.
 *
 * Zoom is stored as logZoom = ln(zoom) so it accumulates freely forever —
 * no walls, no clamping. Only the *rendering* zoom is capped to prevent
 * float32 overflow in PixiJS's transform matrices.
 *
 * Transform: screenX = (worldX - camera.x) * zoom
 * Inverse:   worldX  = screenX / zoom + camera.x
 */
export class CameraController {
  private _x: number = DEFAULT_CAMERA.x;
  private _y: number = DEFAULT_CAMERA.y;
  /** ln(zoom). Accumulates without any bound. */
  private _logZoom: number = 0;

  get x(): number { return this._x; }
  get y(): number { return this._y; }

  /**
   * Rendering zoom — clamped to float32-safe range so PixiJS never sees
   * Infinity. For display use logZoom instead.
   */
  get zoom(): number {
    const clamped = Math.max(-RENDER_LOG_LIMIT, Math.min(RENDER_LOG_LIMIT, this._logZoom));
    return Math.exp(clamped);
  }

  /** Conceptual log-zoom. Never clamped — use for HUD display. */
  get logZoom(): number { return this._logZoom; }

  toWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: screenX / this.zoom + this._x,
      y: screenY / this.zoom + this._y,
    };
  }

  toScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: (worldX - this._x) * this.zoom,
      y: (worldY - this._y) * this.zoom,
    };
  }

  pan(dx: number, dy: number): void {
    this._x -= dx / this.zoom;
    this._y -= dy / this.zoom;
  }

  /**
   * Zoom by a multiplicative factor toward a screen-space pivot.
   * Adds to logZoom — no walls, no limits.
   */
  zoomAt(factor: number, screenX: number, screenY: number): void {
    const worldX = this.toWorld(screenX, screenY).x;
    const worldY = this.toWorld(screenX, screenY).y;
    this._logZoom += Math.log(factor);
    this._x = worldX - screenX / this.zoom;
    this._y = worldY - screenY / this.zoom;
  }

  getViewport(screenWidth: number, screenHeight: number): Viewport {
    return {
      x: this._x,
      y: this._y,
      width: screenWidth / this.zoom,
      height: screenHeight / this.zoom,
    };
  }

  getSnapshot(): Camera {
    return { x: this._x, y: this._y, zoom: this.zoom };
  }

  restore(snapshot: Camera): void {
    this._x = snapshot.x;
    this._y = snapshot.y;
    this._logZoom = snapshot.zoom > 0 && isFinite(snapshot.zoom)
      ? Math.log(snapshot.zoom)
      : 0;
  }
}
