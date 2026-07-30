import { it, expect } from 'vitest';
import { toLocalWidth, toScreenWidth } from '../strokeWidth';

it('round-trips width across a zoom change (constant on-screen thickness)', () => {
  const local = toLocalWidth(8, 4); // drawn at scale 4
  expect(toScreenWidth(local, 4)).toBeCloseTo(8, 9); // same zoom → same px
  expect(toScreenWidth(local, 8)).toBeCloseTo(16, 9); // 2× zoom → 2× px
});
