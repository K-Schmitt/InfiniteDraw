import { describe, it, expect } from 'vitest';
import { StrokeType, type BrushStroke } from '@shared/stroke';
import { LOCAL_SPAN_N, originBbox, type CellAnchor } from '@shared/anchor';
import type { ProjCamera } from '../../coords/viewProject';
import { strokeToRings } from '../strokeToPath';
import { cameraInsideStroke, cameraLocalPoint, localBoundsOf } from '../projectRings';

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
function closedRectangle(size = 4): BrushStroke {
  return strokeOf({
    size,
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
 * A camera sitting at anchor-local (x, y), `gap` levels finer than ANCHOR. Exact for any x, y on
 * a quarter-unit grid (with gap >= 2). Fractional placements are the interesting ones: past
 * gap 16 the sub-unit part of the position lives entirely in the BigInt cell, exactly where the
 * probe used to shift it away.
 */
function cameraAtLocal(x: number, y: number, gap: number): ProjCamera {
  const ax = axisAt(x, gap);
  const ay = axisAt(y, gap);
  return {
    level: ANCHOR.level + gap,
    cell: { x: ax.cell, y: ay.cell },
    sub: { x: ax.sub, y: ay.sub },
  };
}

/** Anchor-local coordinate → the exact camera cell + sub-cell offset that sits on it. */
function axisAt(local: number, gap: number): { cell: bigint; sub: number } {
  const units = (BigInt(local * 4) << BigInt(gap)) / 4n; // camera-level units
  const cell = units / LOCAL_SPAN_N;
  return { cell, sub: Number(units - cell * LOCAL_SPAN_N) };
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

  // A 5-unit pen puts the band's inner edge at 497.5, off the unit grid. Quantizing the probe to
  // whole anchor units reads 497 — the hollow — so the renderer hid a stroke the camera stands on.
  for (const gap of [20, 44, 60]) {
    it(`is true just inside a band edge that is off the unit grid (gap ${gap})`, () => {
      const { bounds, rings } = geometryOf(closedRectangle(5));
      const camera = cameraAtLocal(497.75, 300, gap);
      expect(cameraInsideStroke({ bounds, rings }, ANCHOR, camera)).toBe(true);
    });
  }

  it('stays false just outside that same edge', () => {
    const { bounds, rings } = geometryOf(closedRectangle(5));
    const camera = cameraAtLocal(497.25, 300, 44);
    expect(cameraInsideStroke({ bounds, rings }, ANCHOR, camera)).toBe(false);
  });

  it('is false when the stroke is finer than the camera', () => {
    const { bounds, rings } = geometryOf(filledSquare());
    const finerAnchor: CellAnchor = { level: 5, cell: { x: 0n, y: 0n } };
    expect(cameraInsideStroke({ bounds, rings }, finerAnchor, cameraAtLocal(300, 300, 0))).toBe(false);
  });
});

describe('cameraLocalPoint', () => {
  // Past gap 16 the camera cell alone carries sub-unit position (LOCAL_SPAN is 2**16), so
  // shifting it right before folding `sub` in threw the fraction away — up to a whole unit.
  for (const gap of [2, 16, 20, 44, 60, 200]) {
    it(`keeps the sub-unit part of the camera position (gap ${gap})`, () => {
      const p = cameraLocalPoint(ANCHOR, cameraAtLocal(498.75, 300.25, gap));
      expect(p!.x).toBeCloseTo(498.75, 6);
      expect(p!.y).toBeCloseTo(300.25, 6);
    });
  }

  it('is null when the anchor is finer than the camera', () => {
    const finer: CellAnchor = { level: 5, cell: { x: 0n, y: 0n } };
    expect(cameraLocalPoint(finer, cameraAtLocal(300, 300, 0))).toBeNull();
  });
});
