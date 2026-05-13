import { Container, Graphics } from 'pixi.js';
import type { BrushStroke } from '@shared/stroke';
import type { Camera } from '@shared/camera';
import { computeBoundingBox, isVisible } from './Culling';
import { strokeToOutline, projectToScreen } from './strokeToPath';

// Skip rendering if the stroke would be wider than this many screen pixels.
// Float32 max ≈ 3.4e38; we leave several orders of magnitude of headroom.
const MAX_SCREEN_STROKE_WIDTH = 2e34;

function colorToHex(color: BrushStroke['color']): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}

/**
 * Manages a PixiJS Container of committed strokes rendered in world space.
 *
 * The world-space outline (perfect-freehand polygon) is computed ONCE when a
 * stroke is committed and cached. Each frame only a cheap O(vertices) linear
 * transform (world → screen) is applied, avoiding per-frame perfect-freehand calls.
 *
 * Strokes scale with zoom: zooming in makes them appear thicker, zooming out
 * makes them shrink until they fall out of the viewport and are culled.
 */
export class StrokeRenderer {
  readonly container: Container;
  private readonly cache = new Map<string, { gfx: Graphics; stroke: BrushStroke; worldOutline: number[] }>();
  private lastCamera: Camera | null = null;

  constructor() {
    this.container = new Container();
  }

  addStroke(stroke: BrushStroke): void {
    const gfx = new Graphics();
    const worldOutline = strokeToOutline(stroke);
    this.cache.set(stroke.id, { gfx, stroke, worldOutline });
    this.container.addChild(gfx);
    this.lastCamera = null; // force redraw on next tick
  }

  removeStroke(id: string): void {
    const entry = this.cache.get(id);
    if (!entry) return;
    this.container.removeChild(entry.gfx);
    entry.gfx.destroy();
    this.cache.delete(id);
    this.lastCamera = null;
  }

  /**
   * Called each frame. Projects cached world outlines to screen and rebuilds
   * only visible strokes. Skips entirely if the camera hasn't moved.
   */
  redraw(camera: Camera, strokes: readonly BrushStroke[], screenW: number, screenH: number): void {
    const prev = this.lastCamera;
    if (prev && prev.x === camera.x && prev.y === camera.y && prev.zoom === camera.zoom) return;
    this.lastCamera = camera;

    const viewport = {
      x: camera.x,
      y: camera.y,
      width: screenW / camera.zoom,
      height: screenH / camera.zoom,
    };

    for (const stroke of strokes) {
      const entry = this.cache.get(stroke.id);
      if (!entry) continue;

      const visible = isVisible(computeBoundingBox(stroke), viewport);
      entry.gfx.visible = visible;
      if (!visible) continue;

      // Skip strokes whose width would overflow float32 in the GPU vertex buffer.
      if (stroke.size * camera.zoom > MAX_SCREEN_STROKE_WIDTH) {
        entry.gfx.visible = false;
        continue;
      }

      const screenOutline = projectToScreen(entry.worldOutline, camera);
      entry.gfx.clear();
      if (screenOutline.length < 6) continue;
      entry.gfx.poly(screenOutline).fill({ color: colorToHex(stroke.color), alpha: stroke.color.a / 255 });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.cache.clear();
  }
}
