import { describe, it, expect } from 'vitest';
import { ldexp, absBig } from '../ldexp';

describe('ldexp', () => {
  it('scales by a power of two', () => {
    expect(ldexp(3, 4)).toBe(48);
    expect(ldexp(1024, -10)).toBe(1);
  });
  it('underflows huge negative exponents to 0 without NaN', () => {
    expect(ldexp(65536, -2000)).toBe(0);
    expect(Number.isNaN(ldexp(65536, -2000))).toBe(false);
  });
});

describe('absBig', () => {
  it('returns magnitude of a bigint', () => {
    expect(absBig(-5n)).toBe(5n);
    expect(absBig(5n)).toBe(5n);
  });
});
