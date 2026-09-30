import { Prisma, type PrismaClient } from '@prisma/client';
import type { Express, Request, RequestHandler } from 'express';
import { z } from 'zod';
import { appendAuditEvent, AuditAction } from '../audit/append.js';
import { ApiError } from '../http/api-error.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';
import {
  INSPECTOR_VISIT_REPORT_TYPE, INSPECTOR_VISIT_TEMPLATE_SOURCE, INSPECTOR_VISIT_TEMPLATE_VERSION,
  inspectorVisitV1Criteria, inspectorVisitV1CriterionKeySet,
} from './inspector-visit-v1.js';

const uuid = z.string().uuid();
const reportPath = '/api/v1/visits/:id/report';
const inspectorVisitPath = '/api/v1/visits/:id/inspector-visit-report';
const reportIdPath = '/api/v1/reports/:id/finalize';
const criterionDictionaryPath = '/api/v1/report-templates/inspector-visit/v1';
const codePointLength = (value: string) => Array.from(value).length;
// The contract explicitly rejects C0/C1 controls while allowing LF in prose.
// eslint-disable-next-line no-control-regex
const controls = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u2028\u2029]/u;

function shortText(max: number) {
  return z.string().transform((value) => value.normalize('NFC').trim().replace(/\s+/gu, ' '))
    .refine((value) => !controls.test(value) && codePointLength(value) >= 1 && codePointLength(value) <= max, 'قيمة غير صالحة.');
}
function proseText() {
  return z.string().transform((value) => value.normalize('NFC').replace(/\r\n?/gu, '\n').trim())
    .refine((value) => !controls.test(value) && codePointLength(value) >= 1 && codePointLength(value) <= 4000, 'قيمة غير صالحة.');
}
const nullable = <T extends z.ZodType>(schema: T) => schema.nullable();
const saveSchema = z.object({
  expectedRevision: z.number().int().positive().nullable(),
  levelClass: nullable(shortText(100)), lessonTopic: nullable(shortText(200)),
  pedagogicalObservations: nullable(proseText()), strengths: nullable(proseText()),
  improvementAreas: nullable(proseText()), guidanceRecommendations: nullable(proseText()),
  inspectorConclusion: nullable(proseText()),
}).strict();
const finalizeSchema = z.object({ expectedRevision: z.number().int().positive() }).strict();
const v1ShortFields = {
  educationDirectorateText: 150, administrativeDivisionText: 150, teacherClassificationText: 100,
  teacherGradeText: 100, teacherNationalityText: 100, teacherEffectiveDateText: 100,
  teacherLastInspectionText: 150, teacherAppointmentText: 150, teacherProfessionalFrameworkText: 100,
  actualLessonDurationText: 100, lessonObjective: 200, generalAssessmentText: 200, markText: 100,
  markWordsText: 200,
} as const;
const v1ProseFields = ['pedagogicalGuidanceText', 'practicalGuidanceText', 'visitStrengthsText', 'visitImprovementAreasText', 'tenureConclusionText'] as const;
const markInput = z.string().regex(/^(?:0|[1-9]\d?)(?:\.\d{1,2})?$/u, 'قيمة غير صالحة.').nullable();
const v1FieldsSchema = z.object({
  educationDirectorateText: nullable(shortText(150)), administrativeDivisionText: nullable(shortText(150)),
  teacherClassificationText: nullable(shortText(100)), teacherGradeText: nullable(shortText(100)),
  teacherNationalityText: nullable(shortText(100)), teacherEffectiveDateText: nullable(shortText(100)),
  teacherLastInspectionText: nullable(shortText(150)), teacherAppointmentText: nullable(shortText(150)),
  teacherProfessionalFrameworkText: nullable(shortText(100)), actualLessonDurationText: nullable(shortText(100)),
  studentCount: z.number().int().nonnegative().nullable(),
  studentsPresentCount: z.number().int().nonnegative().nullable(),
  studentsAbsentCount: z.number().int().nonnegative().nullable(),
  lessonObjective: nullable(shortText(200)),
  pedagogicalGuidanceText: nullable(proseText()), practicalGuidanceText: nullable(proseText()),
  visitStrengthsText: nullable(proseText()), visitImprovementAreasText: nullable(proseText()),
  tenureConclusionText: nullable(proseText()), generalAssessmentText: nullable(shortText(200)),
  markText: nullable(shortText(100)), markWordsText: nullable(shortText(200)),
  pedagogicalMark: markInput,
}).strict();
const observationSchema = z.object({ criterionKey: z.string(), valueText: shortText(200) }).strict();
const v1SaveSchema = z.object({
  expectedRevision: z.number().int().positive().nullable(),
  levelClass: nullable(shortText(100)), lessonTopic: nullable(shortText(200)),
  inspectorConclusion: nullable(proseText()),
  inspectorVisitV1: v1FieldsSchema,
  observations: z.array(observationSchema).max(inspectorVisitV1Criteria.length),
}).strict().superRefine((input, ctx) => {
  const seen = new Set<string>();
  input.observations.forEach((observation, index) => {
    if (seen.has(observation.criterionKey) || !inspectorVisitV1CriterionKeySet.has(observation.criterionKey)) {
      ctx.addIssue({ code: 'custom', path: ['observations', index, 'criterionKey'], message: 'قيمة غير صالحة.' });
    }
    seen.add(observation.criterionKey);
  });
});
type Content = Omit<z.infer<typeof saveSchema>, 'expectedRevision'>;
const contentKeys = ['levelClass', 'lessonTopic', 'pedagogicalObservations', 'strengths', 'improvementAreas', 'guidanceRecommendations', 'inspectorConclusion'] as const;

