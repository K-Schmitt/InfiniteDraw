import { Graphics } from 'pixi.js';
import type { Camera } from '@shared/camera';

const BASE_SPACING = 50; // world-space units between dots
const DOT_RADIUS = 1.0;
const DOT_COLOR = 0xc0bdb5;

/**
 * Dot-grid layer rendered in screen space each frame.
 * The Graphics object sits on app.stage (not worldContainer) so its
 * coordinates are screen pixels — the camera transform is applied manually.
 *
 * Adaptive spacing: when the projected spacing would be < 10px the grid
 * steps up to the next power-of-ten multiple so dot density stays constant.
 */
export class GridBackground {
  readonly graphics = new Graphics();

  draw(camera: Camera, screenWidth: number, screenHeight: number): void {
    this.graphics.clear();

    const spacing = adaptiveSpacing(BASE_SPACING, camera.zoom);
    const screenSpacing = spacing * camera.zoom;

    // First dot column/row in screen space
    const startWorldX = Math.floor(camera.x / spacing) * spacing;
    const startWorldY = Math.floor(camera.y / spacing) * spacing;
    const startScreenX = (startWorldX - camera.x) * camera.zoom;
    const startScreenY = (startWorldY - camera.y) * camera.zoom;

    this.graphics.beginPath();
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
  while (spacing * zoom < 10) spacing *= 10;
  while (spacing * zoom > 150) spacing /= 10;
  return spacing;
}
