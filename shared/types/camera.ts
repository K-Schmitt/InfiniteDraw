/**
 * Camera and viewport types for the infinite canvas.
 *
 * The Camera defines the current view into the infinite world.
 * All stroke coordinates are in world space; the Camera transforms them to screen space.
 *
 * Transform:  screenX = (worldX - camera.x) * camera.zoom
 * Inverse:    worldX  = screenX / camera.zoom + camera.x
 */

export interface Camera {
  /** World-space x-coordinate of the camera origin (left edge of viewport). */
  x: number;
  /** World-space y-coordinate of the camera origin (top edge of viewport). */
  y: number;
  /**
   * Zoom scale factor. 1.0 = 100%, 2.0 = 200%, 0.5 = 50%.
   * No enforced limits — the canvas is infinite in both directions.
   * Clamped only to > 0 to prevent division by zero.
   */
  zoom: number;
}

/** The visible region of the canvas in world-space coordinates. Used for culling. */
export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Named camera position saved as a bookmark. */
export interface CameraBookmark {
  id: string;
  label: string;
  camera: Camera;
}

export const DEFAULT_CAMERA: Camera = {
  x: 0,
  y: 0,
  zoom: 1.0,
};

/**
 * Advisory zoom guard rails for legacy float64 consumers (grid, HUD formatting).
 * These do NOT bound navigation: `HierCamera` level/cell are BigInt and grow without limit.
 * They exist only so a float64 `Camera.zoom` never reaches 0 or Infinity.
 */
export const MIN_ZOOM = Number.MIN_SAFE_INTEGER > 0 ? 1 : 1e-300;
export const MAX_ZOOM = 1e300;
