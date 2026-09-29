import type { Express, RequestHandler } from 'express';
import { Prisma, type PrismaClient, type Teacher } from '@prisma/client';
import { z } from 'zod';
import { appendAuditEvent, AuditAction } from '../audit/append.js';
import { ApiError } from '../http/api-error.js';
import { validateBody } from '../http/validate-body.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { cleanText, dateField, emailField, phoneField, PROFESSIONAL_STATUSES } from '../intake/submission-schema.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';

const fields = [
  'name', 'surname', 'birthDate', 'placeOfBirth', 'phone', 'email',
  'professionalStatus', 'employedAt', 'confirmedAt', 'qualifications',
] as const;
type EditableField = typeof fields[number];
const nullableDate = dateField.nullable();
const patchSchema = z.object({
  name: cleanText(100, true).optional(),
  surname: cleanText(100, true).optional(),
  birthDate: nullableDate.optional(),
  placeOfBirth: cleanText(150, true).nullable().optional(),
  phone: phoneField.nullable().optional(),
  email: emailField.nullable().optional(),
  professionalStatus: z.enum(PROFESSIONAL_STATUSES).nullable().optional(),
  employedAt: nullableDate.optional(),
  confirmedAt: nullableDate.optional(),
  qualifications: cleanText(1000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'يلزم حقل واحد على الأقل.' });
type Patch = z.infer<typeof patchSchema>;

const notFound = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
const invalidDate = (field: string) => new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { [field]: ['تاريخ غير صالح.'] });
const toCalendar = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;
const toDate = (value: string | null) => value === null ? null : new Date(`${value}T00:00:00.000Z`);

function validateResultingDates(teacher: Teacher, patch: Patch): void {
  const today = new Date().toISOString().slice(0, 10);
  const birthDate = patch.birthDate === undefined ? toCalendar(teacher.birthDate) : patch.birthDate;
  const employedAt = patch.employedAt === undefined ? toCalendar(teacher.employedAt) : patch.employedAt;
  const confirmedAt = patch.confirmedAt === undefined ? toCalendar(teacher.confirmedAt) : patch.confirmedAt;
  if (birthDate && birthDate > today) throw invalidDate('birthDate');
  if (employedAt && (employedAt > today || (birthDate && employedAt <= birthDate))) throw invalidDate('employedAt');
  if (confirmedAt && (confirmedAt > today || (employedAt && confirmedAt < employedAt))) throw invalidDate('confirmedAt');
}

async function readProfile(database: Pick<PrismaClient, 'teacher'>, id: string) {
  const teacher = await database.teacher.findUnique({
    where: { id },
    include: { acceptedSubmission: { select: { districtId: true, status: true, submittedProfile: true } } },
  });
  if (!teacher) throw notFound();
  const { acceptedSubmission, ...current } = teacher;
  const source = acceptedSubmission?.status === 'ACCEPTED' && acceptedSubmission.districtId === current.districtId
    ? acceptedSubmission.submittedProfile : null;
  const declaredInstitutions = source && typeof source === 'object' && !Array.isArray(source)
    && typeof source.primaryInstitutionName === 'string'
    ? {
      primaryInstitutionName: source.primaryInstitutionName,
      additionalInstitutionNames: Array.isArray(source.additionalInstitutionNames)
        ? source.additionalInstitutionNames.filter((name): name is string => typeof name === 'string') : [],
    }
    : null;
  return {
    ...current,
    birthDate: toCalendar(current.birthDate),
    employedAt: toCalendar(current.employedAt),
    confirmedAt: toCalendar(current.confirmedAt),
    declaredInstitutions,
  };
}

export function registerTeacherProfileRoutes(app: Express, database: PrismaClient, requireInspector: RequestHandler): void {
  app.use('/api/v1/teachers/:id', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  }, requireInspector);

  app.get('/api/v1/teachers/:id', async (request, response) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { id: ['قيمة غير صالحة.'] });
    const profile = await readProfile(database, id.data);
    await requireInspectorDistrictMembership(database, response.locals.inspectorId as string, profile.districtId);
    response.json({ data: profile });
  });

  app.patch('/api/v1/teachers/:id', validateBody(patchSchema), async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { id: ['قيمة غير صالحة.'] });
    const patch = request.body as Patch;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    await database.$transaction(async (transaction) => {
      // Lock the row before comparing and validating the merged state.
      await transaction.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${id.data}::uuid FOR UPDATE`;
      const teacher = await transaction.teacher.findUnique({ where: { id: id.data } });
      if (!teacher) throw notFound();
      await requireInspectorDistrictMembership(transaction, inspectorId, teacher.districtId);
      validateResultingDates(teacher, patch);

      const changed: Partial<Record<EditableField, string | Date | null>> = {};
      for (const field of fields) {
        const value = patch[field];
        if (value === undefined) continue;
        const existing = field === 'birthDate' || field === 'employedAt' || field === 'confirmedAt'
          ? toCalendar(teacher[field]) : teacher[field];
        if (value !== existing) changed[field] = field === 'birthDate' || field === 'employedAt' || field === 'confirmedAt'
          ? toDate(value) : value;
      }
      const changedFields = Object.keys(changed).sort() as EditableField[];
      if (changedFields.length === 0) return;
      await transaction.teacher.update({ where: { id: teacher.id }, data: changed as Prisma.TeacherUpdateInput });
      await appendAuditEvent(transaction, {
        source: 'HTTP', actorInspectorId: inspectorId, districtId: teacher.districtId,
        action: AuditAction.TEACHER_PROFILE_UPDATED, entityType: 'Teacher', entityId: teacher.id,
        requestId, metadata: { changedFields },
      });
    });
    const profile = await readProfile(database, id.data);
    response.json({ data: profile });
  });
}
