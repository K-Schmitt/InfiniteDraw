import { describe, it, expect } from 'vitest';
import { HierCamera } from '../HierCamera';

describe('HierCamera.restore', () => {
  it('round-trips a deep position through projCamera', () => {
    const camera = new HierCamera();
    const target = {
      level: -137,
      cell: { x: -98765432109876543210n, y: 12345678901234567890n },
      sub: { x: 1234.5, y: 6789.25 },
    };
    camera.restore(target);
    const result = camera.projCamera;
    expect(result.level).toBe(target.level);
    expect(result.cell).toEqual(target.cell);
    expect(Math.abs(result.sub.x - target.sub.x)).toBeLessThan(1e-6);
    expect(Math.abs(result.sub.y - target.sub.y)).toBeLessThan(1e-6);
  });
});
