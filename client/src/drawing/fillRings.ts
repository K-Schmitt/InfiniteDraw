import { GraphicsPath } from 'pixi.js';
import type { Graphics } from 'pixi.js';
import { projectToScreen } from './strokeToPath';

export interface FillOptions {
  readonly originX: number;
  readonly originY: number;
  readonly scale: number;
  readonly color: number;
  readonly alpha: number;
}

// GraphicsPath with hole detection so inner rings render as holes, not solid fill.
export function fillRings(gfx: Graphics, rings: readonly number[][], opts: FillOptions): boolean {
  if (rings.length === 0) return false;

  const path = new GraphicsPath(undefined, true); // signed = checkForHoles
  const origin = { x: opts.originX, y: opts.originY };
  let drew = false;
  for (const ring of rings) {
    const projected = projectToScreen(ring, origin, opts.scale);
    if (projected.length >= 6) {
      path.poly(projected, true);
      drew = true;
    }
  }

  if (drew) gfx.path(path).fill({ color: opts.color, alpha: opts.alpha });
  return drew;
}
