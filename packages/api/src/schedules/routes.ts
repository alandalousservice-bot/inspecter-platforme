import { Prisma, type PrismaClient, type WeeklySchedule, type WeeklyScheduleSlot } from '@prisma/client';
import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import { appendAuditEvent, AuditAction } from '../audit/append.js';
import { ApiError } from '../http/api-error.js';
import { validateBody } from '../http/validate-body.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';
import { algiersCalendarDate } from '../teachers/supplementary-workplaces-domain.js';
import { applyScheduleConsistency } from './consistency.js';
import { academicYearSchema } from './validation.js';

const optionalText = (max: number) => z.string().transform((value) => value.normalize('NFC').trim().replace(/\s+/gu, ' '))
  .refine((value) => value.length > 0 && Array.from(value).length <= max && !/[\p{Cc}]/u.test(value)).nullable().optional();
const slotSchema = z.object({
  institutionId: z.string().uuid(), validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u), validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
  dayOfWeek: z.number().int().min(1).max(7),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  levelLabel: optionalText(100), groupLabel: optionalText(100), notes: optionalText(500),
}).strict().refine((slot) => slot.startMinute < slot.endMinute, { message: 'وقت البداية يجب أن يسبق وقت النهاية.' })
  .refine((slot) => validDate(slot.validFrom) && (slot.validTo === undefined || slot.validTo === null || validDate(slot.validTo))
    && (slot.validTo == null || slot.validTo > slot.validFrom), { message: 'تحقق من فترة سريان الحصة.' });
const createSchema = z.object({ academicYear: academicYearSchema, slots: z.array(slotSchema) }).strict();
const expectedRevision = z.number().int().positive();
const addSlotSchema = z.object({ expectedRevision, slot: slotSchema }).strict();
const patchSlotSchema = z.object({
  expectedRevision,
  changes: z.object({
    institutionId: z.string().uuid().optional(), validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(), validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
    dayOfWeek: z.number().int().min(1).max(7).optional(),
    startMinute: z.number().int().min(0).max(1439).optional(),
    endMinute: z.number().int().min(1).max(1440).optional(),
    levelLabel: optionalText(100), groupLabel: optionalText(100), notes: optionalText(500),
  }).strict().refine((changes) => Object.keys(changes).length > 0, { message: 'أدخل تعديلًا واحدًا على الأقل.' })
    .refine((changes) => (changes.validFrom === undefined || validDate(changes.validFrom)) && (changes.validTo == null || validDate(changes.validTo)), { message: 'تحقق من فترة سريان الحصة.' }),
}).strict();
const deleteSlotSchema = z.object({ expectedRevision }).strict();
type SlotInput = z.infer<typeof slotSchema>;

