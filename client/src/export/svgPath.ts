/** Minimum vertices for a ring to enclose area (3 points = 6 numbers). */
const MIN_RING_LENGTH = 6;

/**
 * Flat rings → an SVG `d` attribute. The first ring is the outer contour and the rest are holes;
 * they are emitted as further closed subpaths, which `fill-rule="evenodd"` renders as holes —
 * the same even-odd convention `pointInRings` uses for hit-testing, so a click and an exported
 * shape agree on what is "inside". The on-screen Pixi fill instead uses single-level geometric
 * containment (`GraphicsPath` signed mode) — it agrees with even-odd for one outer ring plus
 * holes, the only shape this app's tools currently produce, but is not the same algorithm in
 * general.
 */
export function ringsToPathData(rings: readonly number[][], precision: number): string {
  let out = '';
  for (const ring of rings) {
    if (ring.length < MIN_RING_LENGTH) continue;
    out += subpath(ring, precision);
  }
  return out;
}

function subpath(ring: readonly number[], precision: number): string {
  let out = `M${num(ring[0]!, precision)} ${num(ring[1]!, precision)}`;
  for (let i = 2; i < ring.length; i += 2) {
    out += `L${num(ring[i]!, precision)} ${num(ring[i + 1]!, precision)}`;
  }
  return `${out}Z`;
}

/** Fixed-precision number with trailing zeros stripped — halves the file size on real drawings. */
function num(value: number, precision: number): string {
  return Number(value.toFixed(precision)).toString();
}
