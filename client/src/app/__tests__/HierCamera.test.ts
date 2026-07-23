import { describe, it, expect } from 'vitest';
import { HierCamera } from '../HierCamera';

describe('HierCamera carry', () => {
  it('carries sub over the high boundary exactly (positive)', () => {
    const c = new HierCamera();
    c.setSub(65536 + 40); // just over one cell
    c.carry();
    expect(c.projCamera.cell.x).toBe(1n);
    expect(c.projCamera.sub.x).toBe(40); // Sterbenz-exact
  });

  it('carries negative sub down a cell (bounded error)', () => {
    const c = new HierCamera();
    c.setSub(-0.1);
    c.carry();
    expect(c.projCamera.cell.x).toBe(-1n);
    expect(c.projCamera.sub.x).toBeCloseTo(65535.9, 4); // within ~2^-37
  });
});

describe('HierCamera zoom hysteresis', () => {
  it('does not thrash levels when oscillating on a boundary', () => {
    const c = new HierCamera();
    c.zoomBy(0.99, 0, 0);   // near boundary but inside dead-band
    const level1 = c.projCamera.level;
    c.zoomBy(-0.01, 0, 0);
    c.zoomBy(0.01, 0, 0);
    expect(c.projCamera.level).toBe(level1); // no flip-flop
  });
});

describe('HierCamera zoom pivot invariance (within a level)', () => {
  it('keeps the world point under the pivot fixed on screen', () => {
    const c = new HierCamera();
    const pivotFx = 300, pivotFy = 120;
    const before = c.projCamera;
    // world point currently under the pivot, in absolute local units at this level:
    const absX = before.sub.x + pivotFx;
    const absY = before.sub.y + pivotFy;
    const screenBefore = c.frameToScreen(pivotFx, pivotFy);
    c.zoomBy(0.4, pivotFx, pivotFy); // 0.4 < 1 → stays in level, cell unchanged
    const after = c.projCamera;
    const screenAfter = c.frameToScreen(absX - after.sub.x, absY - after.sub.y);
    expect(screenAfter.x).toBeCloseTo(screenBefore.x, 6);
    expect(screenAfter.y).toBeCloseTo(screenBefore.y, 6);
  });
});

describe('HierCamera.toLegacyCamera pivot invariance across level crossings', () => {
  it('keeps a recorded world point under the pivot fixed on screen across many level crossings', () => {
    // Regression test: toLegacyCamera() once omitted the 2^-level factor, so
    // (cell*LOCAL_SPAN+sub) alone is NOT level-invariant — rescaleCell doubles/halves it on
    // every level crossing even with zero pan. That broke exactly this scenario: draw a point,
    // zoom out through several level boundaries, and the point should still land where the
    // pure zoom-about-pivot physics predicts.
    const c = new HierCamera();
    const PIVOT_SX = 900;
    const before = c.toLegacyCamera();
    const worldX = 700 / before.zoom + before.x; // record a point at screen x=700, level 0

    const ZOOM_OUT = Math.log2(1 / 1.12);
    for (let i = 0; i < 10; i++) {
      const pivot = c.screenToFrame(PIVOT_SX, 0);
      c.zoomBy(ZOOM_OUT, pivot.x, pivot.y);
    }
    expect(c.projCamera.level).toBeLessThan(0); // sanity: this test must cross ≥1 level boundary

    const after = c.toLegacyCamera();
    const screenX = (worldX - after.x) * after.zoom;
    const expected = PIVOT_SX + (700 - PIVOT_SX) * c.scale;
    expect(screenX).toBeCloseTo(expected, 6);
  });
});

describe('HierCamera infinite zoom (no depth bound)', () => {
  it('lets level grow without limit in both directions', () => {
    const cIn = new HierCamera();
    cIn.zoomBy(2000, 0, 0);
    expect(cIn.projCamera.level).toBeGreaterThan(1000); // no clamp — navigation is unbounded

    const cOut = new HierCamera();
    cOut.zoomBy(-2000, 0, 0);
    expect(cOut.projCamera.level).toBeLessThan(-1000);
  });
});

describe('HierCamera.toLegacyCamera render-zoom clamp', () => {
  it('clamps the rendered zoom scalar so extreme levels never produce Infinity/NaN', () => {
    const c = new HierCamera();
    c.zoomBy(2000, 0, 0); // far past RENDER_LOG_LIMIT
    const { zoom } = c.toLegacyCamera();
    expect(Number.isFinite(zoom)).toBe(true);
    expect(zoom).toBeGreaterThan(0);
  });

  it('does not clamp logZoom itself (HUD stays conceptually unbounded)', () => {
    const c = new HierCamera();
    c.zoomBy(2000, 0, 0);
    expect(c.logZoom).toBeGreaterThan(600); // unclamped, unlike toLegacyCamera().zoom
  });
});

