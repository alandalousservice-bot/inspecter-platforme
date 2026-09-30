import express, { type Express, type RequestHandler } from 'express';
import { errorHandler } from './http/error-handler.js';
import { ApiError } from './http/api-error.js';
import { requestIdMiddleware } from './http/request-id.js';
import { createPublicSubmissionRateLimiter } from './intake/rate-limit.js';

export type RouteRegistrar = (app: Express) => void;

export function createApp(
  registerRoutes?: RouteRegistrar,
  options: { publicSubmissionRateLimiter?: RequestHandler } = {},
): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(options.publicSubmissionRateLimiter ?? createPublicSubmissionRateLimiter());
  app.use(express.json({ limit: '32kb', verify: (request, _response, buffer) => {
    const requestUrl = request.url ?? '';
    if (/^\/api\/v1\/visits\/[^/]+\/report(?:\?|$)/u.test(requestUrl)
      || /^\/api\/v1\/reports\/[^/]+\/finalize(?:\?|$)/u.test(requestUrl)) {
      (request as typeof request & { rawBody?: string }).rawBody = buffer.toString('utf8');
    }
  } }));

  app.get('/api/v1/health', (_request, response) => {
    response.json({ data: { status: 'ok' } });
  });

  registerRoutes?.(app);

  app.use((_request, _response, next) => {
    next(new ApiError(404, 'NOT_FOUND', 'المسار غير موجود.'));
  });
  app.use(errorHandler);

  return app;
}
