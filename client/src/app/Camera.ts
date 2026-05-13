import type { Camera, Viewport } from '@shared/camera';
import { DEFAULT_CAMERA } from '@shared/camera';

/**
 * Manages the infinite canvas camera: pan, zoom, and coordinate transforms.
 *
 * World space is unbounded. Screen space is the CSS pixel coordinate of the canvas.
 * Transform: screenX = (worldX - camera.x) * camera.zoom
 * Inverse:   worldX  = screenX / camera.zoom + camera.x
 *
 * Zoom has no enforced upper or lower bound — the canvas is truly infinite.
 * The only guard is zoom > 1e-10 to prevent division by zero.
 */
export class CameraController {
  private state: Camera = { ...DEFAULT_CAMERA };

  get x(): number { return this.state.x; }
  get y(): number { return this.state.y; }
  get zoom(): number { return this.state.zoom; }

  toWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: screenX / this.state.zoom + this.state.x,
      y: screenY / this.state.zoom + this.state.y,
    };
  }

  toScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: (worldX - this.state.x) * this.state.zoom,
      y: (worldY - this.state.y) * this.state.zoom,
    };
  }

  /** Pan by a screen-space delta (e.g. pointer drag delta in CSS pixels). */
  pan(dx: number, dy: number): void {
    this.state.x -= dx / this.state.zoom;
    this.state.y -= dy / this.state.zoom;
  }

  /**
   * Zoom by a multiplicative factor toward a screen-space pivot point.
   * No hard limits — zoom continues indefinitely in both directions.
   */
  zoomAt(factor: number, screenX: number, screenY: number): void {
    const worldX = this.toWorld(screenX, screenY).x;
    const worldY = this.toWorld(screenX, screenY).y;

    const newZoom = this.state.zoom * factor;
    // Only guard: prevent reaching zero (division by zero in toWorld).
    this.state.zoom = Math.max(1e-10, newZoom);

    this.state.x = worldX - screenX / this.state.zoom;
    this.state.y = worldY - screenY / this.state.zoom;
  }

  /** Returns the visible world-space rectangle for culling. */
  getViewport(screenWidth: number, screenHeight: number): Viewport {
    return {
      x: this.state.x,
      y: this.state.y,
      width: screenWidth / this.state.zoom,
      height: screenHeight / this.state.zoom,
    };
  }

  getSnapshot(): Camera {
    return { ...this.state };
  }

  restore(snapshot: Camera): void {
    this.state = { ...snapshot };
  }
}
