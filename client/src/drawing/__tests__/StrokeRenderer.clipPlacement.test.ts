import { describe, it, expect } from 'vitest';
import type { Container, Graphics, Renderer } from 'pixi.js';
import { StrokeType, type BrushStroke } from '@shared/stroke';
import { originBbox, type CellAnchor } from '@shared/anchor';
import type { ProjCamera } from '../../coords/viewProject';
import { StrokeRenderer } from '../StrokeRenderer';
import { strokeToRings } from '../strokeToPath';
import { cameraInsideStroke, localBoundsOf } from '../projectRings';

const ANCHOR: CellAnchor = { level: 0, cell: { x: 0n, y: 0n } };
const SCREEN_W = 1280;
const SCREEN_H = 720;
const LOCAL_SPAN = 65536;

/** A 400×400 closed rectangle at local (100,100)–(500,500): ink bands at 98–102 and 498–502. */
function closedRectangle(): BrushStroke {
  return {
    id: 'wall',
    type: StrokeType.RECTANGLE,
    color: { r: 0, g: 0, b: 0, a: 255 },
    size: 4,
    points: [
      { x: 100, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 500 },
      { x: 100, y: 500 }, { x: 100, y: 100 },
    ],
    pressures: new Array(5).fill(0.5),
    layerId: 'default',
    createdAt: 0,
    anchor: ANCHOR,
    zIndex: 0,
    cellBbox: originBbox(),
  };
}

/**
 * A camera at `level` placing anchor-local (lx, ly) at frame (fx, fy) — i.e. that many screen
 * pixels from the viewport's top-left, since frameScale is 1 at frac 0. Exact: the split into
 * cell + sub is integer arithmetic, no rounding to hide behind.
 */
function cameraPlacing(local: { x: number; y: number }, frame: { x: number; y: number }): ProjCamera {
  const level = 14; // 404 local units × 2^14 ≈ 6.6M px on screen — past FRAME_MAX_SCREEN_SPAN
  const at = (l: number, f: number): { cell: bigint; sub: number } => {
    const total = l * 2 ** level - f; // = cell·LOCAL_SPAN + sub
    const cell = Math.floor(total / LOCAL_SPAN);
    return { cell: BigInt(cell), sub: total - cell * LOCAL_SPAN };
  };
  const x = at(local.x, frame.x);
  const y = at(local.y, frame.y);
  return { level, cell: { x: x.cell, y: y.cell }, sub: { x: x.sub, y: y.sub } };
}

function renderer(): StrokeRenderer {
  return new StrokeRenderer(undefined as unknown as Renderer);
}

/** The single stroke's Graphics, reached through the renderer's vector layer. */
function placedGraphics(strokes: StrokeRenderer): Graphics {
  const vectorLayer = strokes.container.children[0] as Container;
  return vectorLayer.children[0] as Graphics;
}

function drawAt(camera: ProjCamera): Graphics {
  const strokes = renderer();
  strokes.addStroke(closedRectangle());
  strokes.redraw(camera, 2 ** camera.level, SCREEN_W, SCREEN_H);
  return placedGraphics(strokes);
}

const geometry = (): { bounds: ReturnType<typeof localBoundsOf>; rings: number[][] } => {
  const rings = strokeToRings(closedRectangle());
  return { bounds: localBoundsOf(rings), rings };
};

describe('StrokeRenderer placement past the bake limit', () => {
  // The viewport straddles the shape's right wall: its inner edge (local x = 498) sits 40 px in,
  // so the left 40 px of screen are hollow and everything right of that is ink.
  const acrossTheWall = cameraPlacing({ x: 498, y: 300 }, { x: 40, y: 0 });

  it('the exact probe reads "outside" — the decision that used to hide the wall', () => {
    expect(cameraInsideStroke(geometry(), ANCHOR, acrossTheWall)).toBe(false);
  });

  it('keeps a wall crossing the viewport on screen', () => {
    const gfx = drawAt(acrossTheWall);
    expect(gfx.visible).toBe(true);
  });

  it('paints only the ink side of the viewport, not all of it', () => {
    const bounds = drawAt(acrossTheWall).getLocalBounds();
    expect(bounds.minX).toBeCloseTo(40, 0); // hollow stays empty up to the wall
    expect(bounds.maxX).toBeGreaterThanOrEqual(SCREEN_W);
  });

  it('hides the stroke when the whole viewport sits in the hollow', () => {
    // frame origin at local (300,300), dead centre — no wall within 100+ local units
    expect(drawAt(cameraPlacing({ x: 300, y: 300 }, { x: 0, y: 0 })).visible).toBe(false);
  });

  it('hides an oversized stroke that is nowhere near the viewport', () => {
    // Rejected on bounding box alone — this is the common case at deep zoom, and it must never
    // reach polygon-clipping.
    expect(drawAt(cameraPlacing({ x: 1000, y: 1000 }, { x: 0, y: 0 })).visible).toBe(false);
  });

  it('covers the whole viewport when the camera is inside the ink band', () => {
    // frame origin at local (100,300): inside the left wall (98–102), which is ~65k px thick here
    const bounds = drawAt(cameraPlacing({ x: 100, y: 300 }, { x: 0, y: 0 })).getLocalBounds();
    expect(bounds.minX).toBeLessThanOrEqual(0);
    expect(bounds.maxX).toBeGreaterThanOrEqual(SCREEN_W);
    expect(bounds.maxY).toBeGreaterThanOrEqual(SCREEN_H);
  });
});
