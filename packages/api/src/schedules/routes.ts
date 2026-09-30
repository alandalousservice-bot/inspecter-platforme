import { Prisma, type PrismaClient, type WeeklySchedule, type WeeklyScheduleSlot } from '@prisma/client';
import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import { appendAuditEvent, AuditAction } from '../audit/append.js';
import { ApiError } from '../http/api-error.js';
import { validateBody } from '../http/validate-body.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';

const yearSchema = z.string().regex(/^\d{4}-\d{4}$/u).refine((value) => Number(value.slice(5)) === Number(value.slice(0, 4)) + 1);
const optionalText = (max: number) => z.string().transform((value) => value.normalize('NFC').trim().replace(/\s+/gu, ' '))
  .refine((value) => value.length > 0 && Array.from(value).length <= max && !/[\p{Cc}]/u.test(value)).nullable().optional();
const slotSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  levelLabel: optionalText(100), groupLabel: optionalText(100), notes: optionalText(500),
}).strict().refine((slot) => slot.startMinute < slot.endMinute, { message: 'وقت البداية يجب أن يسبق وقت النهاية.' });
const createSchema = z.object({ academicYear: yearSchema, slots: z.array(slotSchema) }).strict();
const expectedRevision = z.number().int().positive();
const addSlotSchema = z.object({ expectedRevision, slot: slotSchema }).strict();
const patchSlotSchema = z.object({
  expectedRevision,
  changes: z.object({
    dayOfWeek: z.number().int().min(1).max(7).optional(),
    startMinute: z.number().int().min(0).max(1439).optional(),
    endMinute: z.number().int().min(1).max(1440).optional(),
    levelLabel: optionalText(100), groupLabel: optionalText(100), notes: optionalText(500),
  }).strict().refine((changes) => Object.keys(changes).length > 0, { message: 'أدخل تعديلًا واحدًا على الأقل.' }),
}).strict();
const deleteSlotSchema = z.object({ expectedRevision }).strict();
type SlotInput = z.infer<typeof slotSchema>;

const notFound = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
const missingInstitution = () => new ApiError(409, 'TEACHER_CURRENT_INSTITUTION_REQUIRED', 'يجب اعتماد مؤسسة حالية للأستاذ قبل تعديل التوزيع الأسبوعي.');
const staleRevision = () => new ApiError(409, 'WEEKLY_SCHEDULE_REVISION_CONFLICT', 'تغير التوزيع الأسبوعي. حدّث البيانات ثم أعد المحاولة.');
const overlapError = () => new ApiError(400, 'WEEKLY_SCHEDULE_SLOT_OVERLAP', 'تتداخل هذه الحصة مع حصة أخرى في اليوم نفسه.');

function canonical(schedule: WeeklySchedule & { slots: WeeklyScheduleSlot[] }) {
  return {
    id: schedule.id, teacherId: schedule.teacherId, academicYear: schedule.academicYear, revision: schedule.revision,
    slots: [...schedule.slots].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.id.localeCompare(b.id))
      .map(({ id, dayOfWeek, startMinute, endMinute, levelLabel, groupLabel, notes }) => ({ id, dayOfWeek, startMinute, endMinute, levelLabel, groupLabel, notes })),
  };
}

function slotData(slot: SlotInput) {
  return { dayOfWeek: slot.dayOfWeek, startMinute: slot.startMinute, endMinute: slot.endMinute,
    levelLabel: slot.levelLabel ?? null, groupLabel: slot.groupLabel ?? null, notes: slot.notes ?? null };
}

function overlaps(slots: Pick<WeeklyScheduleSlot, 'id' | 'dayOfWeek' | 'startMinute' | 'endMinute'>[], candidate: Pick<WeeklyScheduleSlot, 'dayOfWeek' | 'startMinute' | 'endMinute'>, exceptId?: string) {
  return slots.some((slot) => slot.id !== exceptId && slot.dayOfWeek === candidate.dayOfWeek
    && candidate.startMinute < slot.endMinute && slot.startMinute < candidate.endMinute);
}

export function isOverlapConstraint(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2004') {
    const databaseError = error.meta?.database_error;
    return typeof databaseError === 'string' && databaseError.includes('WeeklyScheduleSlot_no_overlapping_same_day');
  }
  return false;
}

async function scopedTeacher(tx: Prisma.TransactionClient, teacherId: string, inspectorId: string) {
  const teacher = await tx.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) throw notFound();
  await requireInspectorDistrictMembership(tx, inspectorId, teacher.districtId);
  return teacher;
}

async function fetchSchedule(tx: Prisma.TransactionClient, id: string) {
  const schedule = await tx.weeklySchedule.findUnique({ where: { id }, include: { slots: true } });
  if (!schedule) throw notFound();
  return schedule;
}

function mutationFailure(error: unknown): never {
  if (isOverlapConstraint(error)) throw overlapError();
  throw error;
}