function hasDuplicateJsonKeys(raw: string | undefined): boolean {
  if (!raw) return false;
  let index = 0;
  const whitespace = () => { while (/\s/u.test(raw[index] ?? '')) index += 1; };
  const stringValue = (): string => {
    const start = index++;
    while (index < raw.length) {
      if (raw[index] === '\\') { index += 2; continue; }
      if (raw[index++] === '"') break;
    }
    return JSON.parse(raw.slice(start, index)) as string;
  };
  const value = (): boolean => {
    whitespace();
    if (raw[index] === '{') {
      index += 1; whitespace(); const keys = new Set<string>();
      if (raw[index] === '}') { index += 1; return false; }
      while (index < raw.length) {
        whitespace(); const key = stringValue();
        if (keys.has(key)) return true;
        keys.add(key); whitespace(); index += 1; whitespace();
        if (value()) return true;
        whitespace(); if (raw[index] === '}') { index += 1; return false; }
        index += 1;
      }
    } else if (raw[index] === '[') {
      index += 1; whitespace(); if (raw[index] === ']') { index += 1; return false; }
      while (index < raw.length) { if (value()) return true; whitespace(); if (raw[index] === ']') { index += 1; return false; } index += 1; }
    } else if (raw[index] === '"') { stringValue(); }
    else { while (index < raw.length && !/[\s,\]}]/u.test(raw[index] ?? '')) index += 1; }
    return false;
  };
  return value();
}
function rejectDuplicateKeys(request: Request & { rawBody?: string }) {
  if (hasDuplicateJsonKeys(request.rawBody)) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { _form: ['قيمة غير صالحة.'] });
}

const notFound = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
const stateConflict = () => new ApiError(409, 'REPORT_STATE_CONFLICT', 'لا يمكن تنفيذ العملية على حالة التقرير الحالية.');
const revisionConflict = () => new ApiError(409, 'REPORT_REVISION_CONFLICT', 'تغير التقرير منذ تحميله. حدّث البيانات وراجعها قبل المتابعة.');

function validationError(error: z.ZodError) {
  const fields = error.issues.reduce<Record<string, string[]>>((result, issue) => {
    const key = issue.path.join('.') || '_form';
    (result[key] ??= []).push('قيمة غير صالحة.');
    return result;
  }, {});
  throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', fields);
}

type ReportDb = Pick<PrismaClient, 'pedagogicalVisit' | 'inspectorDistrictMembership' | 'inspectionReport' | 'inspectionReportObservation' | 'teacher' | 'inspector' | 'district' | 'institution'>;
async function scopedVisit(database: ReportDb, visitId: string, inspectorId: string) {
  const visit = await database.pedagogicalVisit.findFirst({
    where: { id: visitId, inspectorId },
    select: { id: true, districtId: true, inspectorId: true, teacherId: true, status: true, academicYear: true,
      visitType: true, scheduledStartAt: true, scheduledEndAt: true, actualStartAt: true, actualEndAt: true,
      occurredAt: true, institutionId: true, institutionNameSnapshot: true },
  });
  if (!visit) throw notFound();
  await requireInspectorDistrictMembership(database, inspectorId, visit.districtId);
  return visit;
}

