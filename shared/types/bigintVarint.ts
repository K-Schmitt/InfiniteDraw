/** zigzag maps signed → unsigned so small magnitudes stay short. */
function zigzag(v: bigint): bigint {
  return v >= 0n ? v << 1n : (-v << 1n) - 1n;
}
function unzigzag(v: bigint): bigint {
  return (v & 1n) === 0n ? v >> 1n : -((v + 1n) >> 1n);
}

// Uint8Array (not Node Buffer) so this shared codec type-checks in the browser client too;
// a Node Buffer is a Uint8Array, so server callers pass one through unchanged.
export function writeVarBigInt(v: bigint): Uint8Array {
  let n = zigzag(v);
  const bytes: number[] = [];
  do {
    let b = Number(n & 0x7fn);
    n >>= 7n;
    if (n > 0n) b |= 0x80;
    bytes.push(b);
  } while (n > 0n);
  return Uint8Array.from(bytes);
}

export function readVarBigInt(
  buf: Uint8Array,
  offset: number,
  maxBytes = 10,
): { value: bigint; next: number } {
  let result = 0n;
  let shift = 0n;
  for (let i = 0; i < maxBytes; i++) {
    if (offset + i >= buf.length) throw new Error('varint truncated');
    const b = buf[offset + i]!;
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: unzigzag(result), next: offset + i + 1 };
    shift += 7n;
  }
  throw new Error('varint too long');
}
