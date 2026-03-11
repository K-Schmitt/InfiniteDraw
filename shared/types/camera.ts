/**
 * Camera and viewport types for the infinite canvas.
 *
 * The Camera defines the current view into the infinite world.
 * All stroke coordinates are in world space; the Camera transforms them to screen space.
 *
 * Screen = (World - Camera.origin) * Camera.zoom
 */

export interface Camera {
  /** World-space x-coordinate of the camera origin (left edge of viewport). */
  x: number;
  /** World-space y-coordinate of the camera origin (top edge of viewport). */
  y: number;
  /** Zoom scale factor. 1.0 = 100%, 2.0 = 200%, 0.5 = 50%. Range: 0.01–100. */
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

export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 100.0;
