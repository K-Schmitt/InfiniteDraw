/** mantissa * 2^exp, underflowing cleanly to 0 (never NaN) for large negative exp. */
export function ldexp(mantissa: number, exp: number): number {
  return mantissa * 2 ** exp;
}

export function absBig(v: bigint): bigint {
  return v < 0n ? -v : v;
}
