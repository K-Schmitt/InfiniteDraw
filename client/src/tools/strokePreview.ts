import type { Graphics } from 'pixi.js';
import type { BrushStroke } from '@shared/stroke';
import { strokeToRings } from '../drawing/strokeToPath';
import { fillRings, type FillOptions } from '../drawing/fillRings';

/**
 * Renders a transient frame-local stroke into `gfx` — the gesture's points are camera-frame
 * offsets, so screen = point × frameScale (pixels per local unit). For live tool previews.
 */
export function drawStrokePreview(gfx: Graphics, stroke: BrushStroke, frameScale: number): void {
  gfx.clear();
  const opts: FillOptions = {
    originX: 0,
    originY: 0,
    scale: frameScale,
    color: (stroke.color.r << 16) | (stroke.color.g << 8) | stroke.color.b,
    alpha: stroke.color.a / 255,
  };
  fillRings(gfx, strokeToRings(stroke), opts);
}
