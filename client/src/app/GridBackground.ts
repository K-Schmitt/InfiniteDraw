import { Graphics } from 'pixi.js';
import type { Camera } from '@shared/camera';

const BASE_SPACING = 50;
const DOT_RADIUS = 1.5;
const DOT_COLOR = 0x9e9a92;

/**
 * Dot-grid layer rendered in screen space each frame.
 * The Graphics object sits on app.stage (not worldContainer) so its
 * coordinates are screen pixels — the camera transform is applied manually.
 *
 * Adaptive spacing: when the projected spacing would be < 12px the grid
 * steps up to the next power-of-ten multiple so dot density stays constant.
 */
export class GridBackground {
  readonly graphics = new Graphics();

  draw(camera: Camera, screenWidth: number, screenHeight: number): void {
    this.graphics.clear();

    const spacing = adaptiveSpacing(BASE_SPACING, camera.zoom);
    const screenSpacing = spacing * camera.zoom;

    const startWorldX = Math.floor(camera.x / spacing) * spacing;
    const startWorldY = Math.floor(camera.y / spacing) * spacing;
    const startScreenX = (startWorldX - camera.x) * camera.zoom;
    const startScreenY = (startWorldY - camera.y) * camera.zoom;

    // Accumulate all dots into one fill call for performance.
    for (let sx = startScreenX; sx <= screenWidth + screenSpacing; sx += screenSpacing) {
      for (let sy = startScreenY; sy <= screenHeight + screenSpacing; sy += screenSpacing) {
        this.graphics.circle(sx, sy, DOT_RADIUS);
      }
    }
    this.graphics.fill({ color: DOT_COLOR });
  }
}

function adaptiveSpacing(base: number, zoom: number): number {
  let spacing = base;
  while (spacing * zoom < 12) spacing *= 10;
  while (spacing * zoom > 120) spacing /= 10;
  return spacing;
}
