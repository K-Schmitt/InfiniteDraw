import { describe, it, expect } from 'vitest';
import { encodeStroke, decodeStroke } from '../strokeCodec.js';
import { StrokeType, type BrushStroke } from '@shared/stroke.js';

function brush(): BrushStroke {
  return {
    id: 'a1',
    type: StrokeType.BRUSH,
    color: { r: 1, g: 2, b: 3, a: 255 },
    size: 8,
    points: [
      { x: 1.5, y: -2.25 },
      { x: 3, y: 4 },
    ],
    pressures: [0.5, 1],
    layerId: 'default',
    createdAt: 1700000000000,
  };
}

describe('strokeCodec', () => {
  it('round-trips a brush stroke', () => {
    const { stroke, next } = decodeStroke(encodeStroke(brush()), 0);
    expect(stroke.id).toBe('a1');
    expect(stroke.points).toHaveLength(2);
    expect(stroke.points[0]!.x).toBeCloseTo(1.5, 3);
    expect(stroke.pressures[0]!).toBeCloseTo(0.5, 2);
    expect(next).toBeGreaterThan(0);
  });

  it('round-trips a filled stroke with holes and background', () => {
    const fill: BrushStroke = {
      ...brush(),
      id: 'f1',
      filled: true,
      background: true,
      holes: [
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
      ],
    };
    const { stroke } = decodeStroke(encodeStroke(fill), 0);
    expect(stroke.filled).toBe(true);
    expect(stroke.background).toBe(true);
    expect(stroke.holes).toHaveLength(1);
    expect(stroke.holes![0]).toHaveLength(3);
  });
});
