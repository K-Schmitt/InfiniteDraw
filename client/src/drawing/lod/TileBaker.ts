import { Graphics, RenderTexture } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import type { Color } from '@shared/stroke';
import type { StrokeStore } from '../StrokeStore';
import { fillRings, type FillOptions } from '../fillRings';
import { TILE_PX, tileWorldSize, type TileCoord } from './LodLevel';

/** Strokes thinner than this many texels are omitted from a baked tile. */
const MIN_TEXEL = 0.4;

function colorToFillOptions(
  color: Color,
  origin: { readonly x: number; readonly y: number },
  scale: number,
): FillOptions {
  return {
    originX: origin.x,
    originY: origin.y,
    scale,
    color: (color.r << 16) | (color.g << 8) | color.b,
    alpha: color.a / 255,
  };
}

// returns null for empty tiles — avoids texture allocation for blank space (common at extreme dezoom)
export function bakeTile(tile: TileCoord, store: StrokeStore, renderer: Renderer): RenderTexture | null {
  const t = tileWorldSize(tile.level);
  const origin = { x: tile.tx * t, y: tile.ty * t };
  const localZoom = TILE_PX / t;

  const items = store.queryRect({ minX: origin.x, minY: origin.y, maxX: origin.x + t, maxY: origin.y + t });
  if (items.length === 0) return null;

  const gfx = new Graphics();
  let drew = false;

  for (const item of items) {
    if (item.stroke.size * localZoom < MIN_TEXEL) continue;
    if (fillRings(gfx, item.rings, colorToFillOptions(item.stroke.color, origin, localZoom))) drew = true;
  }

  if (!drew) {
    gfx.destroy();
    return null;
  }

  const resolution = Math.min(renderer.resolution || 1, 2); // cap at 2× for HiDPI sharpness
  const rt = RenderTexture.create({ width: TILE_PX, height: TILE_PX, resolution });
  renderer.render({ container: gfx, target: rt, clear: true });
  gfx.destroy();
  return rt;
}
