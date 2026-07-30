import { describe, it, expect } from 'vitest';
import { floodRegion } from '../floodRegion';
import type { PixelBuffer } from '../maskBuffer';

/** Builds an RGBA buffer from an ASCII map: '#' = opaque wall, '.' = transparent. */
function buffer(rows: readonly string[]): PixelBuffer {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rows[y]![x] === '#') data[(y * width + x) * 4 + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('floodRegion', () => {
  it('fills the interior of a closed box and stops at the wall', () => {
    const mask = floodRegion(buffer([
      '#####',
      '#...#',
      '#...#',
      '#####',
    ]), { x: 2, y: 2 })!;
    expect(mask.count).toBe(6);
    expect(mask.box).toEqual({ minX: 1, minY: 1, maxX: 3, maxY: 2 });
  });

  it('does not cross a diagonal pinch (4-connected)', () => {
    const mask = floodRegion(buffer([
      '#####',
      '#.#.#',
      '##.##',
      '#####',
    ]), { x: 1, y: 1 })!;
    expect(mask.count).toBe(1);
  });

  it('leaks to the edge of an open region', () => {
    const mask = floodRegion(buffer([
      '#####',
      '#...#',
      '#...#',
      '#.###',
    ]), { x: 2, y: 2 })!;
    expect(mask.box.maxY).toBe(3);
  });

  it('flags a region that reaches the buffer edge as escaped', () => {
    expect(floodRegion(buffer(['#####', '#...#', '#...#', '#.###']), { x: 2, y: 2 })!.escaped)
      .toBe(true);
  });

  it('does not flag a fully enclosed region', () => {
    expect(floodRegion(buffer(['#####', '#...#', '#####']), { x: 2, y: 1 })!.escaped).toBe(false);
  });

  it('returns null when the seed is on a wall', () => {
    expect(floodRegion(buffer(['##', '##']), { x: 0, y: 0 })).toBeNull();
  });

  it('returns null when the seed is out of bounds', () => {
    expect(floodRegion(buffer(['..', '..']), { x: 5, y: 0 })).toBeNull();
  });

  it('handles a mask with no walls at all', () => {
    const mask = floodRegion(buffer(['...', '...']), { x: 1, y: 1 })!;
    expect(mask.count).toBe(6);
  });
});
