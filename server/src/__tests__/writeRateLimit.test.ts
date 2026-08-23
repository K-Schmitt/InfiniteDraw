import { describe, it, expect, vi, afterEach } from 'vitest';
import { WriteRateLimit } from '../auth/writeRateLimit.js';

afterEach(() => vi.useRealTimers());

describe('WriteRateLimit', () => {
  it('allows bursts up to capacity then blocks', () => {
    vi.useFakeTimers();
    const limit = new WriteRateLimit({ capacity: 3, refillPerSecond: 1 });
    expect(limit.allow('u1')).toBe(true);
    expect(limit.allow('u1')).toBe(true);
    expect(limit.allow('u1')).toBe(true);
    expect(limit.allow('u1')).toBe(false);
  });

  it('refills over time', () => {
    vi.useFakeTimers();
    const limit = new WriteRateLimit({ capacity: 2, refillPerSecond: 2 });
    limit.allow('u1');
    limit.allow('u1');
    expect(limit.allow('u1')).toBe(false);
    vi.advanceTimersByTime(600);
    expect(limit.allow('u1')).toBe(true);
  });

  it('tracks users independently', () => {
    vi.useFakeTimers();
    const limit = new WriteRateLimit({ capacity: 1, refillPerSecond: 1 });
    expect(limit.allow('u1')).toBe(true);
    expect(limit.allow('u2')).toBe(true);
    expect(limit.allow('u1')).toBe(false);
  });
});
