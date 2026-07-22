/** zigzag maps signed → unsigned so small magnitudes stay short. */
function zigzag(v: bigint): bigint {
  return v >= 0n ? v << 1n : (-v << 1n) - 1n;
}
function unzigzag(v: bigint): bigint {
  return (v & 1n) === 0n ? v >> 1n : -((v + 1n) >> 1n);
}

export function writeVarBigInt(v: bigint): Buffer {
  let n = zigzag(v);
  const bytes: number[] = [];
  do {
    let b = Number(n & 0x7fn);
    n >>= 7n;
    if (n > 0n) b |= 0x80;
    bytes.push(b);
  } while (n > 0n);
  return Buffer.from(bytes);
}

export function readVarBigInt(
  buf: Buffer,
  offset: number,
  maxBytes = 10,
): { value: bigint; next: number } {
  let result = 0n;
  let shift = 0n;
  for (let i = 0; i < maxBytes; i++) {
    const b = buf.readUInt8(offset + i);
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: unzigzag(result), next: offset + i + 1 };
    shift += 7n;
  }
  throw new Error('varint too long');
}
