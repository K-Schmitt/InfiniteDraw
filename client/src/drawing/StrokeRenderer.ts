import { Container, Graphics } from 'pixi.js';
import type { BrushStroke } from '@shared/stroke';
import type { Camera } from '@shared/camera';
import { computeBoundingBox, isVisible } from './Culling';
import { strokeToOutline } from './strokeToPath';

function colorToHex(color: BrushStroke['color']): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}

/**
 * Manages a PixiJS Container of committed strokes rendered in screen space.
 *
 * The container sits directly on app.stage (NOT in a scaled worldContainer).
 * Each frame, visible strokes are redrawn using the current camera so their
 * positions track the world but their thickness stays constant in screen pixels.
 */
export class StrokeRenderer {
  readonly container: Container;
  private readonly cache = new Map<string, { gfx: Graphics; stroke: BrushStroke }>();

  constructor() {
    this.container = new Container();
  }

  addStroke(stroke: BrushStroke): void {
    const gfx = new Graphics();
    this.cache.set(stroke.id, { gfx, stroke });
    this.container.addChild(gfx);
  }

  removeStroke(id: string): void {
    const entry = this.cache.get(id);
    if (!entry) return;
    this.container.removeChild(entry.gfx);
    entry.gfx.destroy();
    this.cache.delete(id);
  }

  /**
   * Called each frame. Culls off-screen strokes and rebuilds visible ones
   * in screen space so thickness is zoom-independent.
   */
  redraw(camera: Camera, strokes: readonly BrushStroke[], screenW: number, screenH: number): void {
    const viewport = {
      x: camera.x,
      y: camera.y,
      width: screenW / camera.zoom,
      height: screenH / camera.zoom,
    };

    for (const stroke of strokes) {
      const entry = this.cache.get(stroke.id);
      if (!entry) continue;
      const visible = isVisible(computeBoundingBox(stroke, camera.zoom), viewport);
      entry.gfx.visible = visible;
      if (!visible) continue;

      const outline = strokeToOutline(stroke, camera);
      entry.gfx.clear();
      if (outline.length < 6) continue;
      entry.gfx.poly(outline).fill({ color: colorToHex(stroke.color), alpha: stroke.color.a / 255 });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.cache.clear();
  }
}
