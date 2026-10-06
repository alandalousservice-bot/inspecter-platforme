import type { Express, Request, RequestHandler, Response } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../http/api-error.js';
import { normalizeAlgerianPhone } from '../intake/submission-schema.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';

type DirectoryDatabase = Pick<PrismaClient, 'teacher' | 'institution' | 'inspectorDistrictMembership'>;
type DirectoryClock = () => Date;

const uuid = z.string().uuid();
const normalizedQuery = z.string().transform((raw) => raw.trim().replace(/\s+/gu, ' '))
  .refine((value) => Array.from(value).length <= 100, 'قيمة غير صالحة.');
const positiveIntegerQuery = (minimum: number, maximum: number) => z.string()
  .regex(/^\d+$/u, 'قيمة غير صالحة.')
  .transform(Number)
  .refine((value) => Number.isSafeInteger(value) && value >= minimum && value <= maximum, 'قيمة غير صالحة.');
const academicYearQuery = z.string().regex(/^\d{4}-\d{4}$/u, 'قيمة غير صالحة.')
  .refine((value) => Number(value.slice(5)) === Number(value.slice(0, 4)) + 1, 'قيمة غير صالحة.');
const listQuerySchema = z.object({
  districtId: uuid.optional(),
  q: normalizedQuery.optional(),
  municipality: z.string().normalize().trim().min(1).max(150).optional(),
  institutionId: uuid.optional(),
  hasCurrentInstitution: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  professionalStatus: z.enum(['PERMANENT', 'TRAINEE', 'CONTRACT', 'TEMPORARY_CONTRACT', 'SUBSTITUTE']).optional(),
  recordStatus: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  academicYear: academicYearQuery.optional(),
  dayOfWeek: positiveIntegerQuery(1, 7).optional(),
  minuteOfDay: positiveIntegerQuery(0, 1439).optional(),
  worksToday: z.literal('true').optional(),
  worksNow: z.literal('true').optional(),
  limit: z.string().regex(/^\d+$/u).transform(Number).pipe(z.number().int().min(1).max(100)).optional().transform((value) => value ?? 25),
  cursor: uuid.optional(),
}).strict().superRefine((query, context) => {
  const hasScheduleFilter = query.dayOfWeek !== undefined || query.minuteOfDay !== undefined
    || query.worksToday !== undefined || query.worksNow !== undefined;
  if (query.academicYear === undefined && hasScheduleFilter) {
    context.addIssue({ code: 'custom', path: ['academicYear'], message: 'يلزم تحديد السنة الدراسية.' });
  }
  if (query.academicYear !== undefined && !hasScheduleFilter) {
    context.addIssue({ code: 'custom', path: ['academicYear'], message: 'السنة الدراسية تتطلب مرشحًا للجدول.' });
  }
  if (query.minuteOfDay !== undefined && query.dayOfWeek === undefined) {
    context.addIssue({ code: 'custom', path: ['dayOfWeek'], message: 'يلزم تحديد اليوم مع الدقيقة.' });
  }
  if (query.institutionId !== undefined && query.hasCurrentInstitution === false) {
    context.addIssue({ code: 'custom', path: ['hasCurrentInstitution'], message: 'تركيب المرشحات غير صالح.' });
  }
});

type ListQuery = z.infer<typeof listQuerySchema>;
const genericNotFound = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');

function parseListQuery(request: Request): ListQuery {
  const parsed = listQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    const fields = parsed.error.issues.reduce<Record<string, string[]>>((result, issue) => {
      const key = issue.path.join('.') || '_form';
      (result[key] ??= []).push('قيمة غير صالحة.');
      return result;
    }, {});
    throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', fields);
  }
  return parsed.data;
}

function currentAlgiersDayAndMinute(instant: Date): { dayOfWeek: number; minuteOfDay: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const days: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const dayOfWeek = days[values.weekday ?? ''];
  if (!dayOfWeek || values.hour === undefined || values.minute === undefined) {
    throw new Error('Unable to read Africa/Algiers time parts.');
  }
  return { dayOfWeek, minuteOfDay: Number(values.hour) * 60 + Number(values.minute), date: `${values.year}-${values.month}-${values.day}` };
}

function scheduleExists(academicYear: string, slot: Prisma.WeeklyScheduleSlotWhereInput): Prisma.TeacherWhereInput {
  return { weeklySchedules: { some: { academicYear, slots: { some: slot } } } };
}

