import { isIP } from 'node:net';
import type { Request, RequestHandler } from 'express';
import { ApiError } from '../http/api-error.js';

export const PUBLIC_SUBMISSION_LIMIT = 10;
export const PUBLIC_SUBMISSION_WINDOW_MS = 15 * 60 * 1000;

export function resolvePublicClientIp(
  request: Pick<Request, 'socket' | 'headers'>,
  environment: NodeJS.ProcessEnv = process.env,
): string | null {
  if (environment.NODE_ENV === 'production') {
    if (environment.TRUSTED_CLIENT_IP_SOURCE !== 'cloudflare') return null;
    const header = request.headers['cf-connecting-ip'];
    if (typeof header !== 'string' || header.includes(',')) return null;
    const clientIp = header.trim();
    return isIP(clientIp) ? clientIp : null;
  }

  const socketIp = request.socket.remoteAddress;
  return socketIp && isIP(socketIp) ? socketIp : null;
}

export function createPublicSubmissionRateLimiter(options: {
  limit?: number;
  windowMs?: number;
  now?: () => number;
  resolveClientIp?: (request: Request) => string | null;
} = {}): RequestHandler {
  const limit = options.limit ?? PUBLIC_SUBMISSION_LIMIT;
  const windowMs = options.windowMs ?? PUBLIC_SUBMISSION_WINDOW_MS;
  const now = options.now ?? Date.now;
  const resolveIp = options.resolveClientIp ?? ((request) => resolvePublicClientIp(request));
  const attemptsByIp = new Map<string, number[]>();
  let operations = 0;

  return (request, response, next) => {
    if (request.method !== 'POST'
      || !/^\/api\/v1\/public\/districts\/[^/]+\/submissions\/?$/u.test(request.path)) {
      next();
      return;
    }

    const clientIp = resolveIp(request);
    if (!clientIp || !isIP(clientIp)) {
      next(new ApiError(503, 'INTERNAL_ERROR', 'تعذر معالجة الطلب مؤقتًا.'));
      return;
    }

    const timestamp = now();
    const cutoff = timestamp - windowMs;
    const attempts = (attemptsByIp.get(clientIp) ?? []).filter((attempt) => attempt > cutoff);
    if (attempts.length >= limit) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((attempts[0] + windowMs - timestamp) / 1000))));
      next(new ApiError(429, 'RATE_LIMITED', 'تجاوزت الحد المسموح للمحاولات.'));
      return;
    }

    attempts.push(timestamp);
    attemptsByIp.set(clientIp, attempts);
    operations += 1;
    if (operations % 256 === 0) {
      for (const [ip, bucket] of attemptsByIp) {
        if (!bucket.some((attempt) => attempt > cutoff)) attemptsByIp.delete(ip);
      }
    }
    next();
  };
}
