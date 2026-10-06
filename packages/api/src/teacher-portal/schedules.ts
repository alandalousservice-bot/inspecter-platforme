import type { Prisma, PrismaClient, Teacher } from '@prisma/client';
import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError } from '../http/api-error.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';
import { canonical, createSchema, fetchSchedule, isOverlapConstraint, slotData, validateWorkplace } from '../schedules/routes.js';
import { academicYearSchema } from '../schedules/validation.js';
import { parse, text } from './contracts.js';
import { requireTeacher, requireTeacherCsrf } from './auth.js';
import { appendPortalAudit } from './audit.js';

const missing = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
const conflict = () => new ApiError(409, 'SCHEDULE_CHANGED', 'تغير الجدول أو طلب التصحيح؛ حدّث البيانات.');
async function teacherLocked(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${id}::uuid FOR UPDATE`;
  const teacher = await tx.teacher.findUnique({ where: { id } });
  if (!teacher || teacher.recordStatus !== 'ACTIVE' || teacher.archivedAt) throw missing();
  return teacher;
}
async function writes(tx: Prisma.TransactionClient, teacher: Teacher, slots: z.infer<typeof createSchema>['slots']) {
  const result: Array<ReturnType<typeof slotData> & { teacherId: string; districtId: string; workplaceBasis: 'HOME' | 'SUPPLEMENTARY' }> = [];
  for (const slot of slots) {
    const basis = await validateWorkplace(tx, teacher, slot.institutionId, slot.validFrom, slot.validTo ?? null);
    const data = slotData(slot);
    if (result.some((s) => s.dayOfWeek === data.dayOfWeek && s.startMinute < data.endMinute && data.startMinute < s.endMinute
      && (s.validTo === null || data.validFrom < s.validTo) && (data.validTo === null || s.validFrom < data.validTo))) {
      throw new ApiError(400, 'WEEKLY_SCHEDULE_SLOT_OVERLAP', 'تتداخل الحصص المدخلة.');
    }
    result.push({ ...data, teacherId: teacher.id, districtId: teacher.districtId, workplaceBasis: basis });
  }
  return result;
}
export function registerTeacherSchedules(app: Express, database: PrismaClient, inspector: RequestHandler) {
  const teacherAuth = requireTeacher(database);
  app.get('/api/v1/teacher/schedules', teacherAuth, async (request, response) => {
    const query = parse(z.object({ academicYear: academicYearSchema }).strict(), request.query);
    const schedule = await database.weeklySchedule.findUnique({ where: { teacherId_academicYear: { teacherId: response.locals.teacherId as string, academicYear: query.academicYear } } });
    const reviews = await database.scheduleCorrection.findMany({ where: { teacherId: response.locals.teacherId as string, academicYear: query.academicYear }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 25 });
    const correction = reviews.find((r) => r.status === 'REQUESTED' || r.status === 'SUBMITTED') ?? null;
    response.json({ data: { schedule: schedule ? canonical(await fetchSchedule(database, schedule.id)) : null, correction, reviews } });
  });
  app.post('/api/v1/teacher/schedules', teacherAuth, async (request, response) => {
    requireTeacherCsrf(request); const input = parse(createSchema.extend({ expectedRevision: z.number().int().positive().optional() }), request.body);
    try {
      const result = await database.$transaction(async (tx) => {
        const teacher = await teacherLocked(tx, response.locals.teacherId as string);
        const existing = await tx.weeklySchedule.findUnique({ where: { teacherId_academicYear: { teacherId: teacher.id, academicYear: input.academicYear } } });
        if (existing && (existing.revision !== input.expectedRevision || await tx.scheduleCorrection.findFirst({ where: { teacherId: teacher.id, academicYear: input.academicYear, status: { in: ['REQUESTED', 'SUBMITTED'] } } }))) throw conflict();
        const rows = await writes(tx, teacher, input.slots);
        if (existing) {
          const correction = await tx.scheduleCorrection.create({ data: { teacherId: teacher.id, academicYear: input.academicYear, origin: 'TEACHER_UPDATE', status: 'SUBMITTED', scheduleRevision: existing.revision, proposedSlots: input.slots as Prisma.InputJsonValue } });
          await appendPortalAudit(tx, response, teacher, 'TEACHER_SCHEDULE_UPDATE_SUBMITTED', correction.id, {}, teacher.id);
          return { schedule: canonical(await fetchSchedule(tx, existing.id)), correction };
        }
        const schedule = await tx.weeklySchedule.create({ data: { teacherId: teacher.id, academicYear: input.academicYear, slots: { create: rows } } });
        await appendPortalAudit(tx, response, teacher, 'TEACHER_SCHEDULE_SUBMITTED', schedule.id, {}, teacher.id);
        return { schedule: canonical(await fetchSchedule(tx, schedule.id)), correction: null };
      });
      response.status(201).json({ data: result });
    } catch (error) { if (isOverlapConstraint(error)) throw new ApiError(400, 'WEEKLY_SCHEDULE_SLOT_OVERLAP', 'تتداخل الحصص المدخلة.'); throw error; }
  });
  app.get('/api/v1/teachers/:id/schedule-corrections', inspector, async (request, response) => {
    const id = parse(z.string().uuid(), request.params.id);
    const teacher = await database.teacher.findUnique({ where: { id } }); if (!teacher) throw missing();
    await requireInspectorDistrictMembership(database, response.locals.inspectorId as string, teacher.districtId);
    response.setHeader('Cache-Control', 'no-store');
    response.json({ data: await database.scheduleCorrection.findMany({ where: { teacherId: id, OR: [{ origin: 'TEACHER_UPDATE' }, { inspectorId: response.locals.inspectorId as string }] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 25 }) });
  });
  app.post('/api/v1/teachers/:id/schedule-corrections', inspector, async (request, response) => {
    requireAuthenticatedMutationCsrf(request); const id = parse(z.string().uuid(), request.params.id);
    const input = parse(z.object({ academicYear: academicYearSchema, note: text(500), expectedRevision: z.number().int().positive() }).strict(), request.body);
    const result = await database.$transaction(async (tx) => {
      const teacher = await teacherLocked(tx, id); const inspectorId = response.locals.inspectorId as string;
      await requireInspectorDistrictMembership(tx, inspectorId, teacher.districtId);
      const schedule = await tx.weeklySchedule.findUnique({ where: { teacherId_academicYear: { teacherId: id, academicYear: input.academicYear } } });
      if (!schedule || schedule.revision !== input.expectedRevision) throw conflict();
      if (await tx.scheduleCorrection.findFirst({ where: { teacherId: id, academicYear: input.academicYear, status: { in: ['REQUESTED', 'SUBMITTED'] } } })) throw conflict();
      const correction = await tx.scheduleCorrection.create({ data: { teacherId: id, inspectorId, academicYear: input.academicYear, note: input.note, scheduleRevision: schedule.revision } });
      await appendPortalAudit(tx, response, teacher, 'TEACHER_SCHEDULE_CORRECTION_REQUESTED', correction.id);
      return correction;
    });
    response.status(201).json({ data: result });
  });
  app.post('/api/v1/teacher/schedule-corrections/:id', teacherAuth, async (request, response) => {
    requireTeacherCsrf(request); const id = parse(z.string().uuid(), request.params.id);
    const input = parse(createSchema.extend({ expectedRevision: z.number().int().positive() }), request.body);
    const result = await database.$transaction(async (tx) => {
      const teacher = await teacherLocked(tx, response.locals.teacherId as string);
      const correction = await tx.scheduleCorrection.findFirst({ where: { id, teacherId: teacher.id } }); if (!correction) throw missing();
      if (correction.status !== 'REQUESTED' || correction.academicYear !== input.academicYear || correction.revision !== input.expectedRevision) throw conflict();
      await writes(tx, teacher, input.slots); // Validate before recording proposal, no canonical writes.
      const updated = await tx.scheduleCorrection.update({ where: { id }, data: { proposedSlots: input.slots as Prisma.InputJsonValue, status: 'SUBMITTED', revision: { increment: 1 } } });
      await appendPortalAudit(tx, response, teacher, 'TEACHER_SCHEDULE_CORRECTION_SUBMITTED', id, {}, teacher.id);
      return { id, status: updated.status };
    });
    response.json({ data: result });
  });
  app.post('/api/v1/schedule-corrections/:id/accept', inspector, async (request, response) => {
    requireAuthenticatedMutationCsrf(request); const id = parse(z.string().uuid(), request.params.id);
    const input = parse(z.object({ expectedRevision: z.number().int().positive() }).strict(), request.body);
    try {
      const result = await database.$transaction(async (tx) => {
        const first = await tx.scheduleCorrection.findUnique({ where: { id } }); if (!first) throw missing();
        const teacher = await teacherLocked(tx, first.teacherId);
        await requireInspectorDistrictMembership(tx, response.locals.inspectorId as string, teacher.districtId);
        const correction = await tx.scheduleCorrection.findUnique({ where: { id } });
        if (!correction || (correction.origin === 'INSPECTOR_CORRECTION' && correction.inspectorId !== response.locals.inspectorId)) throw missing();
        if (correction.status !== 'SUBMITTED' || correction.revision !== input.expectedRevision) throw conflict();
        const schedule = await tx.weeklySchedule.findUnique({ where: { teacherId_academicYear: { teacherId: teacher.id, academicYear: correction.academicYear } } });
        if (!schedule || schedule.revision !== correction.scheduleRevision) throw conflict();
        const previous = canonical(await fetchSchedule(tx, schedule.id));
        let rows: Awaited<ReturnType<typeof writes>>;
        try {
          const payload = parse(createSchema, { academicYear: correction.academicYear, slots: correction.proposedSlots });
          rows = await writes(tx, teacher, payload.slots);
        } catch (error) {
          if (error instanceof ApiError) throw conflict();
          throw error;
        }
        await tx.weeklyScheduleSlot.deleteMany({ where: { scheduleId: schedule.id } });
        await tx.weeklySchedule.update({ where: { id: schedule.id }, data: { revision: { increment: 1 }, slots: { create: rows } } });
        await tx.scheduleCorrection.update({ where: { id }, data: { status: 'ACCEPTED', decisionInspectorId: response.locals.inspectorId as string, previousSlots: previous.slots as unknown as Prisma.InputJsonValue, revision: { increment: 1 } } });
        await appendPortalAudit(tx, response, teacher, correction.origin === 'TEACHER_UPDATE' ? 'TEACHER_SCHEDULE_UPDATE_ACCEPTED' : 'TEACHER_SCHEDULE_CORRECTION_ACCEPTED', id);
        return canonical(await fetchSchedule(tx, schedule.id));
      });
      response.json({ data: { schedule: result } });
    } catch (error) { if (isOverlapConstraint(error)) throw conflict(); throw error; }
  });
  app.post('/api/v1/schedule-corrections/:id/reject', inspector, async (request, response) => {
    requireAuthenticatedMutationCsrf(request); const id = parse(z.string().uuid(), request.params.id);
    const input = parse(z.object({ expectedRevision: z.number().int().positive(), reason: text(500) }).strict(), request.body);
    const result = await database.$transaction(async (tx) => {
      const first = await tx.scheduleCorrection.findUnique({ where: { id } }); if (!first) throw missing();
      const teacher = await teacherLocked(tx, first.teacherId);
      await requireInspectorDistrictMembership(tx, response.locals.inspectorId as string, teacher.districtId);
      const correction = await tx.scheduleCorrection.findUnique({ where: { id } });
      if (!correction || (correction.origin === 'INSPECTOR_CORRECTION' && correction.inspectorId !== response.locals.inspectorId)) throw missing();
      if (correction.status !== 'SUBMITTED' || correction.revision !== input.expectedRevision) throw conflict();
      // Rejection deliberately does not revalidate stale workplaces/canonical revisions.
      const rejected = await tx.scheduleCorrection.update({ where: { id }, data: { status: 'REJECTED', decisionNote: input.reason, decisionInspectorId: response.locals.inspectorId as string, revision: { increment: 1 } } });
      await appendPortalAudit(tx, response, teacher, correction.origin === 'TEACHER_UPDATE' ? 'TEACHER_SCHEDULE_UPDATE_REJECTED' : 'TEACHER_SCHEDULE_CORRECTION_REJECTED', id);
      return rejected;
    });
    response.json({ data: result });
  });
}
