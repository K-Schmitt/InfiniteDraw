export type Pair = [number, number];

export interface Frame {
  ox: number;
  oy: number;
  k: number;
}

/**
 * polygon-clipping degrades when coordinates are very large or very small (extreme
 * zoom). Map rings into a ~[0,1000] frame, run the boolean op, then map back — same
 * conditioning trick used for perfect-freehand.
 */
export function frameForRings(rings: readonly Pair[][]): Frame | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const ext = Math.max(maxX - minX, maxY - minY);
  if (!isFinite(ext) || ext <= 0) return null;
  return { ox: minX, oy: minY, k: 1000 / ext };
}

export function mapPair([x, y]: Pair, f: Frame): Pair {
  return [(x - f.ox) * f.k, (y - f.oy) * f.k];
}

export function unmapPair([x, y]: Pair, f: Frame): Pair {
  return [x / f.k + f.ox, y / f.k + f.oy];
}

export function ringToPairs(flat: readonly number[]): Pair[] {
  const out: Pair[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i]!, flat[i + 1]!]);
  return out;
}
