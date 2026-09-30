import { Prisma, type PedagogicalVisit, type PrismaClient } from '@prisma/client';
import type { Express, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { appendAuditEvent, AuditAction } from '../audit/append.js';
import { ApiError } from '../http/api-error.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';
import { parseOffsetTimestamp, scheduleWarning, yearSchemaValid, type ScheduleWarning } from './planning.js';

const uuid = z.string().uuid();
const offsetDate = z.string().refine((value) => {
  try { parseOffsetTimestamp(value); return true; } catch { return false; }
}, 'قيمة غير صالحة.');
const year = z.string().refine(yearSchemaValid, 'قيمة غير صالحة.');
const listSchema = z.object({
  districtId: uuid.optional(), teacherId: uuid.optional(), institutionId: uuid.optional(),
  status: z.enum(['PLANNED', 'COMPLETED', 'CANCELLED']).optional(),
  from: offsetDate.optional(), to: offsetDate.optional(),
  limit: z.string().regex(/^\d+$/u).transform(Number).pipe(z.number().int().min(1).max(100)).optional().transform((n) => n ?? 25),
  cursor: uuid.optional(),
}).strict().superRefine((query, context) => {
  if (query.from && query.to && parseOffsetTimestamp(query.from) >= parseOffsetTimestamp(query.to)) {
    context.addIssue({ code: 'custom', path: ['to'], message: 'قيمة غير صالحة.' });
  }
});
const createSchema = z.object({ teacherId: uuid, academicYear: year, scheduledStartAt: offsetDate, scheduledEndAt: offsetDate,
  scheduleWarningAcknowledgement: z.enum(['VISIT_WEEKLY_SCHEDULE_MISSING', 'VISIT_OUTSIDE_WEEKLY_SCHEDULE']).optional() }).strict()
  .refine((input) => parseOffsetTimestamp(input.scheduledStartAt) < parseOffsetTimestamp(input.scheduledEndAt), { path: ['scheduledEndAt'], message: 'قيمة غير صالحة.' });
const expectedRevision = z.number().int().positive();
const patchSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('RESCHEDULE'), expectedRevision, academicYear: year, scheduledStartAt: offsetDate, scheduledEndAt: offsetDate,
    scheduleWarningAcknowledgement: z.enum(['VISIT_WEEKLY_SCHEDULE_MISSING', 'VISIT_OUTSIDE_WEEKLY_SCHEDULE']).optional() }).strict()
    .refine((input) => parseOffsetTimestamp(input.scheduledStartAt) < parseOffsetTimestamp(input.scheduledEndAt), { path: ['scheduledEndAt'], message: 'قيمة غير صالحة.' }),
  z.object({ operation: z.literal('COMPLETE'), expectedRevision, occurredAt: offsetDate }).strict(),
  z.object({ operation: z.literal('CANCEL'), expectedRevision }).strict(),
]);

const notFound = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
const conflict = (code: 'TEACHER_INACTIVE' | 'TEACHER_CURRENT_INSTITUTION_REQUIRED' | 'VISIT_WORKPLACE_UNAVAILABLE' | 'VISIT_WORKPLACE_CHANGED' | 'VISIT_SCHEDULE_CONTEXT_CHANGED' | 'VISIT_WEEKLY_SCHEDULE_MISSING' | 'VISIT_OUTSIDE_WEEKLY_SCHEDULE' | 'VISIT_OVERLAP_CONFLICT' | 'VISIT_REVISION_CONFLICT' | 'VISIT_STATE_CONFLICT') =>
  new ApiError(409, code, 'تعذر تنفيذ العملية. حدّث البيانات أو تحقق من أهلية الأستاذ والموعد.');
const includeProjection = { teacher: { select: { id: true, name: true, surname: true } } } as const;
type VisitWithTeacher = PedagogicalVisit & { teacher: { id: string; name: string; surname: string } };

