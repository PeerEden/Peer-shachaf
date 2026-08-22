import type { RequestHandler } from 'express';
import type { Clock } from './clock.js';
import { HttpError } from './http-error.js';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Small in-memory rate limiter for the auth endpoints (brute-force guard).
 * Keyed by IP; state resets on process restart, which is fine at this scale.
 */
export function rateLimit(clock: Clock, options: { max: number; windowMs: number }): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req, _res, next) => {
    const now = clock.now().getTime();
    const key = req.ip ?? 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (buckets.size > 10_000) {
      // Memory backstop: drop only expired buckets so live counters survive.
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
    }
    if (bucket.count > options.max) {
      next(new HttpError(429, 'RATE_LIMITED', 'יותר מדי ניסיונות — נסו שוב בעוד כמה דקות'));
      return;
    }
    next();
  };
}