describe('HierCamera Kahan-compensated sub accumulation (regression)', () => {
  it('keeps a recorded world point sub-pixel accurate after a round trip through ~36 levels', () => {
    // Regression test for the precision-amplification bug found via manual testing: hundreds
    // of small pivot-shift additions in zoomBy each lose a few ULPs to float rounding: harmless
    // on their own, but rescaleCell's doublings on the way back in amplify that residue by up
    // to 2^(levels crossed). Before the Kahan fix + depth clamp, a round trip through ~53
    // levels left the camera position off by roughly one LOCAL_SPAN (tens of thousands of
    // world units) — reproduced and measured during manual testing of Task F1.
    const c = new HierCamera();
    const PIVOT_SX = 800;
    const before = c.toLegacyCamera();
    const worldX = 700 / before.zoom + before.x;

    const NOTCH = Math.log2(1.12);
    const notches = Math.round(36 / NOTCH);
    for (let i = 0; i < notches; i++) {
      const p = c.screenToFrame(PIVOT_SX, 0);
      c.zoomBy(-NOTCH, p.x, p.y);
    }
    expect(c.projCamera.level).toBeLessThan(-30); // sanity: this test must go deep
    for (let i = 0; i < notches; i++) {
      const p = c.screenToFrame(PIVOT_SX, 0);
      c.zoomBy(NOTCH, p.x, p.y);
    }

    const after = c.toLegacyCamera();
    const screenX = (worldX - after.x) * after.zoom;
    // Tolerance: sub-pixel, not the ~60000-unit drift seen pre-fix.
    expect(Math.abs(screenX - PIVOT_SX - (700 - PIVOT_SX) * c.scale)).toBeLessThan(1);
  });
});

describe('HierCamera deep-zoom sub precision (F2 bug 2 regression)', () => {
  // Manual repro (F2 audit): draw at zoom 1, dézoome jusqu'à ~10^-16, re-zoom in — the stroke
  // never returns. Root cause: rescaleCell's `sub *= 2` on the way back up amplifies sub's ULP
  // quantization by 2^(levels crossed); Kahan summation did not help (its residue tracks
  // addition low-bits, not the doubling of an already-rounded float). Past ~40 levels a
  // symmetric zoom-out/zoom-in round trip drifted the camera by ~5 whole cells (~340000px,
  // growing per cycle — the "never returns"). The fix stores the sub-cell offset as BigInt
  // fixed-point so cross-level scaling is an exact shift, killing the 2^levels amplification.
  const NOTCH = Math.log2(1.12);

  function deepSymmetricRoundTrip(pivotSx: number): HierCamera {
    const c = new HierCamera();
    let notches = 0;
    while (c.projCamera.level > -56) {
      const p = c.screenToFrame(pivotSx, 0);
      c.zoomBy(-NOTCH, p.x, p.y);
      notches += 1;
    }
    expect(c.projCamera.level).toBeLessThanOrEqual(-56); // sanity: reached ~10^-16.8
    for (let i = 0; i < notches; i += 1) {
      const p = c.screenToFrame(pivotSx, 0);
      c.zoomBy(NOTCH, p.x, p.y);
    }
    return c;
  }

  // Reference (top-left) offset expressed back at level 0; 0 means the camera returned exactly.
  function pos0Of(c: HierCamera): number {
    const pc = c.projCamera;
    return (Number(pc.cell.x) * 65536 + pc.sub.x) * 2 ** -pc.level;
  }

  it('returns exactly for an origin-anchored deep round trip (sub stays exact)', () => {
    // With the pivot at the cell origin every pan delta is 0, so a correct fixed-point sub must
    // survive 56 exact ×2/÷2 crossings with zero drift. (Float sub already managed this case;
    // it is the control that proves the BigInt rewrite did not itself introduce drift.)
    expect(Math.abs(pos0Of(deepSymmetricRoundTrip(0)))).toBeLessThan(1e-6);
  });

  it('no longer corrupts whole cells for an offset-pivot deep round trip', () => {
    // The pre-fix bug: this drifted by ~5 whole LOCAL_SPAN cells (cellX 0→5). The BigInt sub
    // removes that exponential cell corruption. A residual float drift remains — proportional to
    // pivot distance (~7px per pivot-unit at 56 levels), from rounding of the incremental pan
    // term amplified by the up-path doublings — but it is bounded well below a single cell, so
    // the integer grid is never corrupted and the drift no longer accumulates per zoom cycle.
    expect(Math.abs(pos0Of(deepSymmetricRoundTrip(400)))).toBeLessThan(65536 / 8);
  });
});
