import { Container, Graphics } from 'pixi.js';
import type { BrushStroke } from '@shared/stroke';
import type { Viewport } from '@shared/camera';
import { computeBoundingBox, isVisible } from './Culling';
import { strokeToOutline } from './strokeToPath';

/** Converts a Color to a PixiJS hex number (0xRRGGBB). */
function colorToHex(color: BrushStroke['color']): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}

/**
 * Manages a PixiJS Container of committed strokes.
 * One Graphics object per stroke — cached and never redrawn once committed.
 * Culling hides off-screen Graphics instead of destroying them.
 */
export class StrokeRenderer {
  readonly container: Container;
  private readonly cache = new Map<string, Graphics>();

  constructor() {
    this.container = new Container();
  }

  addStroke(stroke: BrushStroke): void {
    const gfx = buildGraphics(stroke);
    this.cache.set(stroke.id, gfx);
    this.container.addChild(gfx);
  }

  removeStroke(id: string): void {
    const gfx = this.cache.get(id);
    if (!gfx) return;
    this.container.removeChild(gfx);
    gfx.destroy();
    this.cache.delete(id);
  }

  /**
   * Called each frame. Hides strokes outside the viewport instead of
   * destroying them so re-entering the viewport is instant.
   */
  updateCulling(viewport: Viewport, strokes: readonly BrushStroke[]): void {
    for (const stroke of strokes) {
      const gfx = this.cache.get(stroke.id);
      if (!gfx) continue;
      gfx.visible = isVisible(computeBoundingBox(stroke), viewport);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.cache.clear();
  }
}

/** Draws a stroke outline into a new Graphics object. */
function buildGraphics(stroke: BrushStroke): Graphics {
  const gfx = new Graphics();
  const outline = strokeToOutline(stroke);
  if (outline.length < 6) return gfx; // need at least 3 vertices

  const hex = colorToHex(stroke.color);
  const alpha = stroke.color.a / 255;
  gfx.poly(outline).fill({ color: hex, alpha });
  return gfx;
}
