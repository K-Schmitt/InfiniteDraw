import { Graphics } from 'pixi.js';
import type { Camera } from '@shared/camera';

const BASE_SPACING = 50;
const DOT_RADIUS = 1.5;
const DOT_COLOR = 0x9e9a92;

// Target ~50px between dots on screen.
// O(1) formula: spacing = BASE * 10^n where n = ceil(log10(TARGET / (BASE * zoom))).
// This avoids the while-loop power-of-10 hunt and its discontinuous dot-count jumps.
const TARGET_SCREEN_SPACING = 50;

// Hard cap so the grid never draws more than this many circles per frame.
// Above this we simply return — an empty grid is better than a frozen tab.
const MAX_DOTS = 3000;

/**
 * Dot-grid layer rendered in screen space each frame.
 * Sits on app.stage (not worldContainer) — camera transform applied manually.
 */
export class GridBackground {
  readonly graphics = new Graphics();
  private last = { x: NaN, y: NaN, zoom: NaN, w: NaN, h: NaN };

  draw(camera: Camera, screenWidth: number, screenHeight: number): void {
    // Skip the full redraw (clear + up to MAX_DOTS circles) when nothing changed —
    // e.g. while drawing with a static camera, or when idle.
    if (
      camera.x === this.last.x && camera.y === this.last.y && camera.zoom === this.last.zoom &&
      screenWidth === this.last.w && screenHeight === this.last.h
    ) {
      return;
    }
    this.last = { x: camera.x, y: camera.y, zoom: camera.zoom, w: screenWidth, h: screenHeight };

    this.graphics.clear();

    if (!isFinite(camera.zoom) || camera.zoom <= 0) return;

    const spacing = adaptiveSpacing(BASE_SPACING, camera.zoom);
    const screenSpacing = spacing * camera.zoom;

    if (!isFinite(screenSpacing) || screenSpacing <= 0) return;

    const cols = Math.ceil(screenWidth / screenSpacing) + 2;
    const rows = Math.ceil(screenHeight / screenSpacing) + 2;
    if (cols * rows > MAX_DOTS) return;

    const startWorldX = Math.floor(camera.x / spacing) * spacing;
    const startWorldY = Math.floor(camera.y / spacing) * spacing;
    // At extreme zoom the float64 product (startWorldX - camera.x) * zoom
    // loses all precision and can be ±trillions of pixels, making the loop
    // run for billions of iterations. Clamp to the only valid range [-screenSpacing, 0].
    const startScreenX = Math.max(-screenSpacing, Math.min(0, (startWorldX - camera.x) * camera.zoom));
    const startScreenY = Math.max(-screenSpacing, Math.min(0, (startWorldY - camera.y) * camera.zoom));

    for (let sx = startScreenX; sx <= screenWidth + screenSpacing; sx += screenSpacing) {
      for (let sy = startScreenY; sy <= screenHeight + screenSpacing; sy += screenSpacing) {
        this.graphics.circle(sx, sy, DOT_RADIUS);
      }
    }
    this.graphics.fill({ color: DOT_COLOR });
  }
}

/**
 * Returns the world-space grid spacing in O(1), no while loops.
 * Picks BASE * 10^n such that the projected screen spacing is nearest
 * to TARGET_SCREEN_SPACING.
 */
function adaptiveSpacing(base: number, zoom: number): number {
  if (zoom <= 0 || !isFinite(zoom)) return base;
  // n = round(log10(TARGET / (base * zoom)))
  const n = Math.round(Math.log10(TARGET_SCREEN_SPACING / (base * zoom)));
  return base * Math.pow(10, n);
}
