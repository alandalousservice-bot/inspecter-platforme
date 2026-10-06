import { Prisma, type PrismaClient } from '@prisma/client';
import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError } from '../http/api-error.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';
import { algiersCalendarDate } from '../teachers/supplementary-workplaces-domain.js';
import { parse, requestSchema, text } from './contracts.js';
import { requireTeacher, requireTeacherCsrf } from './auth.js';
import { appendPortalAudit } from './audit.js';
import { validateResultingDates } from '../teachers/routes.js';
import { appendAuditEvent } from '../audit/append.js';
import { serializeCanonicalInstitutionLocation } from '../institutions/location-serialization.js';

const uuid = z.string().uuid();
const notFound = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
export const ownProfile = {
  id: true, name: true, surname: true, districtId: true, birthDate: true, placeOfBirth: true, email: true, phone: true,
  professionalStatus: true, employedAt: true, confirmedAt: true, professionalFramework: true, trainingStatus: true, trainingVerifiedAt: true,
  institution: { select: { id: true, name: true, municipality: true, address: true, latitude: true, longitude: true } },
  qualificationsStructured: { select: { id: true, name: true, issuingBody: true, qualificationDate: true } },
  district: { select: { id: true, name: true } },
} as const;

export function registerTeacherPortal(app: Express, database: PrismaClient, inspector: RequestHandler) {
  const teacherAuth = requireTeacher(database);
  app.get('/api/v1/teacher/me', teacherAuth, async (_request, response) => {
    const teacher = await database.teacher.findUnique({ where: { id: response.locals.teacherId as string }, select: ownProfile });
    response.json({ data: { teacher } });
  });
  app.get('/api/v1/teacher/actions', teacherAuth, async (_request, response) => {
    const teacherId = response.locals.teacherId as string;
    const corrections = await database.scheduleCorrection.findMany({ where: { teacherId }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 10, select: { id: true, academicYear: true, status: true, note: true, origin: true, decisionNote: true } });
    response.json({ data: { corrections } });
  });
  app.get('/api/v1/teacher/workplaces', teacherAuth, async (_request, response) => {
    const id = response.locals.teacherId as string; const now = new Date(`${algiersCalendarDate()}T00:00:00.000Z`);
    const teacher = await database.teacher.findUnique({ where: { id }, select: { institution: { select: { id: true, name: true, municipality: true, archivedAt: true } } } });
    const relations = await database.teacherSupplementaryWorkplace.findMany({ where: { teacherId: id, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }], institution: { archivedAt: null } }, include: { institution: { select: { id: true, name: true, municipality: true } } } });
    response.json({ data: { items: [...(teacher?.institution && !teacher.institution.archivedAt ? [{ id: teacher.institution.id, name: teacher.institution.name, municipality: teacher.institution.municipality, role: 'HOME' }] : []), ...relations.map((r) => ({ ...r.institution, role: 'SUPPLEMENTARY', validFrom: r.validFrom, validTo: r.validTo }))] } });
  });
  app.get('/api/v1/teacher/districts', teacherAuth, async (_request, response) => {
    response.json({ data: { items: await database.district.findMany({ where: { memberships: { some: { inspector: { status: 'ACTIVE' }, validFrom: { lte: new Date() }, OR: [{ validTo: null }, { validTo: { gt: new Date() } }] } } }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }) } });
  });
  app.get('/api/v1/teacher/requests', teacherAuth, async (request, response) => {
    const query = parse(z.object({ cursor: uuid.optional() }).strict(), request.query);
    const where = { teacherId: response.locals.teacherId as string };
    if (query.cursor && !await database.teacherChangeRequest.findFirst({ where: { ...where, id: query.cursor }, select: { id: true } })) throw notFound();
    const rows = await database.teacherChangeRequest.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 26, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), select: { id: true, kind: true, status: true, payload: true, decisionNote: true, createdAt: true, revision: true } });
    response.json({ data: rows.slice(0, 25), page: { nextCursor: rows.length > 25 ? rows[24]?.id : null } });
  });
  app.post('/api/v1/teacher/requests', teacherAuth, async (request, response) => {
    requireTeacherCsrf(request); const input = parse(requestSchema, request.body);
    const created = await database.$transaction(async (tx) => {
      const teacherId = response.locals.teacherId as string;
      await tx.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${teacherId}::uuid FOR UPDATE`;
      const teacher = await tx.teacher.findUnique({ where: { id: teacherId } });
      if (!teacher || teacher.recordStatus !== 'ACTIVE' || teacher.archivedAt) throw notFound();
      if (input.kind === 'PROFILE') validateResultingDates(teacher, input.payload);
      let locationBaseline: string | undefined;
      if (input.kind === 'TRANSFER') {
        if (input.payload.destinationDistrictId === teacher.districtId || !await tx.district.findUnique({ where: { id: input.payload.destinationDistrictId }, select: { id: true } })) throw new ApiError(400, 'VALIDATION_ERROR', 'اختر مقاطعة انتقال صالحة.');
      }
      if (input.kind === 'LOCATION') {
        const institution = await tx.institution.findFirst({ where: { id: input.payload.institutionId, districtId: teacher.districtId, archivedAt: null }, select: { id: true, updatedAt: true } });
        const today = new Date(`${algiersCalendarDate()}T00:00:00.000Z`);
        const supplementary = await tx.teacherSupplementaryWorkplace.findFirst({ where: { teacherId, institutionId: input.payload.institutionId, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gt: today } }] } });
        if (!institution || (teacher.institutionId !== institution.id && !supplementary)) throw notFound();
        locationBaseline = institution.updatedAt.toISOString();
      }
      const existing = await tx.teacherChangeRequest.count({ where: { teacherId, status: 'PENDING', kind: input.kind } });
      if (existing > 0) throw new ApiError(409, 'REQUEST_PENDING', 'يوجد طلب من النوع نفسه ينتظر المراجعة.');
      const result = await tx.teacherChangeRequest.create({ data: { teacherId, districtId: teacher.districtId, kind: input.kind, payload: { ...input.payload, ...(locationBaseline ? { baselineInstitutionUpdatedAt: locationBaseline } : {}) } as Prisma.InputJsonValue, baselineUpdatedAt: teacher.updatedAt } });
      await appendPortalAudit(tx, response, teacher, 'TEACHER_REQUEST_CREATED', result.id, { kind: input.kind }, teacherId);
      return result;
    });
    response.status(201).json({ data: { id: created.id, status: created.status } });
  });
  app.get('/api/v1/teacher-requests', inspector, async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const query = parse(z.object({ cursor: uuid.optional(), teacherId: uuid.optional(), kind: z.enum(['PROFILE', 'CONTACT', 'TRAINING', 'TRANSFER', 'WORKPLACE', 'LOCATION']).optional(), status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'APPROVED_PENDING_DESTINATION']).default('PENDING') }).strict(), request.query);
    const now = new Date(); const memberships = await database.inspectorDistrictMembership.findMany({ where: { inspectorId: response.locals.inspectorId as string, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] }, select: { districtId: true } });
    const where = { districtId: { in: memberships.map((m) => m.districtId) }, status: query.status, ...(query.kind ? { kind: query.kind } : {}), ...(query.teacherId ? { teacherId: query.teacherId } : {}) };
    if (query.cursor && !await database.teacherChangeRequest.findFirst({ where: { ...where, id: query.cursor }, select: { id: true } })) throw notFound();
    const [rows, total] = await Promise.all([database.teacherChangeRequest.findMany({ where, include: { teacher: { select: { id: true, name: true, surname: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 26, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) }), database.teacherChangeRequest.count({ where })]);
    const pageRows = rows.slice(0, 25);
    const destinationIds = pageRows.filter((row) => row.kind === 'TRANSFER').map((row) => (row.payload as { destinationDistrictId?: string }).destinationDistrictId).filter((id): id is string => Boolean(id));
    const destinations = await database.district.findMany({ where: { id: { in: destinationIds } }, select: { id: true, name: true } });
    const locationIds = pageRows.filter((row) => row.kind === 'LOCATION').map((row) => (row.payload as { institutionId: string }).institutionId);
    const institutions = await database.institution.findMany({ where: { id: { in: locationIds }, districtId: { in: memberships.map((m) => m.districtId) } }, select: { id: true, name: true, latitude: true, longitude: true, locationSource: true } });
    response.json({ data: pageRows.map((row) => { const place = institutions.find((i) => i.id === (row.payload as { institutionId?: string }).institutionId); return { ...row,
      ...(row.kind === 'TRANSFER' ? { destinationName: destinations.find((d) => d.id === (row.payload as { destinationDistrictId?: string }).destinationDistrictId)?.name ?? null } : {}),
      ...(place ? { institutionContext: { name: place.name, location: serializeCanonicalInstitutionLocation(place) } } : {}) }; }), page: { nextCursor: rows.length > 25 ? rows[24]?.id : null, total } });
  });
  app.post('/api/v1/teacher-requests/:id/decision', inspector, async (request, response) => {
    requireAuthenticatedMutationCsrf(request); const id = parse(uuid, request.params.id);
    const input = parse(z.object({ decision: z.enum(['ACCEPT', 'REJECT']), expectedRevision: z.number().int().positive(), note: text(500).optional(), resolvedInstitutionId: uuid.optional() }).strict(), request.body);
    const result = await database.$transaction(async (tx) => {
      const current = await tx.teacherChangeRequest.findUnique({ where: { id } }); if (!current) throw notFound();
      await tx.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${current.teacherId}::uuid FOR UPDATE`;
      const teacher = await tx.teacher.findUnique({ where: { id: current.teacherId } }); if (!teacher || teacher.districtId !== current.districtId) throw notFound();
      await requireInspectorDistrictMembership(tx, response.locals.inspectorId as string, current.districtId);
      if (current.status !== 'PENDING' || current.revision !== input.expectedRevision) throw new ApiError(409, 'REVISION_CONFLICT', 'تغير الطلب، حدّث البيانات.');
      const { baselineInstitutionUpdatedAt, ...declaredPayload } = current.payload as Record<string, unknown>;
      const declared = parse(requestSchema, { kind: current.kind, payload: declaredPayload });
      if (input.resolvedInstitutionId && (declared.kind !== 'WORKPLACE' || input.decision !== 'ACCEPT')) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.');
      if (input.decision === 'ACCEPT') {
        if (['CONTACT', 'PROFILE', 'TRAINING'].includes(declared.kind) && teacher.updatedAt.getTime() !== current.baselineUpdatedAt.getTime()) throw new ApiError(409, 'PROFILE_CHANGED', 'تغيرت البيانات المعتمدة، يلزم مراجعة الطلب مجددًا.');
        if (declared.kind === 'CONTACT') await tx.teacher.update({ where: { id: teacher.id }, data: declared.payload });
        else if (declared.kind === 'PROFILE') {
          validateResultingDates(teacher, declared.payload);
          const { birthDate, employedAt, confirmedAt, ...fields } = declared.payload;
          const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
          await tx.teacher.update({ where: { id: teacher.id }, data: { ...fields,
            ...(birthDate ? { birthDate: date(birthDate) } : {}), ...(employedAt ? { employedAt: date(employedAt) } : {}),
            ...(confirmedAt ? { confirmedAt: date(confirmedAt) } : {}) } });
        }
        else if (declared.kind === 'TRAINING') {
          if (declared.payload.status === 'COMPLETED') throw new ApiError(409, 'TRAINING_VERIFICATION_POLICY_REQUIRED', 'اعتماد إتمام التكوين ينتظر تحديد متطلبات الإثبات.');
          await tx.teacher.update({ where: { id: teacher.id }, data: { trainingStatus: declared.payload.status, trainingVerifiedAt: null } });
        } else if (declared.kind === 'LOCATION') {
          await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${declared.payload.institutionId}::uuid FOR UPDATE`;
          const institution = await tx.institution.findFirst({ where: { id: declared.payload.institutionId, districtId: teacher.districtId, archivedAt: null } });
          const today = new Date(`${algiersCalendarDate()}T00:00:00.000Z`);
          const assigned = teacher.institutionId === institution?.id || await tx.teacherSupplementaryWorkplace.findFirst({ where: { teacherId: teacher.id, institutionId: declared.payload.institutionId, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gt: today } }] }, select: { id: true } });
          if (!institution || !assigned) throw notFound();
          if (institution.updatedAt.toISOString() !== baselineInstitutionUpdatedAt) throw new ApiError(409, 'REVISION_CONFLICT', 'تغيرت المؤسسة؛ راجع التصريح قبل القرار.');
          await tx.institution.update({ where: { id: institution.id }, data: { latitude: new Prisma.Decimal(String(declared.payload.latitude)), longitude: new Prisma.Decimal(String(declared.payload.longitude)), locationSource: 'TEACHER_PROPOSED_APPROVED' } });
          await appendAuditEvent(tx, { source: 'HTTP', actorInspectorId: response.locals.inspectorId as string, districtId: teacher.districtId, requestId: response.locals.requestId as string, action: 'INSTITUTION_UPDATED', entityType: 'Institution', entityId: institution.id, metadata: { changedFields: ['location'], locationChange: institution.latitude === null ? 'SET' : 'UPDATE' } });
        } else if (declared.kind === 'WORKPLACE') {
          if (!input.resolvedInstitutionId) throw new ApiError(409, 'EXPLICIT_CANONICAL_WORKFLOW_REQUIRED', 'اعتمد مكان العمل من ملف الأستاذ، ثم اختر المؤسسة المطابقة صراحةً.');
          const today = new Date(`${algiersCalendarDate()}T00:00:00.000Z`);
          const institution = await tx.institution.findFirst({ where: { id: input.resolvedInstitutionId, districtId: teacher.districtId, archivedAt: null }, select: { id: true } });
          const assigned = teacher.institutionId === input.resolvedInstitutionId || await tx.teacherSupplementaryWorkplace.findFirst({ where: { teacherId: teacher.id, institutionId: input.resolvedInstitutionId, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gt: today } }] }, select: { id: true } });
          if (!institution || !assigned) throw notFound();
          // Acknowledges explicit Inspector resolution; never matches names or creates an assignment automatically.
        }
      }
      const status = input.decision === 'REJECT' ? 'REJECTED' : declared.kind === 'TRANSFER' ? 'APPROVED_PENDING_DESTINATION' : 'ACCEPTED';
      const updated = await tx.teacherChangeRequest.updateMany({ where: { id, status: 'PENDING', revision: input.expectedRevision }, data: { status, decisionInspectorId: response.locals.inspectorId as string, decisionNote: input.note ?? null, revision: { increment: 1 } } });
      if (updated.count !== 1) throw new ApiError(409, 'REVISION_CONFLICT', 'تغير الطلب، حدّث البيانات.');
      await appendPortalAudit(tx, response, teacher, 'TEACHER_REQUEST_DECIDED', id, { kind: declared.kind, status, ...(declared.kind === 'WORKPLACE' && input.decision === 'ACCEPT' ? { resolvedInstitutionId: input.resolvedInstitutionId } : {}) });
      return { id, status };
    });
    response.json({ data: result });
  });
}
