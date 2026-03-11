import { describe, it, expect } from 'vitest';
import { StrokeType, BYTES_PER_POINT, STROKE_HEADER_SIZE } from '@shared/stroke';
import type { BrushStroke, Color, Point } from '@shared/stroke';

describe('BrushStroke type constants', () => {
  it('StrokeType values are unique integers', () => {
    const values = Object.values(StrokeType);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
    expect(values.every((v) => Number.isInteger(v))).toBe(true);
  });

  it('binary size constants match expected layout', () => {
    // f32 x (4) + f32 y (4) + u8 pressure (1) = 9
    expect(BYTES_PER_POINT).toBe(9);
    // u8 type + u8 r + u8 g + u8 b + u8 a + u16 size + u16 pointCount = 8
    expect(STROKE_HEADER_SIZE).toBe(8);
  });
});

describe('BrushStroke structure', () => {
  it('can construct a valid BrushStroke object', () => {
    const color: Color = { r: 255, g: 0, b: 128, a: 255 };
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
    ];
    const pressures = [0.5, 1.0];

    const stroke: BrushStroke = {
      id: 'test-stroke-1',
      type: StrokeType.BRUSH,
      color,
      size: 8,
      points,
      pressures,
      layerId: 'layer-1',
      createdAt: Date.now(),
    };

    expect(stroke.type).toBe(StrokeType.BRUSH);
    expect(stroke.points).toHaveLength(2);
    expect(stroke.pressures).toHaveLength(2);
    expect(stroke.color.r).toBe(255);
  });

  it('points and pressures arrays have the same length', () => {
    const points: Point[] = [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }];
    const pressures = [0.3, 0.6, 0.9];
    expect(points.length).toBe(pressures.length);
  });
});
