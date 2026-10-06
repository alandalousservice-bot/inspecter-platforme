import type { PrismaClient } from '@prisma/client';
import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError } from '../http/api-error.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';
import { parse } from './contracts.js';

export function registerEvolutionWorkspace(app: Express, database: PrismaClient, inspector: RequestHandler) {
  async function districtIds(inspectorId: string) { const now = new Date(); return (await database.inspectorDistrictMembership.findMany({ where: { inspectorId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] }, select: { districtId: true }, distinct: ['districtId'] })).map((m) => m.districtId); }
  app.get('/api/v1/me/geography', inspector, async (_request, response) => {
    const ids = await districtIds(response.locals.inspectorId as string);
    const [districts, groups] = await Promise.all([database.district.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }), database.institution.groupBy({ by: ['districtId', 'municipality'], where: { districtId: { in: ids }, archivedAt: null, municipality: { not: null } }, _count: { id: true }, orderBy: [{ municipality: 'asc' }, { districtId: 'asc' }] })]);
    response.setHeader('Cache-Control', 'no-store'); response.json({ data: { districts: districts.map((d) => ({ ...d, municipalities: groups.filter((g) => g.districtId === d.id).map((g) => ({ name: g.municipality, institutionCount: g._count.id })) })) } });
  });
  app.get('/api/v1/institutions/:id/workspace', inspector, async (request, response) => {
    const id = parse(z.string().uuid(), request.params.id);
    const place = await database.institution.findUnique({ where: { id }, select: { id: true, districtId: true, name: true, municipality: true, address: true, email: true, directorPhone: true, archivedAt: true, district: { select: { name: true } } } });
    if (!place) throw new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
    await requireInspectorDistrictMembership(database, response.locals.inspectorId as string, place.districtId);
    response.setHeader('Cache-Control', 'no-store'); response.json({ data: place });
  });
  app.get('/api/v1/me/work-alerts', inspector, async (_request, response) => {
    const ids = await districtIds(response.locals.inspectorId as string);
    const where = { OR: [{ origin: 'TEACHER_UPDATE' }, { inspectorId: response.locals.inspectorId as string }], teacher: { districtId: { in: ids } }, status: 'SUBMITTED' };
    const [requests, corrections, items] = await Promise.all([database.teacherChangeRequest.groupBy({ by: ['kind'], where: { districtId: { in: ids }, status: 'PENDING' }, _count: { id: true } }), database.scheduleCorrection.count({ where }), database.scheduleCorrection.findMany({ where, take: 5, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], select: { id: true, academicYear: true, teacher: { select: { id: true, name: true, surname: true } } } })]);
    response.setHeader('Cache-Control', 'no-store'); response.json({ data: { requests: requests.map((r) => ({ kind: r.kind, count: r._count.id })), corrections, correctionItems: items } });
  });
  app.get('/api/v1/teachers/:id/evolution-history', inspector, async (request, response) => {
    const id = parse(z.string().uuid(), request.params.id);
    const teacher = await database.teacher.findUnique({ where: { id }, select: { districtId: true } });
    if (!teacher) throw new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
    await requireInspectorDistrictMembership(database, response.locals.inspectorId as string, teacher.districtId);
    const [requests, corrections] = await Promise.all([
      database.teacherChangeRequest.findMany({ where: { teacherId: id }, take: 25, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, kind: true, status: true, createdAt: true, updatedAt: true } }),
      database.scheduleCorrection.findMany({ where: { teacherId: id }, take: 25, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, academicYear: true, status: true, updatedAt: true } }),
    ]);
    const [events, visits] = await Promise.all([
      database.auditLog.findMany({ where: { districtId: teacher.districtId, OR: [{ entityType: 'Teacher', entityId: id }, { entityType: 'TeacherChangeRequest', entityId: { in: requests.map((r) => r.id) } }, { entityType: 'ScheduleCorrection', entityId: { in: corrections.map((c) => c.id) } }] }, take: 25, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], select: { id: true, action: true, occurredAt: true } }),
      // Existing Visit/Report ownership is retained, not widened by dossier membership.
      database.pedagogicalVisit.findMany({ where: { teacherId: id, districtId: teacher.districtId, inspectorId: response.locals.inspectorId as string }, take: 5, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, status: true, scheduledStartAt: true, actualStartAt: true, institutionNameSnapshot: true, report: { select: { id: true, status: true, _count: { select: { followUps: true } } } } } }),
    ]);
    response.setHeader('Cache-Control', 'no-store'); response.json({ data: { requests, corrections, events, visits } });
  });
}
