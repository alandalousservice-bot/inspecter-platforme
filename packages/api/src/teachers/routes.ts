import type { Express, RequestHandler } from 'express';
import { Prisma, type PrismaClient, type Teacher } from '@prisma/client';
import { z } from 'zod';
import { appendAuditEvent, AuditAction } from '../audit/append.js';
import { ApiError } from '../http/api-error.js';
import { validateBody } from '../http/validate-body.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { cleanText, dateField, directorPhoneField, emailField, phoneField, PROFESSIONAL_STATUSES } from '../intake/submission-schema.js';
import { projectDeclaredWorkplace } from '../intake/declared-workplace.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';
import { algiersCalendarDate } from './supplementary-workplaces-domain.js';

const fields = [
  'name', 'surname', 'birthDate', 'placeOfBirth', 'phone', 'email',
  'professionalStatus', 'employedAt', 'confirmedAt', 'qualifications',
  'professionalFramework', 'firstEducationAppointmentDate', 'firstEducationAppointmentDecisionNumber',
  'firstInstallationDate', 'traineeshipDate', 'institutionAppointmentDate', 'institutionAppointmentNumber',
  'financialControllerVisaNumber', 'administrativeCategory', 'administrativeSection', 'administrativeGrade',
  'administrativeClassificationEffectiveDate', 'birthProvince', 'personalAddress', 'administrativeNote',
] as const;
type EditableField = typeof fields[number];
const nullableDate = dateField.nullable();
const administrativeText = (maximum: number, multiline = false) => z.string().transform((raw, context) => {
  const invalidRawControl = [...raw].some((character) => /[\p{Cc}]/u.test(character) && !(multiline && (character === '\n' || character === '\r')));
  let value = raw.normalize('NFC');
  value = multiline ? value.replace(/\r\n?/gu, '\n').trim() : value.trim().replace(/\s+/gu, ' ');
  if (invalidRawControl || !value || Array.from(value).length > maximum) {
    context.addIssue({ code: 'custom', message: 'قيمة غير صالحة.' });
    return z.NEVER;
  }
  return value;
});
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
  professionalFramework: administrativeText(120).nullable().optional(),
  firstEducationAppointmentDate: nullableDate.optional(),
  firstEducationAppointmentDecisionNumber: administrativeText(120).nullable().optional(),
  firstInstallationDate: nullableDate.optional(),
  traineeshipDate: nullableDate.optional(),
  institutionAppointmentDate: nullableDate.optional(),
  institutionAppointmentNumber: administrativeText(120).nullable().optional(),
  financialControllerVisaNumber: administrativeText(120).nullable().optional(),
  administrativeCategory: administrativeText(100).nullable().optional(),
  administrativeSection: administrativeText(100).nullable().optional(),
  administrativeGrade: administrativeText(100).nullable().optional(),
  administrativeClassificationEffectiveDate: nullableDate.optional(),
  birthProvince: administrativeText(100).nullable().optional(),
  personalAddress: administrativeText(300).nullable().optional(),
  administrativeNote: administrativeText(1000, true).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'يلزم حقل واحد على الأقل.' });
