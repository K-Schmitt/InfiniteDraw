import { describe, it, expect } from 'vitest';
import { StrokeType, type BrushStroke } from '@shared/stroke.js';
import { toWireStroke, fromWireStroke } from '@shared/wireStroke.js';

function deepStroke(): BrushStroke {
  return {
    id: 's1',
    type: StrokeType.BRUSH,
    color: { r: 10, g: 20, b: 30, a: 255 },
    size: 4,
    points: [{ x: 1.5, y: 2.5 }],
    pressures: [1],
    layerId: 'default',
    createdAt: 1,
    // past Number.MAX_SAFE_INTEGER: the whole reason these stay BigInt in memory
    anchor: { level: 90, cell: { x: 123456789012345678901n, y: -987654321098765432109n } },
    zIndex: 7,
    cellBbox: { minX: -5n, minY: -5n, maxX: 123456789012345678901n, maxY: 5n },
  };
}

describe('wireStroke', () => {
  it('round-trips BigInt anchors and bboxes past the float64-safe range', () => {
    const original = deepStroke();
    expect(fromWireStroke(toWireStroke(original))).toEqual(original);
  });

  it('produces a JSON-serializable payload (socket.io throws on raw BigInt)', () => {
    // The unguarded shape threw "Do not know how to serialize a BigInt" inside socket.io's
    // encoder, aborting the emit *and* the rest of the tool's pointer handler.
    expect(() => JSON.stringify(deepStroke())).toThrow(TypeError);
    expect(() => JSON.stringify(toWireStroke(deepStroke()))).not.toThrow();
  });

  it('survives a JSON hop, as the real transport does', () => {
    const original = deepStroke();
    const hopped = JSON.parse(JSON.stringify(toWireStroke(original)));
    expect(fromWireStroke(hopped)).toEqual(original);
  });
});
