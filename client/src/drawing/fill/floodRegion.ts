import { alphaAt, inBounds, type PixelBuffer, type RegionBox, type RegionMask } from './maskBuffer';

export interface FloodSeed {
  readonly x: number;
  readonly y: number;
}

interface Span {
  readonly y: number;
  readonly left: number;
  readonly right: number;
}

interface FloodState {
  readonly buffer: PixelBuffer;
  readonly cells: Uint8Array;
  readonly stack: number[];
  readonly box: RegionBox;
  count: number;
}

/**
 * 4-connected scanline flood over transparent pixels. Walls are opaque, so membership is a
 * single alpha test — no colour tolerance, hence no leak/under-fill tuning. Runs in bounded
 * screen space, so its cost is the viewport size at *every* zoom level, which is the whole
 * reason the bucket lives in raster space rather than in world geometry.
 */
export function floodRegion(buffer: PixelBuffer, seed: FloodSeed): RegionMask | null {
  if (!inBounds(buffer, seed.x, seed.y) || alphaAt(buffer, seed.x, seed.y) !== 0) return null;
  const state: FloodState = {
    buffer,
    cells: new Uint8Array(buffer.width * buffer.height),
    stack: [seed.x, seed.y],
    box: { minX: buffer.width, minY: buffer.height, maxX: -1, maxY: -1 },
    count: 0,
  };
  while (state.stack.length > 0) {
    const y = state.stack.pop()!;
    const x = state.stack.pop()!;
    if (!isFree(state, x, y)) continue;
    fillSpanAt(state, x, y);
  }
  const { cells, box, count } = state;
  const escaped = box.minX === 0 || box.minY === 0
    || box.maxX === buffer.width - 1 || box.maxY === buffer.height - 1;
  return { cells, width: buffer.width, height: buffer.height, box, count, escaped };
}

/** Fills the maximal horizontal run through (x,y), then seeds the rows above and below it. */
function fillSpanAt(state: FloodState, x: number, y: number): void {
  const w = state.buffer.width;
  let left = x;
  while (left > 0 && isFree(state, left - 1, y)) left--;
  let right = x;
  while (right < w - 1 && isFree(state, right + 1, y)) right++;
  for (let i = left; i <= right; i++) {
    state.cells[y * w + i] = 1;
    state.count++;
  }
  growBox(state.box, { y, left, right });
  seedRow(state, { y: y - 1, left, right });
  seedRow(state, { y: y + 1, left, right });
}

/**
 * Pushes **one** seed per contiguous free sub-span of `span` — the textbook scanline rule.
 * Pushing every free pixel instead peaks at ~1.65M stack entries (≈13 MB of `number[]`) for a
 * single open-canvas click, versus a few thousand here, for the same pixel count.
 */
function seedRow(state: FloodState, span: Span): void {
  if (span.y < 0 || span.y >= state.buffer.height) return;
  let inRun = false;
  for (let x = span.left; x <= span.right; x++) {
    const free = isFree(state, x, span.y);
    if (free && !inRun) state.stack.push(x, span.y);
    inRun = free;
  }
}

function isFree(state: FloodState, x: number, y: number): boolean {
  return state.cells[y * state.buffer.width + x] === 0 && alphaAt(state.buffer, x, y) === 0;
}

function growBox(box: RegionBox, span: Span): void {
  box.minX = Math.min(box.minX, span.left);
  box.maxX = Math.max(box.maxX, span.right);
  box.minY = Math.min(box.minY, span.y);
  box.maxY = Math.max(box.maxY, span.y);
}
