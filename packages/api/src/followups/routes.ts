import { Prisma, type PrismaClient } from '@prisma/client';
import type { Express, Request, RequestHandler } from 'express';
import { z } from 'zod';
import { appendAuditEvent, AuditAction } from '../audit/append.js';
import { ApiError } from '../http/api-error.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';

const ROOT = '/api/v1';
const uuid = z.string().uuid();
const positiveRevision = z.number().int().positive();
// Reject C0/C1 and Unicode line/paragraph separators before whitespace normalization.
// eslint-disable-next-line no-control-regex
const controls = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/u;
const codePoints = (value: string) => Array.from(value).length;
const noteSchema = z.string().refine((value) => !controls.test(value), 'invalid').transform((value) => value.normalize('NFC').trim().replace(/\s+/gu, ' ')).refine((value) => codePoints(value) >= 1 && codePoints(value) <= 1000, 'invalid');
const completionNoteSchema = z.string().nullable().refine((value) => value === null || !controls.test(value), 'invalid').transform((value) => value === null ? null : value.normalize('NFC').trim().replace(/\s+/gu, ' ')).refine((value) => value === null || (codePoints(value) >= 1 && codePoints(value) <= 1000), 'invalid');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'invalid').transform((value) => new Date(`${value}T00:00:00.000Z`));
const createSchema = z.object({ note: noteSchema, dueDate: dateSchema }).strict();
const patchSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('EDIT'), expectedRevision: positiveRevision, note: noteSchema, dueDate: dateSchema }).strict(),
  z.object({ operation: z.literal('COMPLETE'), expectedRevision: positiveRevision, completionNote: completionNoteSchema.optional() }).strict(),
]);

export function dayInAlgiers(now = new Date()): Date {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
}
export function alertState(status: string, dueDate: Date, today: Date): 'OVERDUE' | 'DUE_TODAY' | 'NONE' {
  if (status !== 'OPEN') return 'NONE';
  const due = dueDate.toISOString().slice(0, 10);
  const current = today.toISOString().slice(0, 10);
  return due < current ? 'OVERDUE' : due === current ? 'DUE_TODAY' : 'NONE';
}
function validation(error: z.ZodError): never {
  const fields = error.issues.reduce<Record<string, string[]>>((result, issue) => {
    const key = issue.path.join('.') || '_form';
    (result[key] ??= []).push('قيمة غير صالحة.');
    return result;
  }, {});
  throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', fields);
}
function rejectDuplicateKeys(raw: string | undefined) {
  if (!raw) return;
  let index = 0;
  const ws = () => { while (/\s/u.test(raw[index] ?? '')) index += 1; };
  const stringToken = () => { const start = index++; while (index < raw.length) { if (raw[index] === '\\') { index += 2; continue; } if (raw[index++] === '"') break; } return JSON.parse(raw.slice(start, index)) as string; };
  const value = (): boolean => {
    ws();
    if (raw[index] === '{') {
      index += 1; ws(); const keys = new Set<string>(); if (raw[index] === '}') { index += 1; return false; }
      while (index < raw.length) { ws(); const key = stringToken(); if (keys.has(key)) return true; keys.add(key); ws(); index += 1; if (value()) return true; ws(); if (raw[index] === '}') { index += 1; return false; } index += 1; }
    } else if (raw[index] === '[') { index += 1; ws(); while (index < raw.length && raw[index] !== ']') { if (value()) return true; ws(); if (raw[index] !== ',') break; index += 1; } index += 1; }
    else if (raw[index] === '"') stringToken();
    else while (index < raw.length && !/[\s,}\]]/u.test(raw[index] ?? '')) index += 1;
    return false;
  };
  if (value()) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { _form: ['قيمة غير صالحة.'] });
}
const notFound = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
const reportNotReady = () => new ApiError(409, 'FOLLOW_UP_REPORT_NOT_READY', 'لا يمكن إنشاء المتابعة في الحالة الحالية.');
const stateConflict = () => new ApiError(409, 'FOLLOW_UP_STATE_CONFLICT', 'لا يمكن تعديل المتابعة في حالتها الحالية.');
const revisionConflict = () => new ApiError(409, 'FOLLOW_UP_REVISION_CONFLICT', 'تغيّرت المتابعة؛ حدّث البيانات وراجعها قبل المتابعة.');

