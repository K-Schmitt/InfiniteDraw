import { describe, it, expect } from 'vitest';
import { boundingWallIndices } from '../boundingWalls';
import type { PixelBuffer, RegionMask } from '../maskBuffer';

/**
 * Builds a buffer + mask from an ASCII map. Digits are wall indices, '.' is empty,
 * and 'X' is empty space that is part of the flooded region.
 */
function scene(rows: readonly string[]): { buffer: PixelBuffer; mask: RegionMask } {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8ClampedArray(width * height * 4);
  const cells = new Uint8Array(width * height);
  const box = { minX: width, minY: height, maxX: -1, maxY: -1 };
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y]![x]!;
      const i = (y * width + x) * 4;
      if (ch >= '0' && ch <= '9') {
        const packed = Number(ch) + 1;
        data[i] = packed & 255;
        data[i + 1] = (packed >> 8) & 255;
        data[i + 2] = (packed >> 16) & 255;
        data[i + 3] = 255;
      } else if (ch === 'X') {
        cells[y * width + x] = 1;
        count++;
        box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x);
        box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y);
      }
    }
  }
  const mask = { cells, width, height, box, count, escaped: false };
  return { buffer: { data, width, height }, mask };
}

describe('boundingWallIndices', () => {
  it('reports the single wall enclosing a region', () => {
    const { buffer, mask } = scene([
      '000',
      '0X0',
      '000',
    ]);
    expect(boundingWallIndices(mask, buffer)).toEqual([0]);
  });

  it('reports every distinct wall touching the region', () => {
    const { buffer, mask } = scene([
      '0X1',
      '2X1',
      '222',
    ]);
    expect(boundingWallIndices(mask, buffer)).toEqual([0, 1, 2]);
  });

  it('ignores walls that only touch diagonally', () => {
    const { buffer, mask } = scene([
      '0..',
      '.X.',
      '..0',
    ]);
    expect(boundingWallIndices(mask, buffer)).toEqual([]);
  });

  it('returns nothing when the region touches only empty space', () => {
    const { buffer, mask } = scene(['...', '.X.', '...']);
    expect(boundingWallIndices(mask, buffer)).toEqual([]);
  });

  it('returns nothing for an empty region', () => {
    const { buffer, mask } = scene(['000', '000']);
    expect(boundingWallIndices(mask, buffer)).toEqual([]);
  });
});