function buildWhere(query: ListQuery, districtIds: string[], instant: Date): Prisma.TeacherWhereInput {
  const conditions: Prisma.TeacherWhereInput[] = [
    { districtId: { in: districtIds } },
    { recordStatus: query.recordStatus },
  ];
  if (query.q) {
    const phoneQuery = normalizeAlgerianPhone(query.q) ?? query.q;
    const nameParts = query.q.split(' ');
    const nameMatch: Prisma.TeacherWhereInput = {
      AND: nameParts.map((part) => ({
        OR: [
          { name: { contains: part, mode: 'insensitive' } },
          { surname: { contains: part, mode: 'insensitive' } },
        ],
      })),
    };
    conditions.push({
      OR: [
        nameMatch,
        { phone: { contains: phoneQuery, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { institution: { is: { name: { contains: query.q, mode: 'insensitive' } } } },
      ],
    });
  }
  const currentDate = new Date(`${currentAlgiersDayAndMinute(instant).date}T00:00:00.000Z`);
  const currentSupplementary = { validFrom: { lte: currentDate }, OR: [{ validTo: null }, { validTo: { gt: currentDate } }] };
  if (query.institutionId) conditions.push({ OR: [{ institutionId: query.institutionId }, { supplementaryWorkplaces: { some: { ...currentSupplementary, institutionId: query.institutionId } } }] });
  if (query.municipality) conditions.push({ OR: [{ institution: { is: { municipality: { equals: query.municipality, mode: 'insensitive' } } } }, { supplementaryWorkplaces: { some: { ...currentSupplementary, institution: { municipality: { equals: query.municipality, mode: 'insensitive' }, archivedAt: null } } } }] });
  if (query.hasCurrentInstitution !== undefined) {
    conditions.push({ institutionId: query.hasCurrentInstitution ? { not: null } : null });
  }
  if (query.professionalStatus) conditions.push({ professionalStatus: query.professionalStatus });

  if (query.academicYear) {
    if (query.minuteOfDay !== undefined && query.dayOfWeek !== undefined) {
      conditions.push(scheduleExists(query.academicYear, {
        dayOfWeek: query.dayOfWeek,
        startMinute: { lte: query.minuteOfDay },
        endMinute: { gt: query.minuteOfDay },
      }));
    } else if (query.dayOfWeek !== undefined) {
      conditions.push(scheduleExists(query.academicYear, { dayOfWeek: query.dayOfWeek }));
    }
    if (query.worksToday || query.worksNow) {
      const local = currentAlgiersDayAndMinute(instant);
      const localDate = new Date(`${local.date}T00:00:00.000Z`);
      conditions.push(scheduleExists(query.academicYear, query.worksNow
        ? {
          dayOfWeek: local.dayOfWeek,
          startMinute: { lte: local.minuteOfDay },
          endMinute: { gt: local.minuteOfDay },
          institutionId: { not: null }, validFrom: { lte: localDate },
          OR: [{ validTo: null }, { validTo: { gt: localDate } }],
        }
        : { dayOfWeek: local.dayOfWeek, institutionId: { not: null }, validFrom: { lte: localDate },
          OR: [{ validTo: null }, { validTo: { gt: localDate } }] }));
    }
  }
  return { AND: conditions };
}

export function registerTeacherDirectoryRoutes(
  app: Express,
  database: DirectoryDatabase,
  requireInspector: RequestHandler,
  clock: DirectoryClock = () => new Date(),
): void {
  const setNoStore = (_request: Request, response: Response, next: (error?: unknown) => void) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  };
  app.get('/api/v1/teachers', setNoStore, requireInspector, async (request, response) => {
    const query = parseListQuery(request);
    const instant = clock();
    const inspectorId = response.locals.inspectorId as string;
    let districtIds: string[];
    if (query.districtId) {
      await requireInspectorDistrictMembership(database, inspectorId, query.districtId, instant);
      districtIds = [query.districtId];
    } else {
      const memberships = await database.inspectorDistrictMembership.findMany({
        where: {
          inspectorId,
          validFrom: { lte: instant },
          OR: [{ validTo: null }, { validTo: { gt: instant } }],
        },
        select: { districtId: true },
        distinct: ['districtId'],
      });
      districtIds = memberships.map(({ districtId }) => districtId);
    }

    if (query.institutionId) {
      const institution = await database.institution.findFirst({
        where: { id: query.institutionId, districtId: { in: districtIds } },
        select: { id: true },
      });
      if (!institution) throw genericNotFound();
    }

    const where = buildWhere(query, districtIds, instant);
    const currentDate = new Date(`${currentAlgiersDayAndMinute(instant).date}T00:00:00.000Z`);
    if (query.cursor) {
      const cursorRecord = await database.teacher.findFirst({ where: { ...where, id: query.cursor }, select: { id: true } });
      if (!cursorRecord) throw genericNotFound();
    }
    const [rows, total] = districtIds.length === 0 ? [[], 0] as const : await Promise.all([
      database.teacher.findMany({
        where,
        orderBy: [{ surname: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        take: query.limit + 1,
        select: {
          id: true,
          districtId: true,
          name: true,
          surname: true,
          professionalStatus: true,
          trainingStatus: true,
          trainingVerifiedAt: true,
          recordStatus: true,
          photos: { where: { sanitizationVersion: 1 }, take: 1, select: { id: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
          _count: { select: { supplementaryWorkplaces: { where: { validFrom: { lte: currentDate }, OR: [{ validTo: null }, { validTo: { gt: currentDate } }], institution: { archivedAt: null } } } } },
          institution: { select: { id: true, name: true, municipality: true } },
        },
      }),
      database.teacher.count({ where }),
    ]);
    const hasNext = rows.length > query.limit;
    const data = (hasNext ? rows.slice(0, query.limit) : rows).map(({ institution, photos, _count, ...teacher }) => ({
      ...teacher,
      hasPhoto: photos.length > 0,
      hasSupplementaryWorkplaces: _count.supplementaryWorkplaces > 0,
      currentInstitution: institution,
    }));
    response.json({
      data,
      page: { limit: query.limit, nextCursor: hasNext ? data.at(-1)?.id ?? null : null, total },
    });
  });
}
