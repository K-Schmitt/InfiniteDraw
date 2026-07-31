import { decideFill, type FillCandidate, type FillDecision } from '../fillDecision';
import { selectFillWalls } from '../fillWalls';
import { pointInRings } from '../hitTest';
import { ringArea } from '../projectRings';

/** Floods the region around the seed for a given wall set. Null when nothing encloses the seed. */
export type RegionResolver = (walls: number[][][]) => number[][] | null;

export interface FillTargetInput {
  readonly seed: { readonly x: number; readonly y: number };
  /** Every visible stroke, rings already projected into the camera frame. */
  readonly candidates: readonly FillCandidate[];
  readonly regionFor: RegionResolver;
}

/**
 * What one paint-bucket click targets: the enclosed region under it, an existing fill occupying
 * that region, or the stroke it landed on.
 *
 * Region-first (see `decideFill`), with one second chance: a click that lands on ink gets the
 * flood retried without the ink that swallowed it — see `regionInsideInk`.
 */
export function resolveFillTarget(input: FillTargetInput): FillDecision {
  const region = input.regionFor(wallsOf(input.candidates));
  const decision = decideFill(input.seed, region, input.candidates);
  if (decision.kind !== 'recolorStroke') return decision;
  const inner = regionInsideInk(input);
  return inner ? decideFill(input.seed, inner, input.candidates) : decision;
}

/**
 * Second chance for a click that landed on ink.
 *
 * Zooming into a thick contour puts the whole viewport inside that one stroke's ink: every mask
 * pixel is opaque, the flood cannot even start, and the bucket falls back to recoloring the
 * contour. A shape drawn *inside* the contour could then never be filled — clicking in it
 * repainted the entire parent outline instead. Dropping the strokes whose ink covers the seed from
 * the wall set lets the flood run and find the shape that really encloses the click.
 *
 * The retry only wins when it is the tighter answer, i.e. covers less than the ink it would
 * otherwise recolor. Without that guard, clicking a line drawn inside a closed shape would fill
 * the shape instead of recoloring the line — the whole point of the `recolorStroke` fallback.
 */
function regionInsideInk(input: FillTargetInput): number[][] | null {
  const ink = input.candidates.filter(
    (c) => !c.isBackground && pointInRings(input.seed.x, input.seed.y, c.frameRings),
  );
  if (ink.length === 0) return null;
  const covering = new Set(ink.map((c) => c.id));
  const region = input.regionFor(wallsOf(input.candidates, covering));
  if (!region) return null;
  const tightestInk = Math.min(...ink.map((c) => paintedArea(c.frameRings)));
  return paintedArea(region) < tightestInk ? region : null;
}

function wallsOf(
  candidates: readonly FillCandidate[],
  excluded?: ReadonlySet<string>,
): number[][][] {
  const kept = excluded ? candidates.filter((c) => !excluded.has(c.id)) : candidates;
  return selectFillWalls(
    kept.map((c) => ({ stroke: { background: c.isBackground }, rings: c.frameRings })),
  );
}

/** Area a ring set actually covers: its outer ring minus its holes. */
function paintedArea(rings: readonly number[][]): number {
  const [outer, ...holes] = rings;
  if (!outer) return 0;
  return holes.reduce((area, hole) => area - ringArea(hole), ringArea(outer));
}