export function registerWeeklyScheduleRoutes(app: Express, database: PrismaClient, requireInspector: RequestHandler): void {
  app.use('/api/v1/teachers/:teacherId/schedules', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); }, requireInspector);
  app.use('/api/v1/schedules/:scheduleId/slots', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); }, requireInspector);
  app.use('/api/v1/slots/:slotId', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); }, requireInspector);

  app.get('/api/v1/teachers/:teacherId/schedules', async (request, response) => {
    const params = z.string().uuid().safeParse(request.params.teacherId);
    const year = yearSchema.safeParse(request.query.academicYear);
    if (!params.success || !year.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.');
    const teacher = await scopedTeacher(database, params.data, response.locals.inspectorId as string);
    const schedule = await database.weeklySchedule.findUnique({ where: { teacherId_academicYear: { teacherId: teacher.id, academicYear: year.data } }, include: { slots: true } });
    response.json({ data: { schedule: schedule ? canonical(schedule) : null } });
  });

  app.post('/api/v1/teachers/:teacherId/schedules', validateBody(createSchema), async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const params = z.string().uuid().safeParse(request.params.teacherId);
    if (!params.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { teacherId: ['معرّف غير صالح.'] });
    const input = request.body as z.infer<typeof createSchema>;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    try {
      const schedule = await database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${params.data}::uuid FOR UPDATE`;
        const teacher = await scopedTeacher(tx, params.data, inspectorId);
        if (teacher.institutionId === null) throw missingInstitution();
        const prior = await tx.weeklySchedule.findUnique({ where: { teacherId_academicYear: { teacherId: teacher.id, academicYear: input.academicYear } }, select: { id: true } });
        if (prior) throw new ApiError(409, 'WEEKLY_SCHEDULE_ALREADY_EXISTS', 'يوجد توزيع أسبوعي مسجل لهذه السنة.');
        const initialSlots: SlotInput[] = [];
        for (const slot of input.slots) {
          if (overlaps(initialSlots.map((item, index) => ({ ...item, id: String(index) })), slot)) throw overlapError();
          initialSlots.push(slot);
        }
        const created = await tx.weeklySchedule.create({ data: { teacherId: teacher.id, academicYear: input.academicYear,
          slots: { create: input.slots.map(slotData) } }, include: { slots: true } });
        await appendAuditEvent(tx, { source: 'HTTP', actorInspectorId: inspectorId, districtId: teacher.districtId,
          action: AuditAction.WEEKLY_SCHEDULE_CREATED, entityType: 'WeeklySchedule', entityId: created.id, requestId, metadata: {} });
        return created;
      });
      response.status(201).json({ data: { schedule: canonical(schedule) } });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(409, 'WEEKLY_SCHEDULE_ALREADY_EXISTS', 'يوجد توزيع أسبوعي مسجل لهذه السنة.');
      }
      mutationFailure(error);
    }
  });

  app.post('/api/v1/schedules/:scheduleId/slots', validateBody(addSlotSchema), async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const scheduleId = z.string().uuid().safeParse(request.params.scheduleId);
    if (!scheduleId.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.');
    const { expectedRevision: revision, slot } = request.body as z.infer<typeof addSlotSchema>;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    try {
      const result = await database.$transaction(async (tx) => {
        const first = await tx.weeklySchedule.findUnique({ where: { id: scheduleId.data }, select: { teacherId: true } });
        if (!first) throw notFound();
        await tx.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${first.teacherId}::uuid FOR UPDATE`;
        const teacher = await scopedTeacher(tx, first.teacherId, inspectorId);
        if (teacher.institutionId === null) throw missingInstitution();
        await tx.$queryRaw`SELECT id FROM "WeeklySchedule" WHERE id = ${scheduleId.data}::uuid FOR UPDATE`;
        const current = await fetchSchedule(tx, scheduleId.data);
        if (current.teacherId !== teacher.id) throw notFound();
        if (current.revision !== revision) throw staleRevision();
        if (overlaps(current.slots, slot)) throw overlapError();
        const created = await tx.weeklyScheduleSlot.create({ data: { scheduleId: current.id, ...slotData(slot) } });
        const updated = await tx.weeklySchedule.update({ where: { id: current.id }, data: { revision: { increment: 1 } }, include: { slots: true } });
        await appendAuditEvent(tx, { source: 'HTTP', actorInspectorId: inspectorId, districtId: teacher.districtId,
          action: AuditAction.WEEKLY_SCHEDULE_UPDATED, entityType: 'WeeklySchedule', entityId: current.id, requestId,
          metadata: { changedFields: ['slots'], affectedSlotIds: [created.id], slotCount: updated.slots.length } });
        return updated;
      });
      response.status(201).json({ data: { schedule: canonical(result) } });
    } catch (error) { mutationFailure(error); }
  });

  app.patch('/api/v1/slots/:slotId', validateBody(patchSlotSchema), async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const slotId = z.string().uuid().safeParse(request.params.slotId);
    if (!slotId.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.');
    const { expectedRevision: revision, changes } = request.body as z.infer<typeof patchSlotSchema>;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    try {
      const result = await database.$transaction(async (tx) => {
        const slot = await tx.weeklyScheduleSlot.findUnique({ where: { id: slotId.data }, select: { scheduleId: true } });
        if (!slot) throw notFound();
        const initial = await tx.weeklySchedule.findUnique({ where: { id: slot.scheduleId }, select: { teacherId: true } });
        if (!initial) throw notFound();
        await tx.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${initial.teacherId}::uuid FOR UPDATE`;
        const teacher = await scopedTeacher(tx, initial.teacherId, inspectorId);
        if (teacher.institutionId === null) throw missingInstitution();
        await tx.$queryRaw`SELECT id FROM "WeeklySchedule" WHERE id = ${slot.scheduleId}::uuid FOR UPDATE`;
        const current = await fetchSchedule(tx, slot.scheduleId);
        if (current.teacherId !== teacher.id) throw notFound();
        if (current.revision !== revision) throw staleRevision();
        const existing = current.slots.find((candidate) => candidate.id === slotId.data);
        if (!existing) throw notFound();
        const proposed = { ...existing, ...changes };
        if (proposed.startMinute >= proposed.endMinute) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من وقت البداية والنهاية.', { changes: ['يجب أن يسبق وقت البداية وقت النهاية.'] });
        if (overlaps(current.slots, proposed, existing.id)) throw overlapError();
        const updateData: Prisma.WeeklyScheduleSlotUpdateInput = {};
        for (const key of ['dayOfWeek', 'startMinute', 'endMinute', 'levelLabel', 'groupLabel', 'notes'] as const) {
          if (Object.hasOwn(changes, key)) Object.assign(updateData, { [key]: changes[key] ?? null });
        }
        const changed = Object.keys(updateData).some((key) => existing[key as keyof typeof existing] !== updateData[key as keyof typeof updateData]);
        if (!changed) return current;
        await tx.weeklyScheduleSlot.update({ where: { id: existing.id }, data: updateData });
        const updated = await tx.weeklySchedule.update({ where: { id: current.id }, data: { revision: { increment: 1 } }, include: { slots: true } });
        await appendAuditEvent(tx, { source: 'HTTP', actorInspectorId: inspectorId, districtId: teacher.districtId,
          action: AuditAction.WEEKLY_SCHEDULE_UPDATED, entityType: 'WeeklySchedule', entityId: current.id, requestId,
          metadata: { changedFields: ['slots'], affectedSlotIds: [existing.id], slotCount: updated.slots.length } });
        return updated;
      });
      response.json({ data: { schedule: canonical(result) } });
    } catch (error) { mutationFailure(error); }
  });

  app.delete('/api/v1/slots/:slotId', validateBody(deleteSlotSchema), async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const slotId = z.string().uuid().safeParse(request.params.slotId);
    if (!slotId.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.');
    const { expectedRevision: revision } = request.body as z.infer<typeof deleteSlotSchema>;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    const result = await database.$transaction(async (tx) => {
      const slot = await tx.weeklyScheduleSlot.findUnique({ where: { id: slotId.data }, select: { scheduleId: true } });
      if (!slot) throw notFound();
      const initial = await tx.weeklySchedule.findUnique({ where: { id: slot.scheduleId }, select: { teacherId: true } });
      if (!initial) throw notFound();
      await tx.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${initial.teacherId}::uuid FOR UPDATE`;
      const teacher = await scopedTeacher(tx, initial.teacherId, inspectorId);
      if (teacher.institutionId === null) throw missingInstitution();
      await tx.$queryRaw`SELECT id FROM "WeeklySchedule" WHERE id = ${slot.scheduleId}::uuid FOR UPDATE`;
      const current = await fetchSchedule(tx, slot.scheduleId);
      if (current.teacherId !== teacher.id) throw notFound();
      if (current.revision !== revision) throw staleRevision();
      if (!current.slots.some((candidate) => candidate.id === slotId.data)) throw notFound();
      await tx.weeklyScheduleSlot.delete({ where: { id: slotId.data } });
      const updated = await tx.weeklySchedule.update({ where: { id: current.id }, data: { revision: { increment: 1 } }, include: { slots: true } });
      await appendAuditEvent(tx, { source: 'HTTP', actorInspectorId: inspectorId, districtId: teacher.districtId,
        action: AuditAction.WEEKLY_SCHEDULE_UPDATED, entityType: 'WeeklySchedule', entityId: current.id, requestId,
        metadata: { changedFields: ['slots'], affectedSlotIds: [slotId.data], slotCount: updated.slots.length } });
      return updated;
    });
    response.json({ data: { schedule: canonical(result) } });
  });
}
