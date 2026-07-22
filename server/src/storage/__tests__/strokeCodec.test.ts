import { describe, it, expect } from 'vitest';
import { encodeStroke, decodeStroke } from '../strokeCodec.js';
import { writeVarBigInt } from '@shared/bigintVarint.js';
import { StrokeType, type BrushStroke } from '@shared/stroke.js';
import { originAnchor, originBbox } from '@shared/anchor.js';

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
    anchor: originAnchor(),
    zIndex: 0,
    cellBbox: originBbox(),
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

  it('round-trips a v3 anchored stroke incl. large negative cell', () => {
    const s: BrushStroke = {
      ...brush(),
      id: 'v3',
      anchor: { level: 7, cell: { x: -(2n ** 55n), y: 2n ** 40n } },
      zIndex: 42,
      cellBbox: {
        minX: -(2n ** 55n), minY: 2n ** 40n, maxX: -(2n ** 55n) + 1n, maxY: 2n ** 40n + 1n,
      },
    };
    const { stroke } = decodeStroke(encodeStroke(s), 0);
    expect(stroke.anchor.level).toBe(7);
    expect(stroke.anchor.cell.x).toBe(-(2n ** 55n));
    expect(stroke.anchor.cell.y).toBe(2n ** 40n);
    expect(stroke.zIndex).toBe(42);
    expect(stroke.cellBbox.maxY).toBe(2n ** 40n + 1n);
  });

  it('rejects an out-of-bounds cell', () => {
    // pascal id (len 0), pascal layerId (len 0), then varint level 0 + cell.x huge
    const empty = Buffer.alloc(4); // u32 length 0
    const bad = Buffer.concat([empty, empty, writeVarBigInt(0n), writeVarBigInt(2n ** 70n)]);
    expect(() => decodeStroke(bad, 0)).toThrow();
  });
});
