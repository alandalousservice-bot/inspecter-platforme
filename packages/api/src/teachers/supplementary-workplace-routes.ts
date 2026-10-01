import type { Express, RequestHandler } from 'express';
import type { PrismaClient, TeacherSupplementaryWorkplace } from '@prisma/client';
import { z } from 'zod';
import { appendAuditEvent, AuditAction } from '../audit/append.js';
import { ApiError } from '../http/api-error.js';
import { validateBody } from '../http/validate-body.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { calendarDate } from '../intake/submission-schema.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';
import { algiersCalendarDate, periodState } from './supplementary-workplaces-domain.js';

const base = '/api/v1/teachers/:teacherId/supplementary-workplaces';
const paramsSchema = z.object({ teacherId: z.string().uuid(), workplaceId: z.string().uuid().optional() }).strict();
const date = z.string().refine(calendarDate, 'تاريخ غير صالح.');
const createSchema = z.object({
  institutionId: z.string().uuid(), validFrom: date, validTo: date.nullable().optional(),
}).strict();
const patchSchema = z.object({ validFrom: date.optional(), validTo: date.nullable().optional() })
  .strict().refine((value) => Object.keys(value).length > 0, { message: 'يلزم حقل واحد على الأقل.' });
const notFound = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
const conflict = (message = 'يتعارض التعديل مع علاقة مكان العمل الحالية.') => new ApiError(409, 'CONFLICT', message);
const badDate = (field = 'validTo') => new ApiError(400, 'VALIDATION_ERROR', 'تحقق من التواريخ المدخلة.', { [field]: ['يجب أن يكون تاريخ النهاية بعد تاريخ البداية.'] });
const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateText = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

