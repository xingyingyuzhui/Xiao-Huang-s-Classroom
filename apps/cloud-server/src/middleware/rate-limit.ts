import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@xiaohuang/domain-core';

type Counter = { count: number; windowStart: number };

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyFn: (req: Request) => string;
};

export function clientIp(req: Request): string {
  const trustProxy = Boolean(req.app.get('trust proxy'));
  if (trustProxy) {
    const forwarded = req.header('x-forwarded-for');
    const first = forwarded?.split(',')[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  return (req.ip || req.socket.remoteAddress || 'unknown').slice(0, 128);
}

export function createRateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Counter>();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart >= options.windowMs) buckets.delete(key);
    }
  }, Math.min(options.windowMs, 60_000));
  timer.unref?.();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = options.keyFn(req);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart >= options.windowMs) {
      bucket = { count: 0, windowStart: now };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      next(new AppError('AUTH_RATE_LIMITED', '尝试过多，请稍后再试'));
      return;
    }
    next();
  };
}

export function loginRateLimit() {
  return createRateLimit({
    windowMs: 15 * 60_000,
    max: 10,
    keyFn: (req) => {
      const username =
        req.body && typeof req.body === 'object' && 'username' in req.body
          ? String((req.body as { username?: unknown }).username ?? '')
              .trim()
              .toLowerCase()
              .slice(0, 64)
          : '';
      return `login:${clientIp(req)}:${username || '-'}`;
    },
  });
}

export function refreshRateLimit() {
  return createRateLimit({
    windowMs: 5 * 60_000,
    max: 60,
    keyFn: (req) => `refresh:${clientIp(req)}`,
  });
}

export function registerRateLimit() {
  return createRateLimit({
    windowMs: 15 * 60_000,
    max: 5,
    keyFn: (req) => `register:${clientIp(req)}`,
  });
}
