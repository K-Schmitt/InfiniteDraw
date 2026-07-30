import { describe, it, expect } from 'vitest';
import { ringsToPathData } from '../svgPath';

describe('ringsToPathData', () => {
  it('emits one closed subpath per ring', () => {
    const outer = [0, 0, 10, 0, 10, 10, 0, 10];
    expect(ringsToPathData([outer], 2)).toBe('M0 0L10 0L10 10L0 10Z');
  });

  it('appends holes as further subpaths', () => {
    const outer = [0, 0, 10, 0, 10, 10, 0, 10];
    const hole = [2, 2, 4, 2, 4, 4, 2, 4];
    expect(ringsToPathData([outer, hole], 2))
      .toBe('M0 0L10 0L10 10L0 10ZM2 2L4 2L4 4L2 4Z');
  });

  it('rounds to the requested precision and strips trailing zeros', () => {
    expect(ringsToPathData([[0, 0, 1.23456, 0, 1, 1]], 2)).toBe('M0 0L1.23 0L1 1Z');
  });

  it('skips degenerate rings', () => {
    expect(ringsToPathData([[0, 0, 1, 1]], 2)).toBe('');
  });

  it('returns an empty string for no rings', () => {
    expect(ringsToPathData([], 2)).toBe('');
  });
});
