import { describe, it, expect } from 'vitest';
import { StrokeType, type BrushStroke } from '@shared/stroke';
import { LOCAL_SPAN_N, originBbox, type CellAnchor } from '@shared/anchor';
import type { ProjCamera } from '../../coords/viewProject';
import { strokeToRings } from '../strokeToPath';
import { cameraInsideStroke, localBoundsOf } from '../projectRings';

const ANCHOR: CellAnchor = { level: 0, cell: { x: 0n, y: 0n } };

// The gaps at which `place` hands a coarse stroke to `placeCulled`: route 2 (on-screen span past
// 2**22) first fires around 14 for a 400-unit shape, route 1 (anchor projection culled) past ~44.
const CULLED_GAPS = [14, 20, 44, 60];

function strokeOf(overrides: Partial<BrushStroke>): BrushStroke {
  return {
    id: 's1',
    type: StrokeType.RECTANGLE,
    color: { r: 0, g: 0, b: 0, a: 255 },
    size: 4,
    points: [],
    pressures: [],
    layerId: 'l1',
    createdAt: 0,
    anchor: ANCHOR,
    zIndex: 0,
    cellBbox: originBbox(),
    ...overrides,
  };
}

/** A closed 400×400 rectangle outline at local (100,100)–(500,500): rings 98–502 / 102–498. */
function closedRectangle(): BrushStroke {
  return strokeOf({
    points: [
      { x: 100, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 500 },
      { x: 100, y: 500 }, { x: 100, y: 100 },
    ],
    pressures: new Array(5).fill(0.5),
  });
}

/** The same square as a solid filled region (paint bucket / filled shape). */
function filledSquare(): BrushStroke {
  return strokeOf({
    filled: true,
    points: [{ x: 100, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 500 }, { x: 100, y: 500 }],
    pressures: new Array(4).fill(0.5),
  });
}

/**
 * A camera sitting at anchor-local (x, y), `gap` levels finer than ANCHOR. `x` and `y` must be
 * multiples of 2**(16-gap) so the cell division is exact and the probe lands on the point asked
 * for — every coordinate used below is.
 */
function cameraAtLocal(x: number, y: number, gap: number): ProjCamera {
  const g = BigInt(gap);
  return {
    level: ANCHOR.level + gap,
    cell: { x: (BigInt(x) << g) / LOCAL_SPAN_N, y: (BigInt(y) << g) / LOCAL_SPAN_N },
    sub: { x: 0, y: 0 },
  };
}

function geometryOf(stroke: BrushStroke): { bounds: ReturnType<typeof localBoundsOf>; rings: number[][] } {
  const rings = strokeToRings(stroke);
  return { bounds: localBoundsOf(rings), rings };
}

describe('cameraInsideStroke', () => {
  it('builds the closed rectangle as an annulus whose bbox covers the hollow centre', () => {
    const { bounds, rings } = geometryOf(closedRectangle());
    expect(rings.length).toBe(2);
    expect(bounds).toEqual({ minX: 98, minY: 98, maxX: 502, maxY: 502 });
  });

  // The bug: past the bleed threshold the renderer floods the viewport with the stroke colour
  // whenever this returns true, so a camera in the hollow centre painted the empty area solid.
  for (const gap of CULLED_GAPS) {
    it(`is false in the hollow centre of a closed shape (gap ${gap})`, () => {
      const { bounds, rings } = geometryOf(closedRectangle());
      expect(cameraInsideStroke({ bounds, rings }, ANCHOR, cameraAtLocal(300, 300, gap))).toBe(false);
    });
  }

  for (const gap of CULLED_GAPS) {
    it(`is true on the painted band itself (gap ${gap})`, () => {
      const { bounds, rings } = geometryOf(closedRectangle());
      expect(cameraInsideStroke({ bounds, rings }, ANCHOR, cameraAtLocal(100, 300, gap))).toBe(true);
    });
  }

  it('is false outside the stroke entirely', () => {
    const { bounds, rings } = geometryOf(closedRectangle());
    expect(cameraInsideStroke({ bounds, rings }, ANCHOR, cameraAtLocal(900, 900, 20))).toBe(false);
  });

  // Bleeding is correct for a solid region — the camera really is over painted area there.
  for (const gap of CULLED_GAPS) {
    it(`is true inside a solid filled region (gap ${gap})`, () => {
      const { bounds, rings } = geometryOf(filledSquare());
      expect(cameraInsideStroke({ bounds, rings }, ANCHOR, cameraAtLocal(300, 300, gap))).toBe(true);
    });
  }

  it('is false when the stroke is finer than the camera', () => {
    const { bounds, rings } = geometryOf(filledSquare());
    const finerAnchor: CellAnchor = { level: 5, cell: { x: 0n, y: 0n } };
    expect(cameraInsideStroke({ bounds, rings }, finerAnchor, cameraAtLocal(300, 300, 0))).toBe(false);
  });
});
