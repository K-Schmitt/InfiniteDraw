import { describe, it, expect } from 'vitest';
import { encodeCamera, decodeCamera } from '../cameraPermalink';

const deep = {
  level: -137,
  cell: { x: -98765432109876543210n, y: 12345678901234567890n },
  sub: { x: 1234.5, y: 6789.25 },
};

describe('camera permalink', () => {
  it('round-trips a deep camera exactly, bigints included', () => {
    expect(decodeCamera(encodeCamera(deep))).toEqual(deep);
  });

  it('round-trips the origin', () => {
    const origin = { level: 0, cell: { x: 0n, y: 0n }, sub: { x: 0, y: 0 } };
    expect(decodeCamera(encodeCamera(origin))).toEqual(origin);
  });

  it('tolerates a leading hash', () => {
    expect(decodeCamera(`#${encodeCamera(deep).replace(/^#/, '')}`)).toEqual(deep);
  });

  it('returns null for junk', () => {
    expect(decodeCamera('#nope')).toBeNull();
    expect(decodeCamera('')).toBeNull();
    expect(decodeCamera('#l1.2.3')).toBeNull();
  });

  it('returns null when a cell is not an integer', () => {
    expect(decodeCamera('#l0.1.5.2.0.0')).toBeNull();
  });
});