function projection(visit: VisitWithTeacher) {
  return {
    id: visit.id, districtId: visit.districtId,
    teacher: { id: visit.teacher.id, name: visit.teacher.name, surname: visit.teacher.surname },
    institution: { id: visit.institutionId, name: visit.institutionNameSnapshot },
    academicYear: visit.academicYear, scheduledStartAt: visit.scheduledStartAt.toISOString(),
    scheduledEndAt: visit.scheduledEndAt.toISOString(), occurredAt: visit.occurredAt?.toISOString() ?? null,
    status: visit.status, revision: visit.revision, createdAt: visit.createdAt.toISOString(), updatedAt: visit.updatedAt.toISOString(),
  };
}

function parseList(requestQuery: Request['query']): z.infer<typeof listSchema> {
  const parsed = listSchema.safeParse(requestQuery);
  if (!parsed.success) {
    const fields = parsed.error.issues.reduce<Record<string, string[]>>((acc, issue) => {
      (acc[issue.path.join('.') || '_form'] ??= []).push('قيمة غير صالحة.'); return acc;
    }, {});
    throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', fields);
  }
  return parsed.data;
}

function checkOverlap(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return ['PedagogicalVisit_inspector_no_overlapping_active_visit', 'PedagogicalVisit_teacher_no_overlapping_active_visit']
    .some((constraint) => error.message.includes(constraint));
}

async function inspectSchedule(tx: Prisma.TransactionClient, teacherId: string, academicYear: string, start: Date, end: Date) {
  const schedule = await tx.weeklySchedule.findUnique({
    where: { teacherId_academicYear: { teacherId, academicYear } }, include: { slots: { select: { dayOfWeek: true, startMinute: true, endMinute: true } } },
  });
  return scheduleWarning(start, end, schedule !== null, schedule?.slots ?? []);
}

function verifyAcknowledgement(warning: ScheduleWarning | undefined, acknowledgement?: ScheduleWarning) {
  if (warning && acknowledgement !== warning) throw conflict(warning);
  if (!warning && acknowledgement) throw conflict('VISIT_SCHEDULE_CONTEXT_CHANGED');
}

