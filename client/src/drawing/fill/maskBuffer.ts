/** An RGBA pixel readback, row-major. */
export interface PixelBuffer {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface RegionBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A flooded region as a binary lattice, plus the tight box of its set cells. */
export interface RegionMask {
  readonly cells: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly box: RegionBox;
  readonly count: number;
  /**
   * True when the region reached the buffer edge — i.e. the walls do NOT enclose it. The old
   * `enclosedRegionAt` refused these via `touchesBoundary`; dropping the check would let a click
   * on open canvas commit a viewport-sized background stroke and broadcast it to every peer.
   */
  readonly escaped: boolean;
}

/** Alpha channel at a pixel. Walls are drawn opaque, empty space is left at alpha 0. */
export function alphaAt(buffer: PixelBuffer, x: number, y: number): number {
  return buffer.data[(y * buffer.width + x) * 4 + 3] ?? 0;
}

/**
 * Wall index encoded in RGB at a pixel, or -1 for empty space. Walls are rendered in
 * `index + 1` little-endian across R,G,B so the region's neighbours identify exactly which
 * strokes bound it — the seed oracle stage 2 needs.
 */
export function rgbIndexAt(buffer: PixelBuffer, x: number, y: number): number {
  const i = (y * buffer.width + x) * 4;
  if ((buffer.data[i + 3] ?? 0) === 0) return -1;
  const packed = (buffer.data[i] ?? 0)
    | ((buffer.data[i + 1] ?? 0) << 8)
    | ((buffer.data[i + 2] ?? 0) << 16);
  return packed - 1;
}

/** True when (x,y) is inside the buffer. */
export function inBounds(buffer: PixelBuffer, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < buffer.width && y < buffer.height;
}
