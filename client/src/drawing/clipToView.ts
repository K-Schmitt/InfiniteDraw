import polygonClipping from 'polygon-clipping';
import type { Camera } from '@shared/camera';
import { frameForRings, mapPair, unmapPair, ringToPairs, type Pair } from './polyScale';

/**
 * Clips a stroke's rings to the (margin-padded) world viewport, then projects to screen
 * space. For strokes that span an enormous world extent, baking geometry relative to a
 * far anchor loses float32 precision; clipping first keeps only a handful of near-viewport
 * vertices, and subtracting the camera makes the coordinates small and precise.
 * Returns flat screen-space rings (already projected), or [] if nothing is visible.
 */
export function clipRingsToScreen(
  rings: readonly number[][],
  camera: Camera,
  screenW: number,
  screenH: number,
): number[][] {
  const viewW = screenW / camera.zoom;
  const viewH = screenH / camera.zoom;
  const rect: Pair[] = [
    [camera.x - viewW, camera.y - viewH],
    [camera.x + 2 * viewW, camera.y - viewH],
    [camera.x + 2 * viewW, camera.y + 2 * viewH],
    [camera.x - viewW, camera.y + 2 * viewH],
  ];
  const polys = rings.map(ringToPairs);
  const frame = frameForRings([...polys, rect]);
  if (!frame) return [];

  const ringsMapped = polys.map((r) => r.map((p) => mapPair(p, frame)));
  const rectMapped = [rect.map((p) => mapPair(p, frame))];
  let clipped;
  try {
    clipped = polygonClipping.intersection(ringsMapped, rectMapped);
  } catch {
    return [];
  }
  return projectClipped(clipped, frame, camera);
}

// well beyond any real viewport — coordinates larger than this are float precision garbage
const SCREEN_SANITY = 1e7;

function projectClipped(clipped: Pair[][][], frame: Parameters<typeof unmapPair>[1], camera: Camera): number[][] {
  const out: number[][] = [];
  for (const poly of clipped) {
    for (const ring of poly) {
      const flat: number[] = [];
      let sane = true;
      for (const p of ring) {
        const [wx, wy] = unmapPair(p, frame);
        const sx = (wx - camera.x) * camera.zoom;
        const sy = (wy - camera.y) * camera.zoom;
        if (!Number.isFinite(sx) || !Number.isFinite(sy) || Math.abs(sx) > SCREEN_SANITY || Math.abs(sy) > SCREEN_SANITY) {
          sane = false;
          break;
        }
        flat.push(sx, sy);
      }
      if (sane && flat.length >= 6) out.push(flat);
    }
  }
  return out;
}
