import { describe, it, expect } from 'vitest';
import { traceMask, groupRings } from '../traceMask';
import type { RegionMask } from '../maskBuffer';

/** Builds a RegionMask from an ASCII map: 'X' = in region. */
function mask(rows: readonly string[]): RegionMask {
  const height = rows.length;
  const width = rows[0]!.length;
  const cells = new Uint8Array(width * height);
  let count = 0;
  const box = { minX: width, minY: height, maxX: -1, maxY: -1 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rows[y]![x] !== 'X') continue;
      cells[y * width + x] = 1;
      count++;
      box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x);
      box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y);
    }
  }
  return { cells, width, height, box, count, escaped: false };
}

describe('traceMask', () => {
  it('traces a single cell as a unit square wound positive', () => {
    const [ring] = traceMask(mask(['X']));
    expect(ring!.area).toBe(1);
    expect(ring!.ring).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
  });

  it('traces a rectangle as one ring with the right area', () => {
    const rings = traceMask(mask(['XXX', 'XXX']));
    expect(rings).toHaveLength(1);
    expect(rings[0]!.area).toBe(6);
  });

  it('emits a hole as a second, negatively wound ring', () => {
    const rings = traceMask(mask(['XXX', 'X.X', 'XXX']));
    expect(rings).toHaveLength(2);
    expect(rings.filter((r) => r.area > 0)).toHaveLength(1);
    expect(rings.filter((r) => r.area < 0)).toHaveLength(1);
    expect(Math.abs(rings.find((r) => r.area < 0)!.area)).toBe(1);
  });

  it('emits one ring per disjoint component', () => {
    expect(traceMask(mask(['X.X']))).toHaveLength(2);
  });

  it('returns nothing for an empty mask', () => {
    expect(traceMask(mask(['...']))).toEqual([]);
  });
});

describe('groupRings', () => {
  it('assigns each hole to the outer ring that contains it', () => {
    const grouped = groupRings(traceMask(mask(['XXX', 'X.X', 'XXX'])));
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.holes).toHaveLength(1);
  });

  it('keeps disjoint components separate', () => {
    const grouped = groupRings(traceMask(mask(['X.X'])));
    expect(grouped).toHaveLength(2);
    expect(grouped.every((g) => g.holes.length === 0)).toBe(true);
  });
});
