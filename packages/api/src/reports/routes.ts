import { Prisma, type PrismaClient } from '@prisma/client';
import type { Express, Request, RequestHandler } from 'express';
import { z } from 'zod';
import { appendAuditEvent, AuditAction } from '../audit/append.js';
import { ApiError } from '../http/api-error.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';

const uuid = z.string().uuid();
const reportPath = '/api/v1/visits/:id/report';
const reportIdPath = '/api/v1/reports/:id/finalize';
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

type ReportDb = Pick<PrismaClient, 'pedagogicalVisit' | 'inspectorDistrictMembership' | 'inspectionReport' | 'teacher' | 'inspector'>;
async function scopedVisit(database: ReportDb, visitId: string, inspectorId: string) {
  const visit = await database.pedagogicalVisit.findFirst({
    where: { id: visitId, inspectorId },
    select: { id: true, districtId: true, inspectorId: true, teacherId: true, status: true, academicYear: true,
      visitType: true, scheduledStartAt: true, scheduledEndAt: true, occurredAt: true, institutionId: true, institutionNameSnapshot: true },
  });
  if (!visit) throw notFound();
  await requireInspectorDistrictMembership(database, inspectorId, visit.districtId);
  return visit;
}

async function fullRead(database: ReportDb, reportId: string, inspectorId: string) {
  const row = await database.inspectionReport.findUnique({
    where: { id: reportId },
    include: { visit: { select: { id: true, districtId: true, inspectorId: true, teacherId: true, status: true,
      academicYear: true, visitType: true, scheduledStartAt: true, scheduledEndAt: true, occurredAt: true,
      institutionId: true, institutionNameSnapshot: true } } },
  });
  if (!row || row.visit.inspectorId !== inspectorId) throw notFound();
  await requireInspectorDistrictMembership(database, inspectorId, row.visit.districtId);
  const [teacher, currentInspector] = await Promise.all([
    database.teacher.findUnique({ where: { id: row.visit.teacherId }, select: { id: true, name: true, surname: true } }),
    row.status === 'DRAFT' ? database.inspector.findUnique({ where: { id: inspectorId }, select: { name: true, surname: true } }) : Promise.resolve(null),
  ]);
  if (!teacher) throw notFound();
  return {
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
      scheduledStartAt: row.visit.scheduledStartAt!.toISOString(), scheduledEndAt: row.visit.scheduledEndAt!.toISOString(),
      occurredAt: row.visit.occurredAt?.toISOString() ?? null,
      institution: { id: row.visit.institutionId, name: row.visit.institutionNameSnapshot }, teacher: { id: teacher.id } },
  };
}

function dataContent(input: Content) {
  return Object.fromEntries(contentKeys.map((key) => [key, input[key]])) as Pick<Content, typeof contentKeys[number]>;
}
function sameContent(left: Content, right: Content): boolean {
  return contentKeys.every((key) => left[key] === right[key]);
}

export function registerInspectionReportRoutes(app: Express, database: PrismaClient, requireInspector: RequestHandler): void {
  app.use('/api/v1/visits/:id/report', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api/v1/reports/:id/finalize', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });

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
        if (report.status === 'FINAL') throw revisionConflict();
        if (visit.status !== 'COMPLETED') throw stateConflict();
        if (report.revision !== parsed.data.expectedRevision) throw revisionConflict();
        const missing = (['levelClass', 'lessonTopic', 'inspectorConclusion'] as const).filter((key) => !report[key]?.trim());
        if (missing.length) throw new ApiError(400, 'VALIDATION_ERROR', 'أكمل الحقول المطلوبة لإتمام التقرير.', Object.fromEntries(missing.map((key) => [key, ['هذا الحقل مطلوب.']])));
        await tx.$queryRaw`SELECT "id" FROM "Inspector" WHERE "id" = ${inspectorId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Teacher" WHERE "id" = ${visit.teacherId}::uuid FOR UPDATE`;
        const [inspector, teacher] = await Promise.all([
          tx.inspector.findUnique({ where: { id: inspectorId }, select: { name: true, surname: true, status: true } }),
          tx.teacher.findUnique({ where: { id: visit.teacherId }, select: { name: true, surname: true } }),
        ]);
        if (!inspector || inspector.status !== 'ACTIVE') throw notFound();
        if (!inspector.name || !inspector.surname) throw new ApiError(409, 'INSPECTOR_PROFESSIONAL_IDENTITY_REQUIRED', 'أكمل الهوية المهنية قبل إتمام التقرير.');
        if (!teacher) throw notFound();
        const changed = await tx.inspectionReport.updateMany({
          where: { id: report.id, status: 'DRAFT', revision: parsed.data.expectedRevision },
          data: { status: 'FINAL', finalizedAt: new Date(), finalizedByInspectorId: inspectorId,
            finalizedInspectorNameSnapshot: inspector.name, finalizedInspectorSurnameSnapshot: inspector.surname,
            finalizedTeacherNameSnapshot: teacher.name, finalizedTeacherSurnameSnapshot: teacher.surname,
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