async function fullRead(database: ReportDb, reportId: string, inspectorId: string) {
  const row = await database.inspectionReport.findUnique({
    where: { id: reportId },
    include: { visit: { include: {
      teacher: { select: { id: true, name: true, surname: true, birthDate: true, placeOfBirth: true, qualifications: true } },
      district: { select: { name: true } }, institution: { select: { id: true, name: true, municipality: true } },
    } }, observations: { select: { criterionKey: true, valueText: true } } },
  });
  if (!row || row.visit.inspectorId !== inspectorId) throw notFound();
  await requireInspectorDistrictMembership(database, inspectorId, row.visit.districtId);
  const [currentInspector] = await Promise.all([
    row.status === 'DRAFT' ? database.inspector.findUnique({ where: { id: inspectorId }, select: { name: true, surname: true } }) : Promise.resolve(null),
  ]);
  const teacher = row.visit.teacher;
  if (!teacher) throw notFound();
  const common = {
    id: row.id, visitId: row.visitId, reportType: row.reportType, templateSource: row.templateSource,
    templateVersion: row.templateVersion, status: row.status, revision: row.revision,
    levelClass: row.levelClass, lessonTopic: row.lessonTopic, pedagogicalObservations: row.pedagogicalObservations,
    strengths: row.strengths, improvementAreas: row.improvementAreas, guidanceRecommendations: row.guidanceRecommendations,
    inspectorConclusion: row.inspectorConclusion, finalizedAt: row.finalizedAt?.toISOString() ?? null,
    finalizedByInspectorId: row.finalizedByInspectorId,
    finalizedInspectorNameSnapshot: row.finalizedInspectorNameSnapshot,
    finalizedInspectorSurnameSnapshot: row.finalizedInspectorSurnameSnapshot,
    finalizedTeacherNameSnapshot: row.finalizedTeacherNameSnapshot,
    finalizedTeacherSurnameSnapshot: row.finalizedTeacherSurnameSnapshot,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    displayIdentity: row.status === 'FINAL'
      ? { inspector: { name: row.finalizedInspectorNameSnapshot!, surname: row.finalizedInspectorSurnameSnapshot! }, teacher: { name: row.finalizedTeacherNameSnapshot!, surname: row.finalizedTeacherSurnameSnapshot! } }
      : { inspector: currentInspector?.name && currentInspector.surname ? { name: currentInspector.name, surname: currentInspector.surname } : null, teacher: { name: teacher.name, surname: teacher.surname } },
    visit: { id: row.visit.id, status: row.visit.status, academicYear: row.visit.academicYear,
      scheduledStartAt: row.visit.scheduledStartAt?.toISOString() ?? null, scheduledEndAt: row.visit.scheduledEndAt?.toISOString() ?? null,
      occurredAt: row.visit.occurredAt?.toISOString() ?? null,
      institution: { id: row.visit.institutionId, name: row.visit.institutionNameSnapshot }, teacher: { id: teacher.id } },
  };
  if (row.reportType !== INSPECTOR_VISIT_REPORT_TYPE) return common;
  const v1Data = Object.fromEntries([
    ...Object.keys(v1ShortFields), 'studentCount', 'studentsPresentCount', 'studentsAbsentCount',
    ...v1ProseFields, 'pedagogicalMark',
  ].map((key) => [key, row[key as keyof typeof row]]));
  const decimal = row.pedagogicalMark?.toFixed(2) ?? null;
  const canonicalMark = decimal?.includes('.') ? decimal.replace(/0+$/u, '').replace(/\.$/u, '') : decimal;
  const criteriaIndex = new Map<string, number>(inspectorVisitV1Criteria.map((item, index) => [item.criterionKey, index]));
  const observations = [...row.observations].sort((left, right) => (criteriaIndex.get(left.criterionKey) ?? 999) - (criteriaIndex.get(right.criterionKey) ?? 999));
  const finalized = row.status === 'FINAL';
  return {
    ...common,
    visit: { ...common.visit, visitType: row.visit.visitType,
      actualStartAt: row.visit.actualStartAt?.toISOString() ?? null, actualEndAt: row.visit.actualEndAt?.toISOString() ?? null,
      intervalKind: row.visit.actualStartAt ? 'ACTUAL_RETROSPECTIVE' : 'SCHEDULED' },
    inspectorVisitV1: { ...v1Data, pedagogicalMark: canonicalMark, observations },
    displayContext: {
      teacherBirthDate: finalized ? row.finalizedTeacherBirthDateSnapshot?.toISOString().slice(0, 10) ?? null : teacher.birthDate?.toISOString().slice(0, 10) ?? null,
      teacherPlaceOfBirth: finalized ? row.finalizedTeacherPlaceOfBirthSnapshot : teacher.placeOfBirth,
      teacherQualifications: finalized ? row.finalizedTeacherQualificationsSnapshot : teacher.qualifications,
      districtName: finalized ? row.finalizedDistrictNameSnapshot : row.visit.district.name,
      institutionMunicipality: finalized ? row.finalizedInstitutionMunicipalitySnapshot : row.visit.institution.municipality,
      visitType: row.visit.visitType,
    },
  };
}

