import { describe, it, expect } from 'vitest';
import { EraserSession } from '../EraserSession';
import { eraserStamp } from '../../drawing/eraseGeometry';
import { StrokeType, type BrushStroke } from '@shared/stroke';
import { originAnchor, originBbox } from '@shared/anchor';
import type { FrameCandidate } from '../../drawing/StrokeRenderer';

const camera = { level: 0, cell: { x: 0n, y: 0n }, sub: { x: 0, y: 0 } };

function candidate(id: string, ring: number[]): FrameCandidate {
  const stroke: BrushStroke = {
    id,
    type: StrokeType.BRUSH,
    color: { r: 10, g: 20, b: 30, a: 255 },
    size: 1,
    points: [],
    pressures: [],
    layerId: 'default',
    createdAt: 0,
    anchor: originAnchor(),
    zIndex: 4,
    cellBbox: originBbox(),
    filled: true,
  };
  return { stroke, frameRings: [ring] };
}

const BIG_SQUARE = [0, 0, 200, 0, 200, 200, 0, 200];

describe('EraserSession', () => {
  it('adopts a stroke the stamp touches', () => {
    const session = new EraserSession({ camera, cameraScale: 1 });
    const stamp = eraserStamp([{ x: 100, y: 100 }], 10);
    expect(session.take([candidate('a', BIG_SQUARE)], stamp)).toEqual(['a']);
    expect(session.takenIds).toEqual(['a']);
  });

  it('ignores a stroke the stamp misses', () => {
    const session = new EraserSession({ camera, cameraScale: 1 });
    const stamp = eraserStamp([{ x: 9000, y: 9000 }], 10);
    expect(session.take([candidate('a', BIG_SQUARE)], stamp)).toEqual([]);
    expect(session.takenIds).toEqual([]);
  });

  it('never adopts the same stroke twice', () => {
    const session = new EraserSession({ camera, cameraScale: 1 });
    const stamp = eraserStamp([{ x: 100, y: 100 }], 10);
    const cand = [candidate('a', BIG_SQUARE)];
    session.take(cand, stamp);
    expect(session.take(cand, stamp)).toEqual([]);
    expect(session.takenIds).toHaveLength(1);
  });

  it('carves a hole into the working geometry without committing anything', () => {
    const session = new EraserSession({ camera, cameraScale: 1 });
    const stamp = eraserStamp([{ x: 100, y: 100 }], 10);
    session.take([candidate('a', BIG_SQUARE)], stamp);
    session.carve(stamp);
    const working = session.workingRings();
    expect(working).toHaveLength(1);
    expect(working[0]!.rings.length).toBeGreaterThanOrEqual(2); // outer + carved hole
    expect(working[0]!.color).toEqual({ r: 10, g: 20, b: 30, a: 255 });
  });

  it('seals into exactly one delete per original and one add per surviving piece', () => {
    const session = new EraserSession({ camera, cameraScale: 1 });
    const stamp = eraserStamp([{ x: 100, y: 100 }], 10);
    session.take([candidate('a', BIG_SQUARE)], stamp);
    session.carve(stamp);
    const sealed = session.seal();
    expect(sealed.removed).toEqual(['a']);
    expect(sealed.added).toHaveLength(1);
    expect(sealed.added[0]!.zIndex).toBe(4);
    expect(sealed.added[0]!.filled).toBe(true);
  });

  it('emits no remnant when the stamp erases the stroke entirely', () => {
    const session = new EraserSession({ camera, cameraScale: 1 });
    const small = [90, 90, 110, 90, 110, 110, 90, 110];
    const stamp = eraserStamp([{ x: 100, y: 100 }], 400);
    session.take([candidate('a', small)], stamp);
    session.carve(stamp);
    const sealed = session.seal();
    expect(sealed.removed).toEqual(['a']);
    expect(sealed.added).toEqual([]);
  });

  it('carves many steps but still seals one batch', () => {
    const session = new EraserSession({ camera, cameraScale: 1 });
    session.take([candidate('a', BIG_SQUARE)], eraserStamp([{ x: 20, y: 100 }], 8));
    for (let x = 20; x < 180; x += 4) {
      session.carve(eraserStamp([{ x, y: 100 }, { x: x + 4, y: 100 }], 8));
    }
    const sealed = session.seal();
    expect(sealed.removed).toEqual(['a']);
    // The swept band (x from ~12 to ~188) never reaches the square's x=0/x=200 edges, so the
    // square stays one connected outer ring with an interior hole rather than splitting in two.
    expect(sealed.added.length).toBeLessThanOrEqual(4);
  });

  it('keeps all 4 outer corners when carving an interior hole (regression: closing-duplicate drop)', () => {
    // polygon-clipping's output rings are self-closing (first === last point). Feeding that
    // straight into simplifyRing's Douglas-Peucker pass makes it see a zero-length edge at the
    // wrap point and silently drop a real corner — the square's outer boundary must come back as
    // 4 distinct corners, not a degenerate 3-point triangle.
    const session = new EraserSession({ camera, cameraScale: 1 });
    const stamp = eraserStamp([{ x: 100, y: 100 }], 10);
    session.take([candidate('a', BIG_SQUARE)], stamp);
    session.carve(stamp);
    const sealed = session.seal();
    expect(sealed.added).toHaveLength(1);
    expect(sealed.added[0]!.points).toHaveLength(4);
  });
});
