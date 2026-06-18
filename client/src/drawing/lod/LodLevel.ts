import type { Camera } from '@shared/camera';

export const TILE_PX = 256;
export const BASE_TILE_WORLD = 256;
export const TILE_MODE_ZOOM = 0.5;

// camera clamps zoom to e^±600, natural level ≤ 866; 900 gives headroom without overflowing Number.MAX_VALUE
export const MAX_LEVEL = 900;

export interface TileCoord {
  readonly level: number;
  readonly tx: number;
  readonly ty: number;
}

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

export interface TileRange {
  tx0: number;
  tx1: number;
  ty0: number;
  ty1: number;
}

// level = round(log2(TILE_PX / (BASE_TILE_WORLD × zoom))) — bounds on-screen tile count at any zoom
export function selectLevel(zoom: number): number {
  if (!(zoom > 0) || !isFinite(zoom)) return 0;
  const raw = Math.round(Math.log2(TILE_PX / (BASE_TILE_WORLD * zoom)));
  return Math.max(0, Math.min(MAX_LEVEL, raw));
}

export function tileWorldSize(level: number): number {
  return BASE_TILE_WORLD * 2 ** level;
}

export function visibleTileRange(camera: Camera, screen: ScreenSize, level: number): TileRange {
  const t = tileWorldSize(level);
  const left   = camera.x;
  const top    = camera.y;
  const right  = camera.x + screen.width / camera.zoom;
  const bottom = camera.y + screen.height / camera.zoom;

  return {
    tx0: Math.floor(left   / t),
    tx1: Math.floor(right  / t),
    ty0: Math.floor(top    / t),
    ty1: Math.floor(bottom / t),
  };
}

// uses the tile's own level's world size, not the current camera level
export function tileOverlapsViewport(tile: TileCoord, camera: Camera, screen: ScreenSize): boolean {
  const t = tileWorldSize(tile.level);
  const tileLeft   = tile.tx * t;
  const tileTop    = tile.ty * t;
  const tileRight  = tileLeft + t;
  const tileBottom = tileTop + t;

  const viewLeft   = camera.x;
  const viewTop    = camera.y;
  const viewRight  = camera.x + screen.width / camera.zoom;
  const viewBottom = camera.y + screen.height / camera.zoom;

  return (
    tileRight > viewLeft &&
    tileLeft < viewRight &&
    tileBottom > viewTop &&
    tileTop < viewBottom
  );
}