function dataContent(input: Content) {
  return Object.fromEntries(contentKeys.map((key) => [key, input[key]])) as Pick<Content, typeof contentKeys[number]>;
}
function sameContent(left: Content, right: Content): boolean {
  return contentKeys.every((key) => left[key] === right[key]);
}

const v1ObservationValues = (items: Array<{ criterionKey: string; valueText: string }>) =>
  [...items].sort((left, right) => (left.criterionKey < right.criterionKey ? -1 : left.criterionKey > right.criterionKey ? 1 : 0));
function validateV1Applicability(input: z.infer<typeof v1SaveSchema>, visitType: string) {
  const fields: Record<string, string[]> = {};
  const invalid = (key: string) => { fields[`inspectorVisitV1.${key}`] = ['هذه القيمة لا تنطبق على نوع الزيارة.']; };
  const v1 = input.inspectorVisitV1;
  if (v1.tenureConclusionText !== null && visitType !== 'TENURE_CONFIRMATION') invalid('tenureConclusionText');
  if (v1.pedagogicalMark !== null) {
    const mark = new Prisma.Decimal(v1.pedagogicalMark);
    if (visitType !== 'PROMOTION_EVALUATION' || mark.lt(0) || mark.gt(20)) invalid('pedagogicalMark');
  }
  if (visitType === 'PROMOTION_EVALUATION' && (v1.markText !== null || v1.markWordsText !== null)) {
    invalid(v1.markText !== null ? 'markText' : 'markWordsText');
  }
  const { studentCount, studentsPresentCount: present, studentsAbsentCount: absent } = v1;
  if (studentCount !== null && present !== null && present > studentCount) invalid('studentsPresentCount');
  if (studentCount !== null && absent !== null && absent > studentCount) invalid('studentsAbsentCount');
  if (studentCount !== null && present !== null && absent !== null && present + absent !== studentCount) invalid('studentsAbsentCount');
  if (Object.keys(fields).length) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', fields);
}

function validateStoredV1Applicability(report: Prisma.InspectionReportGetPayload<object>, visitType: string) {
  const fields: Record<string, string[]> = {};
  const invalid = (key: string) => { fields[`inspectorVisitV1.${key}`] = ['هذه القيمة لا تنطبق على نوع الزيارة.']; };
  if (report.tenureConclusionText !== null && visitType !== 'TENURE_CONFIRMATION') invalid('tenureConclusionText');
  if (report.pedagogicalMark !== null && (visitType !== 'PROMOTION_EVALUATION' || report.pedagogicalMark.lt(0) || report.pedagogicalMark.gt(20))) invalid('pedagogicalMark');
  if (visitType === 'PROMOTION_EVALUATION' && (report.markText !== null || report.markWordsText !== null)) invalid(report.markText !== null ? 'markText' : 'markWordsText');
  if (report.studentCount !== null && report.studentsPresentCount !== null && report.studentsPresentCount > report.studentCount) invalid('studentsPresentCount');
  if (report.studentCount !== null && report.studentsAbsentCount !== null && report.studentsAbsentCount > report.studentCount) invalid('studentsAbsentCount');
  if (report.studentCount !== null && report.studentsPresentCount !== null && report.studentsAbsentCount !== null && report.studentsPresentCount + report.studentsAbsentCount !== report.studentCount) invalid('studentsAbsentCount');
  if (Object.keys(fields).length) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', fields);
}

