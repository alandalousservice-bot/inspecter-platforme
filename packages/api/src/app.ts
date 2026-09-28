import express, { type Express } from 'express';
import { errorHandler } from './http/error-handler.js';
import { ApiError } from './http/api-error.js';
import { requestIdMiddleware } from './http/request-id.js';

export type RouteRegistrar = (app: Express) => void;

export function createApp(registerRoutes?: RouteRegistrar): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: '32kb' }));

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
