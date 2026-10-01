import type { Express, RequestHandler } from 'express';
import { Prisma, type PrismaClient, type TeacherQualification } from '@prisma/client';
import { z } from 'zod';
import { appendAuditEvent, AuditAction } from '../audit/append.js';
import { ApiError } from '../http/api-error.js';
import { validateBody } from '../http/validate-body.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { calendarDate } from '../intake/submission-schema.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';

const controls = /[\p{Cc}]/u;
function qualificationText(maximum: number) {
  return z.string().transform((raw, context) => {
    const invalidControl = [...raw].some((character) => controls.test(character));
    const value = raw.normalize('NFC').trim().replace(/\s+/gu, ' ');
    if (invalidControl || Array.from(value).length < 1 || Array.from(value).length > maximum) {
      context.addIssue({ code: 'custom', message: 'قيمة غير صالحة.' });
    }
    return value;
  });
}

const qualificationDate = z.string().refine(calendarDate, 'تاريخ غير صالح.').nullable();
const createSchema = z.object({
  name: qualificationText(200),
  issuingBody: qualificationText(200).nullable().optional(),
  qualificationDate: qualificationDate.optional(),
}).strict();
const patchSchema = z.object({
  name: qualificationText(200).optional(),
  issuingBody: qualificationText(200).nullable().optional(),
  qualificationDate: qualificationDate.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'يلزم حقل واحد على الأقل.' });
type QualificationPatch = z.infer<typeof patchSchema>;
const paramsSchema = z.object({ teacherId: z.string().uuid(), qualificationId: z.string().uuid().optional() }).strict();
const notFound = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
const toDate = (value: string | null | undefined) => value == null ? null : new Date(`${value}T00:00:00.000Z`);
const dateText = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

function project(row: TeacherQualification) {
  return {
    id: row.id,
    name: row.name,
    issuingBody: row.issuingBody,
    qualificationDate: dateText(row.qualificationDate),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function registerTeacherQualificationRoutes(
  app: Express,
  database: PrismaClient,
  requireInspector: RequestHandler,
): void {
  const base = '/api/v1/teachers/:teacherId/qualifications';
  app.use(base, (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  }, requireInspector);

  app.get(base, async (request, response) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { teacherId: ['قيمة غير صالحة.'] });
    const inspectorId = response.locals.inspectorId as string;
    const teacher = await database.teacher.findUnique({ where: { id: params.data.teacherId }, select: { id: true, districtId: true } });
    if (!teacher) throw notFound();
    await requireInspectorDistrictMembership(database, inspectorId, teacher.districtId);
    const rows = await database.teacherQualification.findMany({
      where: { teacherId: teacher.id },
      orderBy: [
        { qualificationDate: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    });
    response.json({ items: rows.map(project) });
  });

  app.post(base, validateBody(createSchema), async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { teacherId: ['قيمة غير صالحة.'] });
    const body = request.body as z.infer<typeof createSchema>;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    const row = await database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${params.data.teacherId}::uuid FOR UPDATE`;
      const teacher = await transaction.teacher.findUnique({ where: { id: params.data.teacherId }, select: { id: true, districtId: true } });
      if (!teacher) throw notFound();
      await requireInspectorDistrictMembership(transaction, inspectorId, teacher.districtId);
      const created = await transaction.teacherQualification.create({ data: {
        teacherId: teacher.id,
        name: body.name,
        issuingBody: body.issuingBody ?? null,
        qualificationDate: toDate(body.qualificationDate),
      } });
      await appendAuditEvent(transaction, {
        source: 'HTTP', actorInspectorId: inspectorId, districtId: teacher.districtId,
        action: AuditAction.TEACHER_QUALIFICATION_CREATED, entityType: 'TeacherQualification', entityId: created.id,
        requestId, metadata: { teacherId: teacher.id },
      });
      return created;
    });
    response.status(201).json({ data: project(row) });
  });

  app.patch(`${base}/:qualificationId`, validateBody(patchSchema), async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const params = paramsSchema.safeParse(request.params);
    if (!params.success || !params.data.qualificationId) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { id: ['قيمة غير صالحة.'] });
    }
    const patch = request.body as QualificationPatch;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    const row = await database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${params.data.teacherId}::uuid FOR UPDATE`;
      const teacher = await transaction.teacher.findUnique({ where: { id: params.data.teacherId }, select: { id: true, districtId: true } });
      if (!teacher) throw notFound();
      await requireInspectorDistrictMembership(transaction, inspectorId, teacher.districtId);
      await transaction.$queryRaw`SELECT id FROM "TeacherQualification" WHERE id = ${params.data.qualificationId}::uuid FOR UPDATE`;
      const current = await transaction.teacherQualification.findUnique({ where: { id: params.data.qualificationId } });
      if (!current || current.teacherId !== teacher.id) throw notFound();

      const changed: Prisma.TeacherQualificationUpdateInput = {};
      const changedFields: Array<'name' | 'issuingBody' | 'qualificationDate'> = [];
      if (patch.name !== undefined && patch.name !== current.name) { changed.name = patch.name; changedFields.push('name'); }
      if (patch.issuingBody !== undefined && patch.issuingBody !== current.issuingBody) { changed.issuingBody = patch.issuingBody; changedFields.push('issuingBody'); }
      if (patch.qualificationDate !== undefined && patch.qualificationDate !== dateText(current.qualificationDate)) {
        changed.qualificationDate = toDate(patch.qualificationDate);
        changedFields.push('qualificationDate');
      }
      changedFields.sort();
      if (!changedFields.length) return current;

      const updated = await transaction.teacherQualification.update({ where: { id: current.id }, data: changed });
      await appendAuditEvent(transaction, {
        source: 'HTTP', actorInspectorId: inspectorId, districtId: teacher.districtId,
        action: AuditAction.TEACHER_QUALIFICATION_UPDATED, entityType: 'TeacherQualification', entityId: current.id,
        requestId, metadata: { teacherId: teacher.id, changedFields },
      });
      return updated;
    });
    response.json({ data: project(row) });
  });

  app.delete(`${base}/:qualificationId`, async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const params = paramsSchema.safeParse(request.params);
    if (!params.success || !params.data.qualificationId) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { id: ['قيمة غير صالحة.'] });
    }
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    await database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${params.data.teacherId}::uuid FOR UPDATE`;
      const teacher = await transaction.teacher.findUnique({ where: { id: params.data.teacherId }, select: { id: true, districtId: true } });
      if (!teacher) throw notFound();
      await requireInspectorDistrictMembership(transaction, inspectorId, teacher.districtId);
      await transaction.$queryRaw`SELECT id FROM "TeacherQualification" WHERE id = ${params.data.qualificationId}::uuid FOR UPDATE`;
      const current = await transaction.teacherQualification.findUnique({ where: { id: params.data.qualificationId } });
      if (!current || current.teacherId !== teacher.id) throw notFound();
      await transaction.teacherQualification.delete({ where: { id: current.id } });
      await appendAuditEvent(transaction, {
        source: 'HTTP', actorInspectorId: inspectorId, districtId: teacher.districtId,
        action: AuditAction.TEACHER_QUALIFICATION_DELETED, entityType: 'TeacherQualification', entityId: current.id,
        requestId, metadata: { teacherId: teacher.id },
      });
    });
    response.status(204).end();
  });
}