type ScopedDatabase = Pick<PrismaClient, 'inspectionReport' | 'pedagogicalVisit' | 'inspectorDistrictMembership' | 'followUp'>;
type Row = Prisma.FollowUpGetPayload<{ include: { report: { include: { visit: true } } } }>;
function projection(row: Row, today: Date) {
  const { report, ...followUp } = row;
  const visit = report.visit;
  return {
    ...followUp,
    dueDate: followUp.dueDate.toISOString().slice(0, 10),
    completedAt: followUp.completedAt?.toISOString() ?? null,
    createdAt: followUp.createdAt.toISOString(), updatedAt: followUp.updatedAt.toISOString(),
    alertState: alertState(followUp.status, followUp.dueDate, today),
    context: { visitId: visit.id, districtId: visit.districtId,
      teacher: { id: visit.teacherId, name: report.finalizedTeacherNameSnapshot!, surname: report.finalizedTeacherSurnameSnapshot! },
      institution: { id: visit.institutionId, name: visit.institutionNameSnapshot } },
  };
}
async function getReport(database: ScopedDatabase, reportId: string, inspectorId: string) {
  const report = await database.inspectionReport.findUnique({ where: { id: reportId }, include: { visit: true } });
  if (!report) throw notFound();
  await requireInspectorDistrictMembership(database, inspectorId, report.visit.districtId);
  if (report.status !== 'FINAL') throw reportNotReady();
  return report;
}
async function getScopedFollowUp(database: ScopedDatabase, id: string, inspectorId: string) {
  const row = await database.followUp.findUnique({ where: { id }, include: { report: { include: { visit: true } } } });
  if (!row) throw notFound();
  await requireInspectorDistrictMembership(database, inspectorId, row.report.visit.districtId);
  return row;
}
function parseId(value: string) {
  if (!uuid.safeParse(value).success) throw new ApiError(400, 'VALIDATION_ERROR', 'معرّف غير صالح.');
  return value;
}
export function registerFollowUpRoutes(app: Express, database: PrismaClient, requireInspector: RequestHandler): void {
  app.use(`${ROOT}/reports/:id/follow-ups`, (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(`${ROOT}/follow-ups`, (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });

  app.get(`${ROOT}/reports/:id/follow-ups`, requireInspector, async (request, response) => {
    const reportId = parseId(String(request.params.id));
    const inspectorId = response.locals.inspectorId as string;
    await getReport(database, reportId, inspectorId);
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: uuid.optional() }).strict().safeParse(request.query);
    if (!query.success) return validation(query.error);
    const where = { reportId };
    const total = await database.followUp.count({ where });
    if (query.data.cursor) {
      const cursor = await database.followUp.findFirst({ where: { id: query.data.cursor, reportId }, select: { id: true } });
      if (!cursor) throw notFound();
    }
    const rows = await database.followUp.findMany({ where, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: query.data.limit + 1,
      ...(query.data.cursor ? { cursor: { id: query.data.cursor }, skip: 1 } : {}), include: { report: { include: { visit: true } } } });
    const hasNext = rows.length > query.data.limit;
    const pageRows = hasNext ? rows.slice(0, query.data.limit) : rows;
    const today = dayInAlgiers();
    response.json({ data: pageRows.map((row) => projection(row, today)), page: { limit: query.data.limit, total, nextCursor: hasNext ? pageRows.at(-1)!.id : null } });
  });

  app.post(`${ROOT}/reports/:id/follow-ups`, requireInspector, async (request: Request & { rawBody?: string }, response) => {
    requireAuthenticatedMutationCsrf(request);
    rejectDuplicateKeys(request.rawBody);
    const reportId = parseId(String(request.params.id));
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return validation(parsed.error);
    const inspectorId = response.locals.inspectorId as string;
    let id = '';
    await database.$transaction(async (tx) => {
      const report = await tx.inspectionReport.findUnique({ where: { id: reportId }, include: { visit: true } });
      if (!report) throw notFound();
      await requireInspectorDistrictMembership(tx, inspectorId, report.visit.districtId);
      if (report.status !== 'FINAL' || report.visit.status !== 'COMPLETED') throw reportNotReady();
      const row = await tx.followUp.create({ data: { reportId, ownerInspectorId: inspectorId, note: parsed.data.note, dueDate: parsed.data.dueDate }, select: { id: true } });
      id = row.id;
    });
    const row = await database.followUp.findUniqueOrThrow({ where: { id }, include: { report: { include: { visit: true } } } });
    response.status(201).json({ data: { followUp: projection(row, dayInAlgiers()) } });
  });

  app.get(`${ROOT}/follow-ups`, requireInspector, async (request, response) => {
    const inspectorId = response.locals.inspectorId as string;
    const querySchema = z.object({ districtId: uuid.optional(), status: z.enum(['OPEN', 'COMPLETED']).default('OPEN'), alert: z.enum(['OVERDUE', 'DUE_TODAY']).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25), cursor: uuid.optional() }).strict();
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return validation(parsed.error);
    const now = new Date();
    const memberships = await database.inspectorDistrictMembership.findMany({ where: { inspectorId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] }, select: { districtId: true } });
    const districtIds = [...new Set(memberships.map((item) => item.districtId))];
    if (parsed.data.districtId && !districtIds.includes(parsed.data.districtId)) throw notFound();
    const scopedDistrictIds = parsed.data.districtId ? [parsed.data.districtId] : districtIds;
    const today = dayInAlgiers(now);
    const where: Prisma.FollowUpWhereInput = { status: parsed.data.status, report: { visit: { districtId: { in: scopedDistrictIds } } } };
    if (parsed.data.alert === 'OVERDUE') where.dueDate = { lt: today };
    if (parsed.data.alert === 'DUE_TODAY') where.dueDate = { equals: today };
    const total = await database.followUp.count({ where });
    if (parsed.data.cursor) {
      const cursor = await database.followUp.findFirst({ where: { ...where, id: parsed.data.cursor }, select: { id: true } });
      if (!cursor) throw notFound();
    }
    const rows = await database.followUp.findMany({ where, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: parsed.data.limit + 1,
      ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {}), include: { report: { include: { visit: true } } } });
    const hasNext = rows.length > parsed.data.limit;
    const pageRows = hasNext ? rows.slice(0, parsed.data.limit) : rows;
    response.json({ data: pageRows.map((row) => projection(row, today)), page: { limit: parsed.data.limit, total, nextCursor: hasNext ? pageRows.at(-1)!.id : null } });
  });

  app.patch(`${ROOT}/follow-ups/:id`, requireInspector, async (request: Request & { rawBody?: string }, response) => {
    requireAuthenticatedMutationCsrf(request);
    rejectDuplicateKeys(request.rawBody);
    const id = parseId(String(request.params.id));
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) return validation(parsed.error);
    const inspectorId = response.locals.inspectorId as string;
    let result: Row | null = null;
    await database.$transaction(async (tx) => {
      const row = await getScopedFollowUp(tx, id, inspectorId);
      if (row.ownerInspectorId !== inspectorId) throw notFound();
      if (row.status !== 'OPEN') throw stateConflict();
      if (row.revision !== parsed.data.expectedRevision) throw revisionConflict();
      if (parsed.data.operation === 'EDIT') {
        if (row.note === parsed.data.note && row.dueDate.toISOString().slice(0, 10) === parsed.data.dueDate.toISOString().slice(0, 10)) {
          result = row;
          return;
        }
        const changed = await tx.followUp.updateMany({ where: { id, ownerInspectorId: inspectorId, status: 'OPEN', revision: parsed.data.expectedRevision },
          data: { note: parsed.data.note, dueDate: parsed.data.dueDate, revision: { increment: 1 } } });
        if (changed.count !== 1) throw revisionConflict();
      } else {
        const completedAt = new Date();
        const changed = await tx.followUp.updateMany({ where: { id, ownerInspectorId: inspectorId, status: 'OPEN', revision: parsed.data.expectedRevision },
          data: { status: 'COMPLETED', completedAt, completionNote: parsed.data.completionNote ?? null, revision: { increment: 1 } } });
        if (changed.count !== 1) throw revisionConflict();
        await appendAuditEvent(tx, { source: 'HTTP', actorInspectorId: inspectorId, districtId: row.report.visit.districtId,
          action: AuditAction.FOLLOW_UP_STATE_CHANGED, entityType: 'FollowUp', entityId: id,
          requestId: (response.locals.requestId as string | undefined) ?? null, metadata: {} });
      }
      result = await tx.followUp.findUniqueOrThrow({ where: { id }, include: { report: { include: { visit: true } } } });
    });
    const today = dayInAlgiers();
    response.json({ data: { followUp: projection(result!, today) } });
  });
}
