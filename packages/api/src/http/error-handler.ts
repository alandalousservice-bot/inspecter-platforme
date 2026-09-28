import type { ErrorRequestHandler } from 'express';
import { ApiError } from './api-error.js';

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  void _next;
  const requestId = response.locals.requestId as string;

  if (error instanceof ApiError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
        requestId,
      },
    });
    return;
  }

  const parserError = error as { type?: unknown; status?: unknown };
  if (parserError?.type === 'entity.parse.failed' || parserError?.status === 413) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'تعذر قراءة البيانات المرسلة.',
        requestId,
      },
    });
    return;
  }

  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'حدث خطأ داخلي.',
      requestId,
    },
  });
};

export { errorHandler };
