import type { Prisma, PrismaClient } from '@prisma/client';
import type { Express, RequestHandler } from 'express';
import { z } from 'zod';

const path = '/api/v1/dashboard/summary';
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit',
});
type VisitType = 'GUIDANCE' | 'TENURE_CONFIRMATION' | 'PROMOTION_EVALUATION' | 'MONITORING_FOLLOW_UP' | 'EXCEPTIONAL';

export function algiersCalendarDate(now: Date): string {
  const parts = Object.fromEntries(dayFormatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

type DashboardDatabase = Pick<PrismaClient,
  'inspectorDistrictMembership' | 'teacherSubmission' | 'followUp' | 'inspectionReport' | 'pedagogicalVisit'>;

function iso(value: Date): string { return value.toISOString(); }
function dateOnly(value: Date): string { return value.toISOString().slice(0, 10); }

export async function loadDashboardSummary(database: DashboardDatabase, inspectorId: string, now: Date) {
  const today = algiersCalendarDate(now);
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const memberships = await database.inspectorDistrictMembership.findMany({
    where: { inspectorId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
    select: { districtId: true }, distinct: ['districtId'],
  });
  const districtIds = memberships.map(({ districtId }) => districtId);
  const empty = {
    asOf: iso(now), today,
    attention: {
      pendingSubmissions: { total: 0, items: [] as Array<{ id: string; submittedAt: string }> },
      ownedFollowUps: { overdueTotal: 0, dueTodayTotal: 0, items: [] as Array<{ id: string; dueDate: string; alertState: 'OVERDUE' | 'DUE_TODAY' }> },
      reports: { draftTotal: 0, completedVisitWithoutReportTotal: 0, items: [] as Array<{ visitId: string; reportId: string | null; kind: 'DRAFT_REPORT' | 'NO_REPORT'; referenceAt: string }> },
    },
      upcomingVisits: [] as Array<{ id: string; scheduledStartAt: string; scheduledEndAt: string; visitType: VisitType | null; institutionName: string }>,
  };
  if (!districtIds.length) return empty;

  const visitScope: Prisma.PedagogicalVisitWhereInput = { inspectorId, districtId: { in: districtIds } };
  const pendingWhere: Prisma.TeacherSubmissionWhereInput = { districtId: { in: districtIds }, status: 'PENDING' };
  const followUpBase: Prisma.FollowUpWhereInput = {
    ownerInspectorId: inspectorId, status: 'OPEN', report: { visit: { districtId: { in: districtIds } } },
  };
  const overdueWhere: Prisma.FollowUpWhereInput = { ...followUpBase, dueDate: { lt: todayDate } };
  const dueTodayWhere: Prisma.FollowUpWhereInput = { ...followUpBase, dueDate: { equals: todayDate } };
  const draftWhere: Prisma.InspectionReportWhereInput = {
    status: 'DRAFT', visit: { ...visitScope, status: { not: 'CANCELLED' } },
  };
  const noReportWhere: Prisma.PedagogicalVisitWhereInput = { ...visitScope, status: 'COMPLETED', report: { is: null } };
  const upcomingWhere: Prisma.PedagogicalVisitWhereInput = {
    ...visitScope, status: 'PLANNED', scheduledStartAt: { gte: now },
  };

  const [pendingTotal, pendingRows, overdueTotal, dueTodayTotal, overdueRows, draftTotal, draftRows,
    noReportTotal, noReportRows, upcomingRows] = await Promise.all([
    database.teacherSubmission.count({ where: pendingWhere }),
    database.teacherSubmission.findMany({ where: pendingWhere, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], take: 3, select: { id: true, submittedAt: true } }),
    database.followUp.count({ where: overdueWhere }),
    database.followUp.count({ where: dueTodayWhere }),
    database.followUp.findMany({ where: { ...followUpBase, dueDate: { lt: todayDate } }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 3, select: { id: true, dueDate: true } }),
    database.inspectionReport.count({ where: draftWhere }),
    database.inspectionReport.findMany({ where: draftWhere, orderBy: [{ updatedAt: 'desc' }, { visitId: 'desc' }], take: 3, select: { id: true, visitId: true, updatedAt: true } }),
    database.pedagogicalVisit.count({ where: noReportWhere }),
    database.pedagogicalVisit.findMany({ where: noReportWhere, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 3, select: { id: true, occurredAt: true } }),
    database.pedagogicalVisit.findMany({ where: upcomingWhere, orderBy: [{ scheduledStartAt: 'asc' }, { id: 'asc' }], take: 3,
      select: { id: true, scheduledStartAt: true, scheduledEndAt: true, visitType: true, institutionNameSnapshot: true } }),
  ]);

  const overdueItems = overdueRows.map((row) => ({ id: row.id, dueDate: dateOnly(row.dueDate), alertState: 'OVERDUE' as const }));
  const remaining = Math.max(0, 3 - overdueItems.length);
  const todayRows = remaining ? await database.followUp.findMany({ where: dueTodayWhere, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: remaining, select: { id: true, dueDate: true } }) : [];
  const reportItems = [
    ...draftRows.map((row) => ({ visitId: row.visitId, reportId: row.id, kind: 'DRAFT_REPORT' as const, referenceAt: row.updatedAt })),
    ...noReportRows.map((row) => ({ visitId: row.id, reportId: null, kind: 'NO_REPORT' as const, referenceAt: row.occurredAt! })),
  ].sort((left, right) => {
    const category = (left.kind === 'DRAFT_REPORT' ? 0 : 1) - (right.kind === 'DRAFT_REPORT' ? 0 : 1);
    const referenceOrder = right.referenceAt.getTime() - left.referenceAt.getTime();
    if (category || referenceOrder) return category || referenceOrder;
    return left.visitId < right.visitId ? 1 : left.visitId > right.visitId ? -1 : 0;
  }).slice(0, 3);

  return {
    asOf: iso(now), today,
    attention: {
      pendingSubmissions: { total: pendingTotal, items: pendingRows.map(({ id, submittedAt }) => ({ id, submittedAt: iso(submittedAt) })) },
      ownedFollowUps: {
        overdueTotal, dueTodayTotal,
        items: [...overdueItems, ...todayRows.map((row) => ({ id: row.id, dueDate: dateOnly(row.dueDate), alertState: 'DUE_TODAY' as const }))],
      },
      reports: {
        draftTotal, completedVisitWithoutReportTotal: noReportTotal,
        items: reportItems.map(({ referenceAt, ...item }) => ({ ...item, referenceAt: iso(referenceAt) })),
      },
    },
    upcomingVisits: upcomingRows.map((row) => ({
      id: row.id, scheduledStartAt: iso(row.scheduledStartAt!), scheduledEndAt: iso(row.scheduledEndAt!),
      visitType: row.visitType as VisitType | null, institutionName: row.institutionNameSnapshot,
    })),
  };
}

export function registerDashboardRoutes(
  app: Express,
  database: DashboardDatabase,
  requireInspector: RequestHandler,
  clock: () => Date = () => new Date(),
): void {
  app.use(path, (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  app.get(path, requireInspector, async (request, response) => {
    const parsed = z.object({}).strict().safeParse(request.query);
    if (!parsed.success) {
      return response.status(400).json({ error: {
        code: 'VALIDATION_ERROR', message: 'تحقق من البيانات المدخلة.', requestId: response.locals.requestId as string,
      } });
    }
    const now = clock();
    const inspectorId = response.locals.inspectorId as string;
    response.json({ data: await loadDashboardSummary(database, inspectorId, now) });
  });
}
