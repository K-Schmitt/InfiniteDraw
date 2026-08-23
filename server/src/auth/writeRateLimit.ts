export interface RateLimitConfig {
  capacity: number;
  refillPerSecond: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Token bucket per authenticated userId (spec §4): login is rate-limited upstream but
 * nothing protects stroke events from a flooding account. Generous for humans, hard
 * ceiling for scripts.
 */
export class WriteRateLimit {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly config: RateLimitConfig) {}

  allow(userId: string): boolean {
    const now = Date.now();
    const bucket =
      this.buckets.get(userId) ?? { tokens: this.config.capacity, lastRefill: now };
    const refill = ((now - bucket.lastRefill) / 1000) * this.config.refillPerSecond;
    bucket.tokens = Math.min(this.config.capacity, bucket.tokens + refill);
    bucket.lastRefill = now;
    this.buckets.set(userId, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
}
