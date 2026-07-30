import { inBounds, rgbIndexAt, type PixelBuffer, type RegionMask } from './maskBuffer';

const NEIGHBOUR_DX = [1, -1, 0, 0];
const NEIGHBOUR_DY = [0, 0, 1, -1];

/**
 * The seed oracle. Walks the region's 4-neighbourhood and decodes the index colour of every wall
 * pixel immediately outside it, yielding exactly the strokes that enclose the click.
 *
 * This is what lets the exact reconstruction stage stay well-conditioned: instead of running a
 * boolean difference against every stroke in the viewport — whose combined bounding box collapses
 * small shapes when the scale ratio is extreme, which is precisely today's "nothing fills" bug —
 * it runs against the handful of strokes that actually matter, normalized around the region alone.
 */
export function boundingWallIndices(mask: RegionMask, buffer: PixelBuffer): number[] {
  const found = new Set<number>();
  for (let y = mask.box.minY; y <= mask.box.maxY; y++) {
    for (let x = mask.box.minX; x <= mask.box.maxX; x++) {
      if (mask.cells[y * mask.width + x] !== 1) continue;
      collectNeighbours(found, { mask, buffer }, { x, y });
    }
  }
  return [...found].sort((a, b) => a - b);
}

interface Scene {
  readonly mask: RegionMask;
  readonly buffer: PixelBuffer;
}

interface Cell {
  readonly x: number;
  readonly y: number;
}

function collectNeighbours(found: Set<number>, scene: Scene, cell: Cell): void {
  for (let d = 0; d < 4; d++) {
    const nx = cell.x + NEIGHBOUR_DX[d]!;
    const ny = cell.y + NEIGHBOUR_DY[d]!;
    if (!inBounds(scene.buffer, nx, ny)) continue;
    if (scene.mask.cells[ny * scene.mask.width + nx] === 1) continue;
    const index = rgbIndexAt(scene.buffer, nx, ny);
    if (index >= 0) found.add(index);
  }
}