function v1DbData(input: z.infer<typeof v1SaveSchema>) {
  const fields: Record<string, unknown> = { ...input.inspectorVisitV1,
    pedagogicalMark: input.inspectorVisitV1.pedagogicalMark === null ? null : new Prisma.Decimal(input.inspectorVisitV1.pedagogicalMark) };
  return { levelClass: input.levelClass, lessonTopic: input.lessonTopic, inspectorConclusion: input.inspectorConclusion, ...fields } as Record<string, unknown>;
}

function sameV1Content(existing: Record<string, unknown> & { observations: Array<{ criterionKey: string; valueText: string }> }, input: z.infer<typeof v1SaveSchema>) {
  const next = v1DbData(input);
  const sameColumns = Object.keys(next).every((key) => {
    const before = existing[key]; const after = next[key];
    if (key === 'pedagogicalMark') return before === null && after === null || before instanceof Prisma.Decimal && after instanceof Prisma.Decimal && before.eq(after);
    return before === after;
  });
  return sameColumns && JSON.stringify(v1ObservationValues(existing.observations)) === JSON.stringify(v1ObservationValues(input.observations));
}

export function registerInspectionReportRoutes(app: Express, database: PrismaClient, requireInspector: RequestHandler): void {
  app.use('/api/v1/visits/:id/report', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(inspectorVisitPath, (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api/v1/reports/:id/finalize', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(criterionDictionaryPath, (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });

  app.get(criterionDictionaryPath, requireInspector, (_request, response) => {
    response.json({ data: { reportType: INSPECTOR_VISIT_REPORT_TYPE, templateSource: INSPECTOR_VISIT_TEMPLATE_SOURCE,
      templateVersion: INSPECTOR_VISIT_TEMPLATE_VERSION, criteria: inspectorVisitV1Criteria } });
  });

  app.get(reportPath, requireInspector, async (request, response) => {
    const visitId = String(request.params.id);
    if (!uuid.safeParse(visitId).success) throw new ApiError(400, 'VALIDATION_ERROR', 'معرّف غير صالح.');
    const inspectorId = response.locals.inspectorId as string;
    const visit = await scopedVisit(database, visitId, inspectorId);
    const report = await database.inspectionReport.findUnique({ where: { visitId: visit.id }, select: { id: true } });
    response.json({ data: { report: report ? await fullRead(database, report.id, inspectorId) : null } });
  });

  app.put(reportPath, requireInspector, async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    rejectDuplicateKeys(request as Request & { rawBody?: string });
    const visitId = String(request.params.id);
    if (!uuid.safeParse(visitId).success) throw new ApiError(400, 'VALIDATION_ERROR', 'معرّف غير صالح.');
    const parsed = saveSchema.safeParse(request.body);
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;
    const inspectorId = response.locals.inspectorId as string;
    let created = false;
    try {
      await database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "PedagogicalVisit" WHERE "id" = ${visitId}::uuid FOR UPDATE`;
        const visit = await scopedVisit(tx, visitId, inspectorId);
        if (visit.visitType !== null) throw new ApiError(409, 'REPORT_TYPE_CONFLICT', 'هذا النوع من الزيارات يحتاج مسار تقريره المعتمد.');
        if (visit.status === 'CANCELLED') throw stateConflict();
        const existing = await tx.inspectionReport.findUnique({ where: { visitId: visit.id } });
        if (existing?.status === 'FINAL') throw stateConflict();
        if (!existing) {
          if (input.expectedRevision !== null) throw revisionConflict();
          await tx.inspectionReport.create({ data: { visitId: visit.id, ...dataContent(input) } });
          created = true;
          return;
        }
        if (input.expectedRevision === null || input.expectedRevision !== existing.revision) throw revisionConflict();
        const previous = Object.fromEntries(contentKeys.map((key) => [key, existing[key]])) as Content;
        const next = dataContent(input) as Content;
        if (sameContent(previous, next)) return;
        const changed = await tx.inspectionReport.updateMany({
          where: { id: existing.id, status: 'DRAFT', revision: input.expectedRevision },
          data: { ...next, revision: { increment: 1 } },
        });
        if (changed.count !== 1) throw revisionConflict();
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw revisionConflict();
      throw error;
    }
    const visit = await scopedVisit(database, visitId, inspectorId);
    const report = await database.inspectionReport.findUniqueOrThrow({ where: { visitId: visit.id }, select: { id: true } });
    response.status(created ? 201 : 200).json({ data: { report: await fullRead(database, report.id, inspectorId) } });
  });

  app.put(inspectorVisitPath, requireInspector, async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    rejectDuplicateKeys(request as Request & { rawBody?: string });
    const visitId = String(request.params.id);
    if (!uuid.safeParse(visitId).success) throw new ApiError(400, 'VALIDATION_ERROR', 'معرّف غير صالح.');
    const parsed = v1SaveSchema.safeParse(request.body);
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;
    const inspectorId = response.locals.inspectorId as string;
    let created = false;
    try {
      await database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "PedagogicalVisit" WHERE "id" = ${visitId}::uuid FOR UPDATE`;
        const visit = await scopedVisit(tx, visitId, inspectorId);
        if (visit.visitType === null) throw new ApiError(409, 'REPORT_TYPE_CONFLICT', 'هذه الزيارة لا تملك نوعًا محددًا لمسار التقرير الجديد.');
        validateV1Applicability(input, visit.visitType);
        if (visit.status === 'CANCELLED') throw stateConflict();
        const existing = await tx.inspectionReport.findUnique({ where: { visitId: visit.id }, include: { observations: { select: { criterionKey: true, valueText: true } } } });
        if (existing?.reportType !== undefined && existing.reportType !== INSPECTOR_VISIT_REPORT_TYPE) {
          throw new ApiError(409, 'REPORT_TYPE_CONFLICT', 'يوجد تقرير سابق محفوظ لهذا النوع من الزيارة.');
        }
        if (existing?.status === 'FINAL') throw stateConflict();
        if (!existing) {
          if (input.expectedRevision !== null) throw revisionConflict();
          const data = v1DbData(input) as Prisma.InspectionReportUncheckedCreateInput;
          await tx.inspectionReport.create({ data: {
            ...data,
            visitId: visit.id, reportType: INSPECTOR_VISIT_REPORT_TYPE,
            templateSource: INSPECTOR_VISIT_TEMPLATE_SOURCE, templateVersion: INSPECTOR_VISIT_TEMPLATE_VERSION,
            observations: { create: input.observations },
          } });
          created = true;
          return;
        }
        if (input.expectedRevision === null || input.expectedRevision !== existing.revision) throw revisionConflict();
        if (sameV1Content(existing as unknown as Record<string, unknown> & { observations: Array<{ criterionKey: string; valueText: string }> }, input)) return;
        const changed = await tx.inspectionReport.updateMany({
          where: { id: existing.id, reportType: INSPECTOR_VISIT_REPORT_TYPE, status: 'DRAFT', revision: input.expectedRevision },
          data: { ...v1DbData(input), revision: { increment: 1 }, updatedAt: new Date() } as Prisma.InspectionReportUpdateManyMutationInput,
        });
        if (changed.count !== 1) throw revisionConflict();
        await tx.inspectionReportObservation.deleteMany({ where: { reportId: existing.id } });
        if (input.observations.length) {
          await tx.inspectionReportObservation.createMany({ data: input.observations.map((item) => ({
            reportId: existing.id, reportType: INSPECTOR_VISIT_REPORT_TYPE,
            templateVersion: INSPECTOR_VISIT_TEMPLATE_VERSION, criterionKey: item.criterionKey, valueText: item.valueText,
          })) });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw revisionConflict();
      throw error;
    }
    const visit = await scopedVisit(database, visitId, inspectorId);
    const report = await database.inspectionReport.findUniqueOrThrow({ where: { visitId: visit.id }, select: { id: true } });
    response.status(created ? 201 : 200).json({ data: { report: await fullRead(database, report.id, inspectorId) } });
  });

  app.post(reportIdPath, requireInspector, async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    rejectDuplicateKeys(request as Request & { rawBody?: string });
    const reportId = String(request.params.id);
    if (!uuid.safeParse(reportId).success) throw new ApiError(400, 'VALIDATION_ERROR', 'معرّف غير صالح.');
    const parsed = finalizeSchema.safeParse(request.body);
    if (!parsed.success) return validationError(parsed.error);
    const inspectorId = response.locals.inspectorId as string;
    const found = await database.inspectionReport.findUnique({ where: { id: reportId }, select: { visitId: true } });
    if (!found) throw notFound();
    try {
      await database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "PedagogicalVisit" WHERE "id" = ${found.visitId}::uuid FOR UPDATE`;
        const visit = await scopedVisit(tx, found.visitId, inspectorId);
        const report = await tx.inspectionReport.findUnique({ where: { id: reportId } });
        if (!report) throw notFound();
        if (report.reportType === INSPECTOR_VISIT_REPORT_TYPE && visit.visitType === null) throw new ApiError(409, 'REPORT_TYPE_CONFLICT', 'نوع الزيارة غير متاح لمسار التقرير.');
        if (report.status === 'FINAL') throw revisionConflict();
        if (visit.status !== 'COMPLETED') throw stateConflict();
        if (report.revision !== parsed.data.expectedRevision) throw revisionConflict();
        const missing = (['levelClass', 'lessonTopic', 'inspectorConclusion'] as const).filter((key) => !report[key]?.trim());
        if (missing.length) throw new ApiError(400, 'VALIDATION_ERROR', 'أكمل الحقول المطلوبة لإتمام التقرير.', Object.fromEntries(missing.map((key) => [key, ['هذا الحقل مطلوب.']])));
        if (report.reportType === INSPECTOR_VISIT_REPORT_TYPE) validateStoredV1Applicability(report, visit.visitType!);
        await tx.$queryRaw`SELECT "id" FROM "Inspector" WHERE "id" = ${inspectorId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Teacher" WHERE "id" = ${visit.teacherId}::uuid FOR UPDATE`;
        if (report.reportType === INSPECTOR_VISIT_REPORT_TYPE) {
          await tx.$queryRaw`SELECT "id" FROM "District" WHERE "id" = ${visit.districtId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT "id" FROM "Institution" WHERE "id" = ${visit.institutionId}::uuid FOR UPDATE`;
        }
        const [inspector, teacher] = await Promise.all([
          tx.inspector.findUnique({ where: { id: inspectorId }, select: { name: true, surname: true, status: true } }),
          tx.teacher.findUnique({ where: { id: visit.teacherId }, select: { name: true, surname: true, birthDate: true, placeOfBirth: true, qualifications: true } }),
        ]);
        if (!inspector || inspector.status !== 'ACTIVE') throw notFound();
        if (!inspector.name || !inspector.surname) throw new ApiError(409, 'INSPECTOR_PROFESSIONAL_IDENTITY_REQUIRED', 'أكمل الهوية المهنية قبل إتمام التقرير.');
        if (!teacher) throw notFound();
        const [district, institution] = report.reportType === INSPECTOR_VISIT_REPORT_TYPE
          ? await Promise.all([
            tx.district.findUnique({ where: { id: visit.districtId }, select: { name: true } }),
            tx.institution.findFirst({ where: { id: visit.institutionId, districtId: visit.districtId }, select: { municipality: true } }),
          ])
          : [null, null];
        if (report.reportType === INSPECTOR_VISIT_REPORT_TYPE && (!district || !institution)) throw notFound();
        const v1Snapshots = report.reportType === INSPECTOR_VISIT_REPORT_TYPE ? {
          finalizedTeacherBirthDateSnapshot: teacher.birthDate,
          finalizedTeacherPlaceOfBirthSnapshot: teacher.placeOfBirth,
          finalizedTeacherQualificationsSnapshot: teacher.qualifications,
          finalizedDistrictNameSnapshot: district!.name,
          finalizedInstitutionMunicipalitySnapshot: institution!.municipality,
        } : {};
        const changed = await tx.inspectionReport.updateMany({
          where: { id: report.id, status: 'DRAFT', revision: parsed.data.expectedRevision },
          data: { status: 'FINAL', finalizedAt: new Date(), finalizedByInspectorId: inspectorId,
            finalizedInspectorNameSnapshot: inspector.name, finalizedInspectorSurnameSnapshot: inspector.surname,
            finalizedTeacherNameSnapshot: teacher.name, finalizedTeacherSurnameSnapshot: teacher.surname,
            ...v1Snapshots,
            revision: { increment: 1 } },
        });
        if (changed.count !== 1) throw revisionConflict();
        await appendAuditEvent(tx, { source: 'HTTP', actorInspectorId: inspectorId, districtId: visit.districtId,
          action: AuditAction.INSPECTION_REPORT_FINALIZED, entityType: 'InspectionReport', entityId: report.id,
          requestId: (response.locals.requestId as string | undefined) ?? null, metadata: {} });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw revisionConflict();
      throw error;
    }
    response.json({ data: { report: await fullRead(database, reportId, inspectorId) } });
  });
}
