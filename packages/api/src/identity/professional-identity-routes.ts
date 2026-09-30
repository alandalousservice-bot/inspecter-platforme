import type { Express, RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { appendAuditEvent, AuditAction } from '../audit/append.js';
import { validateBody } from '../http/validate-body.js';
import { requireAuthenticatedMutationCsrf } from './auth-routes.js';

const professionalName = z.string().transform((raw, context) => {
  if (/[\p{Cc}]/u.test(raw)) context.addIssue({ code: 'custom', message: 'قيمة غير صالحة.' });
  const value = raw.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (Array.from(value).length < 1 || Array.from(value).length > 100) {
    context.addIssue({ code: 'custom', message: 'قيمة غير صالحة.' });
  }
  return value;
});

const identitySchema = z.object({ name: professionalName, surname: professionalName }).strict();

export function registerProfessionalIdentityRoutes(
  app: Express,
  database: PrismaClient,
  requireInspector: RequestHandler,
): void {
  const path = '/api/v1/me/professional-identity';
  app.use(path, (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });

  app.get(path, requireInspector, async (_request, response) => {
    const inspector = await database.inspector.findUniqueOrThrow({
      where: { id: response.locals.inspectorId as string },
      select: { name: true, surname: true },
    });
    response.json({ data: inspector });
  });

  app.put(path, requireInspector, validateBody(identitySchema), async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    const nextIdentity = request.body as z.infer<typeof identitySchema>;
    const result = await database.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Inspector" WHERE id = ${inspectorId}::uuid FOR UPDATE`;
      const current = await tx.inspector.findUniqueOrThrow({ where: { id: inspectorId }, select: { name: true, surname: true } });
      const changedFields = (['name', 'surname'] as const).filter((field) => current[field] !== nextIdentity[field]);
      if (changedFields.length === 0) return current;
      const updated = await tx.inspector.update({ where: { id: inspectorId }, data: nextIdentity, select: { name: true, surname: true } });
      await appendAuditEvent(tx, {
        source: 'HTTP', actorInspectorId: inspectorId, districtId: null,
        action: AuditAction.INSPECTOR_PROFESSIONAL_IDENTITY_UPDATED,
        entityType: 'Inspector', entityId: inspectorId, requestId,
        metadata: { changedFields },
      });
      return updated;
    });
    response.json({ data: result });
  });
}
