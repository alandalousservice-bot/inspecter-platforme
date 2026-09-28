import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ApiError, type ApiFieldErrors } from './api-error.js';

export function validateBody<Schema extends ZodType>(schema: Schema): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      const fields = result.error.issues.reduce<ApiFieldErrors>((errors, issue) => {
        const field = issue.path.length > 0 ? issue.path.join('.') : '_form';
        (errors[field] ??= []).push('قيمة غير صالحة.');
        return errors;
      }, {});
      next(new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', fields));
      return;
    }

    request.body = result.data;
    next();
  };
}