function project(row: TeacherSupplementaryWorkplace & { institution: { id: string; name: string; municipality: string | null; archivedAt: Date | null } }, today: string) {
  const validFrom = dateText(row.validFrom)!;
  const validTo = dateText(row.validTo);
  return {
    id: row.id,
    institution: { id: row.institution.id, name: row.institution.name, municipality: row.institution.municipality, archivedAt: row.institution.archivedAt?.toISOString() ?? null },
    validFrom, validTo, isCurrent: periodState({ validFrom, validTo }, today) === 'CURRENT',
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

function mapConstraintError(error: unknown): never {
  if (error && typeof error === 'object') {
    const prismaError = error as { name?: unknown; code?: unknown; meta?: { database_error?: unknown }; message?: unknown };
    const databaseError = prismaError.meta?.database_error;
    const expectedExclusion = typeof databaseError === 'string'
      && databaseError.includes('TeacherSupplementaryWorkplace_no_overlapping_periods');
    const unknownRequestExclusion = prismaError.name === 'PrismaClientUnknownRequestError'
      && typeof prismaError.message === 'string'
      && prismaError.message.includes('TeacherSupplementaryWorkplace_no_overlapping_periods');
    if ((typeof prismaError.code === 'string' && ['P2002', 'P2003'].includes(prismaError.code))
      || expectedExclusion || unknownRequestExclusion) throw conflict();
  }
  throw error;
}

export function registerTeacherSupplementaryWorkplaceRoutes(app: Express, database: PrismaClient, requireInspector: RequestHandler): void {
  app.use(base, (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); }, requireInspector);

  app.get(base, async (request, response) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { teacherId: ['قيمة غير صالحة.'] });
    const inspectorId = response.locals.inspectorId as string;
    const teacher = await database.teacher.findUnique({ where: { id: params.data.teacherId }, select: { id: true, districtId: true } });
    if (!teacher) throw notFound();
    await requireInspectorDistrictMembership(database, inspectorId, teacher.districtId);
    const today = algiersCalendarDate();
    const rows = await database.teacherSupplementaryWorkplace.findMany({
      where: { teacherId: teacher.id },
      include: { institution: { select: { id: true, name: true, municipality: true, archivedAt: true } } },
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    response.json({ items: rows.map((row) => project(row, today)) });
  });

  app.post(base, validateBody(createSchema), async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { teacherId: ['قيمة غير صالحة.'] });
    const body = request.body as z.infer<typeof createSchema>;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    if (body.validTo != null && body.validTo <= body.validFrom) throw badDate();
    try {
      const row = await database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${params.data.teacherId}::uuid FOR UPDATE`;
        const teacher = await tx.teacher.findUnique({ where: { id: params.data.teacherId }, select: { id: true, districtId: true, institutionId: true } });
        if (!teacher) throw notFound();
        await requireInspectorDistrictMembership(tx, inspectorId, teacher.districtId);
        if (teacher.institutionId === body.institutionId) throw conflict('لا يمكن تسجيل المؤسسة الأم كمؤسسة تكملة نصاب.');
        await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${body.institutionId}::uuid FOR SHARE`;
        const institution = await tx.institution.findUnique({ where: { id: body.institutionId } });
        if (!institution || institution.districtId !== teacher.districtId) throw notFound();
        if (institution.archivedAt) throw conflict('لا يمكن اختيار مؤسسة مؤرشفة.');
        const created = await tx.teacherSupplementaryWorkplace.create({ data: {
          teacherId: teacher.id, institutionId: institution.id, districtId: teacher.districtId,
          validFrom: toDate(body.validFrom), validTo: body.validTo == null ? null : toDate(body.validTo),
        }, include: { institution: { select: { id: true, name: true, municipality: true, archivedAt: true } } } });
        await appendAuditEvent(tx, {
          source: 'HTTP', actorInspectorId: inspectorId, districtId: teacher.districtId,
          action: AuditAction.TEACHER_SUPPLEMENTARY_WORKPLACE_CREATED, entityType: 'TeacherSupplementaryWorkplace',
          entityId: created.id, requestId, metadata: { teacherId: teacher.id, institutionId: institution.id },
        });
        return created;
      });
      response.status(201).json({ data: project(row, algiersCalendarDate()) });
    } catch (error) { mapConstraintError(error); }
  });

  app.patch(`${base}/:workplaceId`, validateBody(patchSchema), async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const params = paramsSchema.safeParse(request.params);
    if (!params.success || !params.data.workplaceId) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { id: ['قيمة غير صالحة.'] });
    const patch = request.body as z.infer<typeof patchSchema>;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    try {
      const row = await database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${params.data.teacherId}::uuid FOR UPDATE`;
        const teacher = await tx.teacher.findUnique({ where: { id: params.data.teacherId }, select: { id: true, districtId: true, institutionId: true } });
        if (!teacher) throw notFound();
        await requireInspectorDistrictMembership(tx, inspectorId, teacher.districtId);
        await tx.$queryRaw`SELECT id FROM "TeacherSupplementaryWorkplace" WHERE id = ${params.data.workplaceId}::uuid FOR UPDATE`;
        const current = await tx.teacherSupplementaryWorkplace.findUnique({ where: { id: params.data.workplaceId }, include: { institution: { select: { id: true, name: true, municipality: true, archivedAt: true } } } });
        if (!current || current.teacherId !== teacher.id || current.districtId !== teacher.districtId) throw notFound();
        if (current.institutionId === teacher.institutionId) throw conflict('لا يمكن تصحيح رابط المؤسسة الأم كمؤسسة تكملة نصاب.');
        const from = patch.validFrom ?? dateText(current.validFrom)!;
        const to = patch.validTo === undefined ? dateText(current.validTo) : patch.validTo;
        if (to !== null && to <= from) throw badDate(patch.validTo !== undefined ? 'validTo' : 'validFrom');
        const changedFields: Array<'validFrom' | 'validTo'> = [];
        if (patch.validFrom !== undefined && from !== dateText(current.validFrom)) changedFields.push('validFrom');
        if (patch.validTo !== undefined && to !== dateText(current.validTo)) changedFields.push('validTo');
        changedFields.sort();
        if (!changedFields.length) return current;
        const updated = await tx.teacherSupplementaryWorkplace.update({ where: { id: current.id }, data: {
          ...(changedFields.includes('validFrom') ? { validFrom: toDate(from) } : {}),
          ...(changedFields.includes('validTo') ? { validTo: to === null ? null : toDate(to) } : {}),
        }, include: { institution: { select: { id: true, name: true, municipality: true, archivedAt: true } } } });
        const closed = current.validTo === null && to !== null;
        await appendAuditEvent(tx, {
          source: 'HTTP', actorInspectorId: inspectorId, districtId: teacher.districtId,
          action: closed ? AuditAction.TEACHER_SUPPLEMENTARY_WORKPLACE_CLOSED : AuditAction.TEACHER_SUPPLEMENTARY_WORKPLACE_UPDATED,
          entityType: 'TeacherSupplementaryWorkplace', entityId: current.id, requestId,
          metadata: closed ? { teacherId: teacher.id, institutionId: current.institutionId } : { teacherId: teacher.id, institutionId: current.institutionId, changedFields },
        });
        return updated;
      });
      response.json({ data: project(row, algiersCalendarDate()) });
    } catch (error) { mapConstraintError(error); }
  });
}
