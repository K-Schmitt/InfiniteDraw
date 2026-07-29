import { ringArea } from './projectRings';
import { pointInRings } from './hitTest';

/** A visible stroke with its rings already projected into the camera frame. */
export interface FillCandidate {
  readonly id: string;
  /** True for paint-bucket background fills — paint, not a wall. */
  readonly isBackground: boolean;
  readonly frameRings: number[][];
}

export type FillDecision =
  | { kind: 'fill'; rings: number[][] }
  | { kind: 'recolorRegion'; fillId: string }
  | { kind: 'recolorStroke'; strokeId: string }
  | { kind: 'none' };

/**
 * Area ratio above which a freshly computed region counts as "the same region" as an existing
 * background fill under the seed — a repeat click then recolors that fill instead of stacking a
 * duplicate polygon on top of it.
 */
const SAME_REGION_RATIO = 0.98;

/**
 * What a paint-bucket click targets.
 *
 * Precedence is region-first, deliberately. The previous order asked "is a stroke under the
 * cursor?" before "is the cursor inside an enclosed region?", so once shape A had been filled,
 * A's own background fill covered every later click inside it — including clicks inside a
 * smaller shape B drawn on top — and B could never be filled. Enclosure is the more specific
 * answer, so it wins; a direct stroke hit is only the fallback for an open area.
 */
export function decideFill(
  seed: { readonly x: number; readonly y: number },
  region: number[][] | null,
  candidates: readonly FillCandidate[],
): FillDecision {
  if (region) {
    const existing = matchingBackgroundFill(seed, region, candidates);
    return existing ? { kind: 'recolorRegion', fillId: existing } : { kind: 'fill', rings: region };
  }
  const hit = smallestUnder(seed, candidates);
  return hit ? { kind: 'recolorStroke', strokeId: hit } : { kind: 'none' };
}

/** Id of a background fill that covers the seed and already occupies (essentially) this region. */
function matchingBackgroundFill(
  seed: { readonly x: number; readonly y: number },
  region: readonly number[][],
  candidates: readonly FillCandidate[],
): string | null {
  const target = ringArea(region[0] ?? []);
  if (!(target > 0)) return null;
  for (const c of candidates) {
    if (!c.isBackground || !pointInRings(seed.x, seed.y, c.frameRings)) continue;
    const ratio = ringArea(c.frameRings[0] ?? []) / target;
    if (ratio >= SAME_REGION_RATIO && ratio <= 1 / SAME_REGION_RATIO) return c.id;
  }
  return null;
}

/** Id of the smallest-area candidate whose painted area covers the seed. */
function smallestUnder(
  seed: { readonly x: number; readonly y: number },
  candidates: readonly FillCandidate[],
): string | null {
  let best: string | null = null;
  let bestArea = Infinity;
  for (const c of candidates) {
    if (!pointInRings(seed.x, seed.y, c.frameRings)) continue;
    const area = ringArea(c.frameRings[0] ?? []);
    if (area < bestArea) {
      bestArea = area;
      best = c.id;
    }
  }
  return best;
}