const notFound = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
function validDate(value: string) { const date = new Date(`${value}T00:00:00.000Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }
const staleRevision = () => new ApiError(409, 'WEEKLY_SCHEDULE_REVISION_CONFLICT', 'تغير التوزيع الأسبوعي. حدّث البيانات ثم أعد المحاولة.');
const overlapError = () => new ApiError(400, 'WEEKLY_SCHEDULE_SLOT_OVERLAP', 'تتداخل هذه الحصة مع حصة أخرى في اليوم نفسه.');

type ScheduleSlotRead = WeeklyScheduleSlot & {
  institution?: { id: string; name: string; municipality: string | null; archivedAt: Date | null } | null;
  consistency?: { status: 'CONSISTENT' | 'NEEDS_CORRECTION' | 'LEGACY_UNKNOWN'; reasonCode: string | null };
};
function canonical(schedule: WeeklySchedule & { slots: ScheduleSlotRead[] }) {
  return {
    id: schedule.id, teacherId: schedule.teacherId, academicYear: schedule.academicYear, revision: schedule.revision,
    slots: [...schedule.slots].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.id.localeCompare(b.id))
      .map((slot) => ({ id: slot.id, dayOfWeek: slot.dayOfWeek, startMinute: slot.startMinute, endMinute: slot.endMinute,
        levelLabel: slot.levelLabel, groupLabel: slot.groupLabel, notes: slot.notes,
        institution: slot.institution ? { id: slot.institution.id, name: slot.institution.name, municipality: slot.institution.municipality,
          archivedAt: slot.institution.archivedAt?.toISOString() ?? null } : null,
        institutionId: slot.institutionId, validFrom: slot.validFrom?.toISOString().slice(0, 10) ?? null,
        validTo: slot.validTo?.toISOString().slice(0, 10) ?? null, workplaceBasis: slot.workplaceBasis,
        consistency: slot.consistency ?? { status: 'LEGACY_UNKNOWN', reasonCode: 'LEGACY_LOCATION_UNKNOWN' } })),
  };
}

function slotData(slot: SlotInput) {
  return { institutionId: slot.institutionId, validFrom: new Date(`${slot.validFrom}T00:00:00.000Z`), validTo: slot.validTo ? new Date(`${slot.validTo}T00:00:00.000Z`) : null,
    dayOfWeek: slot.dayOfWeek, startMinute: slot.startMinute, endMinute: slot.endMinute,
    levelLabel: slot.levelLabel ?? null, groupLabel: slot.groupLabel ?? null, notes: slot.notes ?? null };
}

function overlaps(slots: Array<Pick<WeeklyScheduleSlot, 'id' | 'dayOfWeek' | 'startMinute' | 'endMinute' | 'validFrom' | 'validTo'>>,
  candidate: Pick<WeeklyScheduleSlot, 'dayOfWeek' | 'startMinute' | 'endMinute' | 'validFrom' | 'validTo'>, exceptId?: string) {
  return slots.some((slot) => slot.id !== exceptId && slot.dayOfWeek === candidate.dayOfWeek
    && candidate.startMinute < slot.endMinute && slot.startMinute < candidate.endMinute
    && (candidate.validFrom === null || candidate.validFrom === undefined || slot.validFrom === null || slot.validFrom === undefined
      ? candidate.validFrom == null && slot.validFrom == null
      : (candidate.validTo === null || candidate.validTo === undefined || slot.validFrom < candidate.validTo)
        && (slot.validTo === null || slot.validTo === undefined || candidate.validFrom < slot.validTo)));
}

export function isOverlapConstraint(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2004') {
    const databaseError = error.meta?.database_error;
    return typeof databaseError === 'string'
      && (databaseError.includes('WeeklyScheduleSlot_legacy_no_overlapping_same_day')
        || databaseError.includes('WeeklyScheduleSlot_temporal_no_overlapping_teacher_slots'));
  }
  if (error instanceof Error) {
    return error.message.includes('WeeklyScheduleSlot_legacy_no_overlapping_same_day')
      || error.message.includes('WeeklyScheduleSlot_temporal_no_overlapping_teacher_slots');
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
  const schedule = await tx.weeklySchedule.findUnique({ where: { id }, include: { slots: { include: { institution: { select: { id: true, name: true, municipality: true, archivedAt: true } } } } } });
  if (!schedule) throw notFound();
  const teacher = await tx.teacher.findUnique({ where: { id: schedule.teacherId }, select: { institutionId: true, supplementaryWorkplaces: { select: { institutionId: true, validFrom: true, validTo: true } } } });
  return { ...schedule, slots: applyScheduleConsistency(schedule.slots, teacher ?? { institutionId: null, supplementaryWorkplaces: [] }, algiersCalendarDate()) };
}

async function validateWorkplace(tx: Prisma.TransactionClient, teacher: { id: string; districtId: string; institutionId: string | null }, institutionId: string,
  validFrom: string, validTo: string | null): Promise<'HOME' | 'SUPPLEMENTARY'> {
  await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${institutionId}::uuid FOR SHARE`;
  const institution = await tx.institution.findUnique({ where: { id: institutionId } });
  if (!institution || institution.districtId !== teacher.districtId) throw notFound();
  if (institution.archivedAt) throw new ApiError(409, 'CONFLICT', 'تعذر اعتماد مكان العمل لهذه الفترة.');
  const today = algiersCalendarDate();
  if (teacher.institutionId === institutionId && validFrom >= today) return 'HOME';
  const start = new Date(`${validFrom}T00:00:00.000Z`);
  const end = validTo ? new Date(`${validTo}T00:00:00.000Z`) : null;
  const relation = await tx.teacherSupplementaryWorkplace.findFirst({ where: {
    teacherId: teacher.id, institutionId, validFrom: { lte: start },
    ...(end === null ? { validTo: null } : { OR: [{ validTo: null }, { validTo: { gte: end } }] }),
  }, select: { id: true } });
  if (relation) return 'SUPPLEMENTARY';
  throw new ApiError(409, 'CONFLICT', 'المؤسسة غير معتمدة لمكان العمل خلال كامل فترة الحصة.');
}

function mutationFailure(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (isOverlapConstraint(error)) throw overlapError();
  throw error;
}

export function registerWeeklyScheduleRoutes(app: Express, database: PrismaClient, requireInspector: RequestHandler): void {
  app.use('/api/v1/teachers/:teacherId/valid-workplaces', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); }, requireInspector);
  app.use('/api/v1/teachers/:teacherId/schedules', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); }, requireInspector);
  app.use('/api/v1/schedules/:scheduleId/slots', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); }, requireInspector);
  app.use('/api/v1/slots/:slotId', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); }, requireInspector);

  app.get('/api/v1/teachers/:teacherId/valid-workplaces', async (request, response) => {
    const teacherId = z.string().uuid().safeParse(request.params.teacherId);
    const keys = Object.keys(request.query);
    const hasDate = keys.length === 1 && keys[0] === 'date';
    const hasRange = keys.every((key) => key === 'validFrom' || key === 'validTo') && keys.includes('validFrom');
    const query = hasDate ? z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(validDate) }).strict().safeParse(request.query)
      : hasRange ? z.object({ validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(validDate), validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(validDate).optional() }).strict().safeParse(request.query)
        : { success: false as const };
    if (!teacherId.success || !query.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من التاريخ المطلوب.');
    const teacher = await scopedTeacher(database, teacherId.data, response.locals.inspectorId as string);
    const today = algiersCalendarDate();
    const places = await database.institution.findMany({ where: { districtId: teacher.districtId, archivedAt: null }, select: { id: true, name: true, municipality: true } });
    const placeById = new Map(places.map((place) => [place.id, place]));
    const items = new Map<string, { id: string; name: string; municipality: string | null; role: 'HOME' | 'SUPPLEMENTARY' }>();
    const input = query.data;
    if ('validFrom' in input && input.validTo !== undefined && input.validTo <= input.validFrom) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من فترة السريان.');
    if ('date' in input) {
      if (teacher.institutionId && input.date >= today) {
        const place = placeById.get(teacher.institutionId); if (place) items.set(place.id, { ...place, role: 'HOME' });
      }
      const date = new Date(`${input.date}T00:00:00.000Z`);
      const relations = await database.teacherSupplementaryWorkplace.findMany({ where: { teacherId: teacher.id, validFrom: { lte: date }, OR: [{ validTo: null }, { validTo: { gt: date } }] }, select: { institutionId: true } });
      for (const relation of relations) { const place = placeById.get(relation.institutionId); if (place && !items.has(place.id)) items.set(place.id, { ...place, role: 'SUPPLEMENTARY' }); }
    } else {
      const from = input.validFrom; const to = input.validTo ?? null;
      if (teacher.institutionId && from >= today) {
        const place = placeById.get(teacher.institutionId); if (place) items.set(place.id, { ...place, role: 'HOME' });
      }
      const startDate = new Date(`${from}T00:00:00.000Z`); const endDate = to ? new Date(`${to}T00:00:00.000Z`) : null;
      const relations = await database.teacherSupplementaryWorkplace.findMany({ where: { teacherId: teacher.id, validFrom: { lte: startDate },
        ...(endDate ? { OR: [{ validTo: null }, { validTo: { gte: endDate } }] } : { validTo: null }) }, select: { institutionId: true } });
      for (const relation of relations) { const place = placeById.get(relation.institutionId); if (place && !items.has(place.id)) items.set(place.id, { ...place, role: 'SUPPLEMENTARY' }); }
    }
    response.json({ data: { items: [...items.values()].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) } });
  });

  app.get('/api/v1/teachers/:teacherId/schedules', async (request, response) => {
    const params = z.string().uuid().safeParse(request.params.teacherId);
    const year = academicYearSchema.safeParse(request.query.academicYear);
    if (!params.success || !year.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.');
    const teacher = await scopedTeacher(database, params.data, response.locals.inspectorId as string);
    const schedule = await database.weeklySchedule.findUnique({ where: { teacherId_academicYear: { teacherId: teacher.id, academicYear: year.data } }, select: { id: true } });
    response.json({ data: { schedule: schedule ? canonical(await fetchSchedule(database, schedule.id)) : null } });
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
        const prior = await tx.weeklySchedule.findUnique({ where: { teacherId_academicYear: { teacherId: teacher.id, academicYear: input.academicYear } }, select: { id: true } });
        if (prior) throw new ApiError(409, 'WEEKLY_SCHEDULE_ALREADY_EXISTS', 'يوجد توزيع أسبوعي مسجل لهذه السنة.');
        const initialSlots: Array<Pick<WeeklyScheduleSlot, 'id' | 'dayOfWeek' | 'startMinute' | 'endMinute' | 'validFrom' | 'validTo'>> = [];
        const writes = [];
        for (const slot of input.slots) {
          const basis = await validateWorkplace(tx, teacher, slot.institutionId, slot.validFrom, slot.validTo ?? null);
          const row = { ...slot, id: String(initialSlots.length), validFrom: new Date(`${slot.validFrom}T00:00:00.000Z`), validTo: slot.validTo ? new Date(`${slot.validTo}T00:00:00.000Z`) : null };
          if (overlaps(initialSlots, row)) throw overlapError();
          initialSlots.push(row); writes.push({ ...slotData(slot), teacherId: teacher.id, districtId: teacher.districtId, workplaceBasis: basis });
        }
        const created = await tx.weeklySchedule.create({ data: { teacherId: teacher.id, academicYear: input.academicYear,
          slots: { create: writes } }, select: { id: true } });
        await appendAuditEvent(tx, { source: 'HTTP', actorInspectorId: inspectorId, districtId: teacher.districtId,
          action: AuditAction.WEEKLY_SCHEDULE_CREATED, entityType: 'WeeklySchedule', entityId: created.id, requestId, metadata: {} });
        return fetchSchedule(tx, created.id);
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
        await tx.$queryRaw`SELECT id FROM "WeeklySchedule" WHERE id = ${scheduleId.data}::uuid FOR UPDATE`;
        const current = await fetchSchedule(tx, scheduleId.data);
        if (current.teacherId !== teacher.id) throw notFound();
        if (current.revision !== revision) throw staleRevision();
        if (overlaps(current.slots, { ...slot, validFrom: new Date(`${slot.validFrom}T00:00:00.000Z`), validTo: slot.validTo ? new Date(`${slot.validTo}T00:00:00.000Z`) : null })) throw overlapError();
        const basis = await validateWorkplace(tx, teacher, slot.institutionId, slot.validFrom, slot.validTo ?? null);
        const created = await tx.weeklyScheduleSlot.create({ data: { scheduleId: current.id, teacherId: teacher.id, districtId: teacher.districtId, workplaceBasis: basis, ...slotData(slot) } });
        await tx.weeklySchedule.update({ where: { id: current.id }, data: { revision: { increment: 1 } } });
        const updated = await fetchSchedule(tx, current.id);
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
        await tx.$queryRaw`SELECT id FROM "WeeklySchedule" WHERE id = ${slot.scheduleId}::uuid FOR UPDATE`;
        const current = await fetchSchedule(tx, slot.scheduleId);
        if (current.teacherId !== teacher.id) throw notFound();
        if (current.revision !== revision) throw staleRevision();
        const existing = current.slots.find((candidate) => candidate.id === slotId.data);
        if (!existing) throw notFound();
        const proposed = { ...existing, ...changes };
        if (proposed.startMinute >= proposed.endMinute) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من وقت البداية والنهاية.', { changes: ['يجب أن يسبق وقت البداية وقت النهاية.'] });
        const providedFields = Object.keys(changes) as Array<keyof typeof changes>;
        const requestChangesExistingValue = providedFields.every((key) => {
          const value = changes[key];
          if (key === 'institutionId') return value === existing.institutionId;
          if (key === 'validFrom') return value === (existing.validFrom?.toISOString().slice(0, 10) ?? undefined);
          if (key === 'validTo') return (value ?? null) === (existing.validTo?.toISOString().slice(0, 10) ?? null);
          return value === existing[key as keyof typeof existing];
        });
        if (existing.validFrom === null && requestChangesExistingValue) return current;
        if (existing.validFrom === null && (!changes.institutionId || !changes.validFrom)) throw new ApiError(400, 'VALIDATION_ERROR', 'اختر مكان العمل وفترة السريان صراحةً لترقية الحصة السابقة.');
        const proposedFrom = changes.validFrom ?? existing.validFrom?.toISOString().slice(0, 10);
        const proposedTo = changes.validTo === undefined ? existing.validTo?.toISOString().slice(0, 10) ?? null : changes.validTo;
        const proposedInstitution = changes.institutionId ?? existing.institutionId;
        if (!proposedFrom || !proposedInstitution || (proposedTo !== null && proposedTo <= proposedFrom)) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من مؤسسة الحصة وفترة سريانها.');
        const proposedRange = { ...proposed, validFrom: new Date(`${proposedFrom}T00:00:00.000Z`), validTo: proposedTo ? new Date(`${proposedTo}T00:00:00.000Z`) : null };
        if (overlaps(current.slots, proposedRange, existing.id)) throw overlapError();
        const basis = await validateWorkplace(tx, teacher, proposedInstitution, proposedFrom, proposedTo);
        const updateData: Prisma.WeeklyScheduleSlotUpdateInput = {};
        for (const key of ['dayOfWeek', 'startMinute', 'endMinute', 'levelLabel', 'groupLabel', 'notes'] as const) {
          if (Object.hasOwn(changes, key)) Object.assign(updateData, { [key]: changes[key] ?? null });
        }
        Object.assign(updateData, { institutionId: proposedInstitution, validFrom: new Date(`${proposedFrom}T00:00:00.000Z`), validTo: proposedTo ? new Date(`${proposedTo}T00:00:00.000Z`) : null, workplaceBasis: basis });
        const changed = Object.keys(updateData).some((key) => {
          const before = existing[key as keyof typeof existing]; const after = updateData[key as keyof typeof updateData];
          if (before instanceof Date && after instanceof Date) return before.getTime() !== after.getTime();
          return before !== after;
        });
        if (!changed) return current;
        await tx.weeklyScheduleSlot.update({ where: { id: existing.id }, data: updateData });
        const updatedSchedule = await tx.weeklySchedule.update({ where: { id: current.id }, data: { revision: { increment: 1 } }, select: { id: true } });
        const updated = await fetchSchedule(tx, updatedSchedule.id);
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
