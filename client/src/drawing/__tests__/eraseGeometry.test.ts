import { describe, it, expect } from 'vitest';
import { eraserStamp, subtractStamp } from '../eraseGeometry';
import { strokeOutlineRings } from '../outlineStroke';

const FILL_SQUARE = [[0, 0, 100, 0, 100, 100, 0, 100]];

describe('subtractStamp', () => {
  it('returns null when the stamp is far from the stroke', () => {
    const stamp = eraserStamp([{ x: 500, y: 500 }], 10);
    expect(subtractStamp(FILL_SQUARE, stamp)).toBeNull();
  });

  it('punches a hole when erasing inside a filled area', () => {
    const stamp = eraserStamp([{ x: 50, y: 50 }], 10);
    const result = subtractStamp(FILL_SQUARE, stamp);
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(1); // still one polygon...
    expect(result![0]!.length).toBe(2); // ...now with an inner hole
  });

  it('splits a line ribbon when erased through the middle', () => {
    const ribbon = strokeOutlineRings([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10, false);
    const stamp = eraserStamp([{ x: 50, y: -20 }, { x: 50, y: 20 }], 8);
    const result = subtractStamp(ribbon, stamp);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2); // two remaining pieces
  });
});
