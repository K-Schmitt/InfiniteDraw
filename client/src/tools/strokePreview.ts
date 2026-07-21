import type { Graphics } from 'pixi.js';
import type { BrushStroke } from '@shared/stroke';
import type { Camera } from '@shared/camera';
import { strokeToRings } from '../drawing/strokeToPath';
import { fillRings, type FillOptions } from '../drawing/fillRings';

/** Renders a transient stroke into `gfx` projected to screen space — for live tool previews. */
export function drawStrokePreview(gfx: Graphics, stroke: BrushStroke, camera: Camera): void {
  gfx.clear();
  const opts: FillOptions = {
    originX: camera.x,
    originY: camera.y,
    scale: camera.zoom,
    color: (stroke.color.r << 16) | (stroke.color.g << 8) | stroke.color.b,
    alpha: stroke.color.a / 255,
  };
  fillRings(gfx, strokeToRings(stroke), opts);
}
