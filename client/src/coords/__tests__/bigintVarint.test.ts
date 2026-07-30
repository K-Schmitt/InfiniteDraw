import { describe, it, expect } from 'vitest';
import { writeVarBigInt, readVarBigInt } from '@shared/bigintVarint';

describe('bigintVarint', () => {
  it('round-trips positives and negatives incl. large', () => {
    for (const v of [0n, 1n, -1n, 127n, -128n, 2n ** 60n, -(2n ** 60n)]) {
      const buf = writeVarBigInt(v);
      const { value, next } = readVarBigInt(buf, 0);
      expect(value).toBe(v);
      expect(next).toBe(buf.length);
    }
  });

  it('rejects an over-long varint (anti-DoS)', () => {
    const evil = new Uint8Array(20).fill(0x80); // MSB=1 repeated, never terminates
    expect(() => readVarBigInt(evil, 0)).toThrow('varint too long');
  });

  it('rejects a truncated varint (no OOB read)', () => {
    const truncated = new Uint8Array([0x80, 0x80]); // MSB=1 then buffer ends
    expect(() => readVarBigInt(truncated, 0)).toThrow('varint truncated');
  });
});
