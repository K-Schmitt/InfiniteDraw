import { describe, it, expect } from 'vitest';
import { clipRingsToScreen } from '../clipToView';

describe('clipRingsToScreen', () => {
  // a stroke spanning 2e8 world units, viewed zoomed-in near its center
  const huge = [[1e8, 1e8, 3e8, 1e8, 3e8, 3e8, 1e8, 3e8]];
  const camera = { x: 2e8, y: 2e8, zoom: 30 };

  it('produces small screen-space coordinates (float32-safe), not huge world ones', () => {
    const rings = clipRingsToScreen(huge, camera, 1000, 1000);
    expect(rings.length).toBeGreaterThan(0);
    let maxAbs = 0;
    for (const ring of rings) for (const v of ring) maxAbs = Math.max(maxAbs, Math.abs(v));
    expect(maxAbs).toBeLessThan(1e5); // clipped to the viewport, not spanning 6e9 px
  });

  it('stays precise at extreme zoom (small stroke, tiny viewport)', () => {
    const small = [[200, 200, 400, 200, 400, 400, 200, 400]];
    const rings = clipRingsToScreen(small, { x: 300, y: 300, zoom: 1e10 }, 1000, 1000);
    expect(rings.length).toBeGreaterThan(0);
    let maxAbs = 0;
    for (const ring of rings) for (const v of ring) maxAbs = Math.max(maxAbs, Math.abs(v));
    expect(maxAbs).toBeLessThan(1e5);
  });

  it('returns nothing when the stroke is far off-screen', () => {
    const rings = clipRingsToScreen([[0, 0, 10, 0, 10, 10, 0, 10]], camera, 1000, 1000);
    expect(rings).toEqual([]);
  });
});