function toWhere(input: z.infer<typeof listSchema>, inspectorId: string, districtIds: string[]): Prisma.PedagogicalVisitWhereInput {
  return {
    inspectorId,
    districtId: input.districtId ?? { in: districtIds },
    ...(input.teacherId ? { teacherId: input.teacherId } : {}),
    ...(input.institutionId ? { institutionId: input.institutionId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.from || input.to ? { scheduledStartAt: {
      ...(input.from ? { gte: parseOffsetTimestamp(input.from) } : {}),
      ...(input.to ? { lt: parseOffsetTimestamp(input.to) } : {}),
    } } : {}),
  };
}

function sendProjection(response: Response, visit: VisitWithTeacher) {
  response.json({ data: { visit: projection(visit) } });
}

export function registerPedagogicalVisitRoutes(app: Express, database: PrismaClient, requireInspector: RequestHandler): void {
  app.use('/api/v1/visits', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); }, requireInspector);

  app.get('/api/v1/visits', async (request, response) => {
    const input = parseList(request.query);
    const inspectorId = response.locals.inspectorId as string;
    const now = new Date();
    const memberships = await database.inspectorDistrictMembership.findMany({
      where: { inspectorId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
      select: { districtId: true }, distinct: ['districtId'],
    });
    const districtIds = memberships.map((membership) => membership.districtId);
    if (input.districtId && !districtIds.includes(input.districtId)) throw notFound();
    const where = toWhere(input, inspectorId, districtIds);
    const total = districtIds.length ? await database.pedagogicalVisit.count({ where }) : 0;
    let cursorVisit: { id: string; scheduledStartAt: Date } | undefined;
    if (input.cursor) {
      cursorVisit = await database.pedagogicalVisit.findFirst({ where: { ...where, id: input.cursor }, select: { id: true, scheduledStartAt: true } }) ?? undefined;
      if (!cursorVisit) throw notFound();
    }
    const pageWhere: Prisma.PedagogicalVisitWhereInput = cursorVisit ? { AND: [where, { OR: [
      { scheduledStartAt: { lt: cursorVisit.scheduledStartAt } },
      { scheduledStartAt: cursorVisit.scheduledStartAt, id: { lt: cursorVisit.id } },
    ] }] } : where;
    const rows = districtIds.length ? await database.pedagogicalVisit.findMany({
      where: pageWhere, orderBy: [{ scheduledStartAt: 'desc' }, { id: 'desc' }], take: input.limit + 1, include: includeProjection,
    }) : [];
    const hasNext = rows.length > input.limit;
    const items = rows.slice(0, input.limit);
    response.json({ data: items.map((visit) => projection(visit)), page: { limit: input.limit, nextCursor: hasNext ? items.at(-1)?.id ?? null : null, total } });
  });

  app.post('/api/v1/visits', async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { _form: ['قيمة غير صالحة.'] });
    const input = parsed.data;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    const start = parseOffsetTimestamp(input.scheduledStartAt);
    const end = parseOffsetTimestamp(input.scheduledEndAt);
    try {
      const created = await database.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Teacher" WHERE id = ${input.teacherId}::uuid FOR UPDATE`;
        if (!locked.length) throw notFound();
        const teacher = await tx.teacher.findUnique({ where: { id: input.teacherId } });
        if (!teacher) throw notFound();
        await requireInspectorDistrictMembership(tx, inspectorId, teacher.districtId, nowDate());
        if (teacher.recordStatus !== 'ACTIVE') throw conflict('TEACHER_INACTIVE');
        if (!teacher.institutionId) throw conflict('TEACHER_CURRENT_INSTITUTION_REQUIRED');
        await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${teacher.institutionId}::uuid FOR UPDATE`;
        const institution = await tx.institution.findUnique({ where: { id: teacher.institutionId } });
        if (!institution || institution.districtId !== teacher.districtId || institution.archivedAt !== null) throw conflict('VISIT_WORKPLACE_UNAVAILABLE');
        const warning = await inspectSchedule(tx, teacher.id, input.academicYear, start, end);
        verifyAcknowledgement(warning, input.scheduleWarningAcknowledgement);
        const visit = await tx.pedagogicalVisit.create({ data: {
          districtId: teacher.districtId, inspectorId, teacherId: teacher.id,
          institutionId: institution.id, institutionNameSnapshot: institution.name,
          academicYear: input.academicYear, scheduledStartAt: start, scheduledEndAt: end,
        }, include: includeProjection });
        await appendAuditEvent(tx, { source: 'HTTP', actorInspectorId: inspectorId, districtId: visit.districtId,
          action: AuditAction.PEDAGOGICAL_VISIT_CREATED, entityType: 'PedagogicalVisit', entityId: visit.id, requestId,
          metadata: warning ? { scheduleWarningCode: warning } : {} });
        return visit;
      });
      response.status(201).json({ data: { visit: projection(created) } });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (checkOverlap(error)) throw conflict('VISIT_OVERLAP_CONFLICT');
      throw error;
    }
  });

  app.get('/api/v1/visits/:id', async (request, response) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.');
    const inspectorId = response.locals.inspectorId as string;
    const visit = await database.pedagogicalVisit.findFirst({ where: { id: id.data, inspectorId }, include: includeProjection });
    if (!visit) throw notFound();
    await requireInspectorDistrictMembership(database, inspectorId, visit.districtId);
    sendProjection(response, visit);
  });

  app.patch('/api/v1/visits/:id', async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const id = uuid.safeParse(request.params.id);
    const parsed = patchSchema.safeParse(request.body);
    if (!id.success || !parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { _form: ['قيمة غير صالحة.'] });
    const input = parsed.data;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    try {
      const visit = await database.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "PedagogicalVisit" WHERE id = ${id.data}::uuid FOR UPDATE`;
        if (!locked.length) throw notFound();
        const current = await tx.pedagogicalVisit.findFirst({ where: { id: id.data, inspectorId }, include: includeProjection });
        if (!current) throw notFound();
        await requireInspectorDistrictMembership(tx, inspectorId, current.districtId, nowDate());
        if (current.revision !== input.expectedRevision) throw conflict('VISIT_REVISION_CONFLICT');
        if (current.status !== 'PLANNED') throw conflict('VISIT_STATE_CONFLICT');

        if (input.operation === 'RESCHEDULE') {
          const teacherLock = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Teacher" WHERE id = ${current.teacherId}::uuid FOR UPDATE`;
          if (!teacherLock.length) throw conflict('VISIT_WORKPLACE_CHANGED');
          const teacher = await tx.teacher.findUnique({ where: { id: current.teacherId } });
          if (!teacher || teacher.recordStatus !== 'ACTIVE' || teacher.institutionId !== current.institutionId) throw conflict('VISIT_WORKPLACE_CHANGED');
          await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${current.institutionId}::uuid FOR UPDATE`;
          const institution = await tx.institution.findUnique({ where: { id: current.institutionId } });
          if (!institution || institution.districtId !== current.districtId || institution.archivedAt !== null) throw conflict('VISIT_WORKPLACE_CHANGED');
          const start = parseOffsetTimestamp(input.scheduledStartAt);
          const end = parseOffsetTimestamp(input.scheduledEndAt);
          const changedFields = (['scheduledStartAt', 'scheduledEndAt', 'academicYear'] as const).filter((field) => {
            if (field === 'academicYear') return input.academicYear !== current.academicYear;
            return (field === 'scheduledStartAt' ? start : end).getTime() !== (field === 'scheduledStartAt' ? current.scheduledStartAt : current.scheduledEndAt).getTime();
          });
          if (!changedFields.length) return current;
          const warning = await inspectSchedule(tx, current.teacherId, input.academicYear, start, end);
          verifyAcknowledgement(warning, input.scheduleWarningAcknowledgement);
          const updated = await tx.pedagogicalVisit.update({ where: { id: current.id }, data: {
            academicYear: input.academicYear, scheduledStartAt: start, scheduledEndAt: end, revision: { increment: 1 },
          }, include: includeProjection });
          await appendAuditEvent(tx, { source: 'HTTP', actorInspectorId: inspectorId, districtId: current.districtId,
            action: AuditAction.PEDAGOGICAL_VISIT_UPDATED, entityType: 'PedagogicalVisit', entityId: current.id, requestId,
            metadata: { changedFields, ...(warning ? { scheduleWarningCode: warning } : {}) } });
          return updated;
        }

        if (input.operation === 'COMPLETE') {
          const occurredAt = parseOffsetTimestamp(input.occurredAt);
          if (occurredAt.getTime() > Date.now()) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.');
          const updated = await tx.pedagogicalVisit.update({ where: { id: current.id }, data: {
            status: 'COMPLETED', occurredAt, revision: { increment: 1 },
          }, include: includeProjection });
          await appendAuditEvent(tx, { source: 'HTTP', actorInspectorId: inspectorId, districtId: current.districtId,
            action: AuditAction.PEDAGOGICAL_VISIT_COMPLETED, entityType: 'PedagogicalVisit', entityId: current.id, requestId,
            metadata: { fromStatus: 'PLANNED', toStatus: 'COMPLETED' } });
          return updated;
        }

        const updated = await tx.pedagogicalVisit.update({ where: { id: current.id }, data: {
          status: 'CANCELLED', revision: { increment: 1 },
        }, include: includeProjection });
        await appendAuditEvent(tx, { source: 'HTTP', actorInspectorId: inspectorId, districtId: current.districtId,
          action: AuditAction.PEDAGOGICAL_VISIT_CANCELLED, entityType: 'PedagogicalVisit', entityId: current.id, requestId,
          metadata: { fromStatus: 'PLANNED', toStatus: 'CANCELLED' } });
        return updated;
      });
      sendProjection(response, visit);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (checkOverlap(error)) throw conflict('VISIT_OVERLAP_CONFLICT');
      throw error;
    }
  });
}

function nowDate() { return new Date(); }
