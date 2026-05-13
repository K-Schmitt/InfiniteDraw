import { Graphics } from 'pixi.js';
import type { Camera } from '@shared/camera';

const BASE_SPACING = 50;
const DOT_RADIUS = 1.5;
const DOT_COLOR = 0x9e9a92;

// Target screen-space dot spacing range: keep dots between these values.
const MIN_SCREEN_SPACING = 12;
const MAX_SCREEN_SPACING = 120;

/**
 * Dot-grid layer rendered in screen space each frame.
 * Sits on app.stage (not worldContainer) — camera transform applied manually.
 *
 * Adaptive spacing: multiplies/divides base spacing by 10 until the projected
 * screen spacing is in [MIN_SCREEN_SPACING, MAX_SCREEN_SPACING].
 * Works for any zoom level from near-zero to arbitrarily large.
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

    for (let sx = startScreenX; sx <= screenWidth + screenSpacing; sx += screenSpacing) {
      for (let sy = startScreenY; sy <= screenHeight + screenSpacing; sy += screenSpacing) {
        this.graphics.circle(sx, sy, DOT_RADIUS);
      }
    }
    this.graphics.fill({ color: DOT_COLOR });
  }
}

function adaptiveSpacing(base: number, zoom: number): number {
  if (zoom <= 0) return base;
  let spacing = base;
  while (spacing * zoom < MIN_SCREEN_SPACING) spacing *= 10;
  while (spacing * zoom > MAX_SCREEN_SPACING) spacing /= 10;
  return spacing;
}
