import { clipFrameRingsToView, type FrameBox } from '../clipFrameRings';

export interface WallPrepView {
  /** Padded mask coverage in camera-frame units (`maskFrameBox`). */
  readonly box: FrameBox;
  /** Screen pixels per camera-frame unit. */
  readonly frameScale: number;
  /** Max on-screen span (px) a wall may cover before float32 vertex storage displaces it. */
  readonly maxScreenSpanPx: number;
}

/**
 * Span-guards the walls about to be PAINTED into the mask. The render path refuses to bake frame
 * geometry past its float32 limit and clips to the view instead; the mask pipeline is the same
 * float32 GPU path, so an unclipped oversized wall lands tens of pixels away from the ink the
 * user sees (S1/S2/S3 at deep zoom). Output is index-aligned with the input — the mask encodes
 * wall indices as colours, and `resolveFill` maps them back into the ORIGINAL ring array.
 *
 * Only the painted copy is clipped: the exact stage must keep the original rings, because
 * clipped walls would fabricate edges at the clip boundary.
 */
export function prepareMaskWalls(
  walls: readonly number[][][],
  view: WallPrepView,
): number[][][] {
  return walls.map((rings) => guardWall(rings, view));
}

function guardWall(rings: number[][], view: WallPrepView): number[][] {
  if (wallSpan(rings) * view.frameScale <= view.maxScreenSpanPx) return rings;
  const clipped = clipFrameRingsToView(rings, view.box);
  // Clip failure: paint the wall unclipped, best-effort — same behaviour as before the guard.
  return clipped ?? rings;
}

/** Larger dimension of the wall's frame bbox across all its rings. */
function wallSpan(rings: readonly number[][]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i]!);
      maxX = Math.max(maxX, ring[i]!);
      minY = Math.min(minY, ring[i + 1]!);
      maxY = Math.max(maxY, ring[i + 1]!);
    }
  }
  return Math.max(maxX - minX, maxY - minY);
}