type Patch = z.infer<typeof patchSchema>;
const institutionCreateSchema = z.object({
  name: cleanText(200, true),
  municipality: cleanText(150, true).nullable().optional(),
  address: cleanText(300, true).nullable().optional(),
  directorPhone: directorPhoneField.nullable().optional(),
}).strict();
const currentInstitutionMutationSchema = z.union([
  z.object({ expectedInstitutionId: z.string().uuid().nullable(), institutionId: z.string().uuid() }).strict(),
  z.object({ expectedInstitutionId: z.string().uuid().nullable(), createInstitution: institutionCreateSchema }).strict(),
]);
type CurrentInstitutionMutation = z.infer<typeof currentInstitutionMutationSchema>;

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
    include: {
      acceptedSubmission: { select: { districtId: true, status: true, submittedProfile: true } },
      institution: { select: { id: true, name: true, municipality: true, address: true, directorPhone: true } },
    },
  });
  if (!teacher) throw notFound();
  const { acceptedSubmission, institutionId: _institutionId, institution, ...current } = teacher;
  void _institutionId;
  const source = acceptedSubmission?.status === 'ACCEPTED' && acceptedSubmission.districtId === current.districtId
    ? acceptedSubmission.submittedProfile : null;
  const declaredWorkplace = projectDeclaredWorkplace(source);
  const declaredInstitutions = declaredWorkplace ? {
    primaryInstitutionName: declaredWorkplace.institutionName,
    additionalInstitutionNames: declaredWorkplace.legacyAdditionalInstitutionNames,
  } : null;
  return {
    ...current,
    birthDate: toCalendar(current.birthDate),
    employedAt: toCalendar(current.employedAt),
    confirmedAt: toCalendar(current.confirmedAt),
    firstEducationAppointmentDate: toCalendar(current.firstEducationAppointmentDate),
    firstInstallationDate: toCalendar(current.firstInstallationDate),
    traineeshipDate: toCalendar(current.traineeshipDate),
    institutionAppointmentDate: toCalendar(current.institutionAppointmentDate),
    administrativeClassificationEffectiveDate: toCalendar(current.administrativeClassificationEffectiveDate),
    declaredInstitutions,
    declaredWorkplace,
    currentInstitution: institution,
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
      if (teacher.institutionId === null && [patch.institutionAppointmentDate, patch.institutionAppointmentNumber, patch.financialControllerVisaNumber].some((value) => value !== undefined && value !== null)) {
        throw new ApiError(409, 'CONFLICT', 'لا يمكن تسجيل بيانات تعيين المؤسسة قبل اعتماد مؤسسة حالية.');
      }

      const changed: Partial<Record<EditableField, string | Date | null>> = {};
      for (const field of fields) {
        const value = patch[field];
        if (value === undefined) continue;
        const dateFields = ['birthDate', 'employedAt', 'confirmedAt', 'firstEducationAppointmentDate', 'firstInstallationDate', 'traineeshipDate', 'institutionAppointmentDate', 'administrativeClassificationEffectiveDate'];
        const existing = dateFields.includes(field)
          ? toCalendar(teacher[field] as Date | null) : teacher[field];
        if (value !== existing) changed[field] = dateFields.includes(field)
          ? toDate(value as string | null) : value;
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

  app.put('/api/v1/teachers/:id/current-institution', validateBody(currentInstitutionMutationSchema), async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { id: ['قيمة غير صالحة.'] });
    const input = request.body as CurrentInstitutionMutation;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;

    const result = await database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${id.data}::uuid FOR UPDATE`;
      const teacher = await transaction.teacher.findUnique({ where: { id: id.data } });
      if (!teacher) throw notFound();
      await requireInspectorDistrictMembership(transaction, inspectorId, teacher.districtId);
      if (teacher.institutionId !== input.expectedInstitutionId) {
        throw new ApiError(409, 'CONFLICT', 'تغير ملف الأستاذ. أعد تحميله ثم حاول مجددًا.');
      }

      let targetInstitutionId: string;
      let createdInstitution: Awaited<ReturnType<typeof transaction.institution.create>> | undefined;
      if ('createInstitution' in input) {
        createdInstitution = await transaction.institution.create({
          data: { ...input.createInstitution, districtId: teacher.districtId },
        });
        targetInstitutionId = createdInstitution.id;
      } else {
        await transaction.$queryRaw`SELECT id FROM "Institution" WHERE id = ${input.institutionId}::uuid FOR SHARE`;
        const institution = await transaction.institution.findUnique({ where: { id: input.institutionId } });
        if (!institution || institution.districtId !== teacher.districtId) throw notFound();
        await requireInspectorDistrictMembership(transaction, inspectorId, institution.districtId);
        if (institution.archivedAt !== null) {
          throw new ApiError(409, 'CONFLICT', 'لا يمكن ربط مؤسسة مؤرشفة.');
        }
        targetInstitutionId = institution.id;
      }

      if (teacher.institutionId === targetInstitutionId) {
        const currentInstitution = createdInstitution ?? await transaction.institution.findUniqueOrThrow({ where: { id: targetInstitutionId } });
        return {
          teacherId: teacher.id,
          currentInstitution: {
            id: currentInstitution.id, name: currentInstitution.name,
            municipality: currentInstitution.municipality, address: currentInstitution.address,
            directorPhone: currentInstitution.directorPhone,
          },
        };
      }

      const today = new Date(`${algiersCalendarDate()}T00:00:00.000Z`);
      const conflictingSupplementary = await transaction.teacherSupplementaryWorkplace.findFirst({
        where: { teacherId: teacher.id, institutionId: targetInstitutionId, OR: [{ validTo: null }, { validTo: { gt: today } }] },
        select: { id: true },
      });
      if (conflictingSupplementary) {
        throw new ApiError(409, 'CONFLICT', 'أنهِ علاقة تكملة النصاب الحالية أو المستقبلية قبل اعتماد المؤسسة الأم.');
      }

      const homeInstitutionFields = ['institutionAppointmentDate', 'institutionAppointmentNumber', 'financialControllerVisaNumber'] as const;
      const clearedHomeFields = homeInstitutionFields.filter((field) => teacher[field] !== null);
      await transaction.teacher.update({ where: { id: teacher.id }, data: {
        institutionId: targetInstitutionId,
        institutionAppointmentDate: null,
        institutionAppointmentNumber: null,
        financialControllerVisaNumber: null,
      } });
      if (createdInstitution) {
        await appendAuditEvent(transaction, {
          source: 'HTTP', actorInspectorId: inspectorId, districtId: teacher.districtId,
          action: AuditAction.INSTITUTION_CREATED, entityType: 'Institution', entityId: createdInstitution.id,
          requestId, metadata: {},
        });
      }
      await appendAuditEvent(transaction, {
        source: 'HTTP', actorInspectorId: inspectorId, districtId: teacher.districtId,
        action: teacher.institutionId === null ? AuditAction.TEACHER_INSTITUTION_LINKED : AuditAction.TEACHER_INSTITUTION_CHANGED,
        entityType: 'Teacher', entityId: teacher.id, requestId,
        metadata: teacher.institutionId === null
          ? { institutionId: targetInstitutionId }
          : { previousInstitutionId: teacher.institutionId, institutionId: targetInstitutionId },
      });
      if (clearedHomeFields.length) {
        await appendAuditEvent(transaction, {
          source: 'HTTP', actorInspectorId: inspectorId, districtId: teacher.districtId,
          action: AuditAction.TEACHER_PROFILE_UPDATED, entityType: 'Teacher', entityId: teacher.id,
          requestId, metadata: { changedFields: clearedHomeFields.sort() },
        });
      }
      const currentInstitution = createdInstitution ?? await transaction.institution.findUniqueOrThrow({ where: { id: targetInstitutionId } });
      return {
        teacherId: teacher.id,
        currentInstitution: {
          id: currentInstitution.id, name: currentInstitution.name,
          municipality: currentInstitution.municipality, address: currentInstitution.address,
          directorPhone: currentInstitution.directorPhone,
        },
      };
    });

    response.json({ data: result });
  });
}
