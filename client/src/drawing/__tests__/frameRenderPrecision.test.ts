import { describe, it, expect } from 'vitest';
import { projectToFrame, CULLED, type ProjCamera } from '../../coords/viewProject';
import { anchorScaleOf } from '../../coords/viewScale';
import { originAnchor } from '@shared/anchor';

// F2 bug 1: at deep zoom a coarse-anchored stroke was placed by scaling anchor-local geometry —
// gfx.scale ≈ 2^gap, gfx.position ≈ -origin·2^gap. The GPU applies that transform in float32, so
// `vertex·scale + position` cancels two ~2^(gap+16) terms and the on-screen result loses whole
// pixels: the stroke jitters off-screen (the flicker) between ~10^8 and ~10^13. The fix projects
// each vertex to frame coords (float64, small magnitudes) so the GPU only multiplies by ~2^frac.
const f32 = Math.fround;

// A stroke drawn at zoom 1 near the origin: anchor at level 0, a vertex at frame (413, 297).
const ANCHOR = originAnchor();
const VX = 413;
const VY = 297;

// Camera zoomed in to `level`, positioned so the vertex sits at a nonzero on-screen frame coord
// (~ON_SCREEN local units) — the realistic case where the huge origin offset must cancel the huge
// vertex·scale term, and float32 can't. Placing it at exactly frame 0 would cancel too cleanly.
const ON_SCREEN = 400;
function cameraAt(level: number): ProjCamera {
  // absolute level-local position of the vertex, minus the on-screen offset we want it to land at.
  const atLevel = (BigInt(VX) << BigInt(level)) - BigInt(ON_SCREEN);
  const cellX = atLevel / 65536n;
  const subX = Number(atLevel % 65536n);
  return { level, cell: { x: cellX, y: cellX }, sub: { x: subX, y: subX } };
}

describe('frame-coord placement keeps deep-zoom strokes sub-pixel in float32', () => {
  it('legacy scale+offset transform loses pixels in float32; frame coords do not', () => {
    const frameScale = 2 ** 0.3; // arbitrary sub-level zoom (frac = 0.3)
    let sawLegacyBreak = false;

    for (let level = 20; level <= 40; level += 1) {
      const camera = cameraAt(level);
      const proj = projectToFrame(ANCHOR, VX, VY, camera);
      if (proj === CULLED) continue;
      const truthScreenX = proj.fx * frameScale; // float64 truth

      // Old path: geometry in anchor-local coords, scaled + offset by the huge transform.
      const scale = anchorScaleOf(frameScale, camera.level, ANCHOR.level);
      const origin = projectToFrame(ANCHOR, 0, 0, camera);
      if (origin !== CULLED) {
        const posX = origin.fx * frameScale;
        const legacyF32 = f32(f32(VX * f32(scale)) + f32(posX));
        if (Math.abs(legacyF32 - truthScreenX) > 1) sawLegacyBreak = true;
      }

      // New path: vertex already in frame coords, GPU only multiplies by frameScale.
      const frameF32 = f32(f32(proj.fx) * f32(frameScale));
      expect(Math.abs(frameF32 - truthScreenX)).toBeLessThan(0.5);
    }

    // Sanity: the scenario really does break the old transform somewhere in this range.
    expect(sawLegacyBreak).toBe(true);
  });
});
