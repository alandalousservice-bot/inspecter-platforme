import type { Express, Request, Response, RequestHandler } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';
import { ApiError } from '../http/api-error.js';
import { validateBody } from '../http/validate-body.js';

type InstitutionDatabase = Pick<PrismaClient, 'institution' | 'inspectorDistrictMembership'>;

const uuid = z.string().uuid();
const createSchema = z.object({
  districtId: uuid,
  name: z.string().trim().min(1).max(200),
  externalCode: z.string().trim().min(1).max(100).optional(),
}).strict();
const listSchema = z.object({
  districtId: uuid.optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: uuid.optional(),
}).strict();

function parseListQuery(request: Request) {
  const parsed = listSchema.safeParse(request.query);
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

function setNoStore(_request: Request, response: Response, next: (error?: unknown) => void): void {
  response.setHeader('Cache-Control', 'no-store');
  next();
}

export function registerInstitutionRoutes(
  app: Express,
  database: InstitutionDatabase,
  requireInspector: RequestHandler,
): void {
  app.use('/api/v1/institutions', setNoStore, requireInspector);

  app.get('/api/v1/institutions', async (request, response) => {
    const query = parseListQuery(request);
    const inspectorId = response.locals.inspectorId as string;
    let districtIds: string[];
    if (query.districtId) {
      await requireInspectorDistrictMembership(database, inspectorId, query.districtId);
      districtIds = [query.districtId];
    } else {
      const now = new Date();
      const memberships = await database.inspectorDistrictMembership.findMany({
        where: {
          inspectorId,
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gt: now } }],
        },
        select: { districtId: true },
        distinct: ['districtId'],
      });
      districtIds = memberships.map(({ districtId }) => districtId);
    }

    const where: Prisma.InstitutionWhereInput = {
      districtId: { in: districtIds },
      archivedAt: null,
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    if (query.cursor) {
      const cursorRecord = await database.institution.findFirst({
        where: { ...where, id: query.cursor }, select: { id: true },
      });
      if (!cursorRecord) throw new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
    }
    const [rows, total] = await Promise.all([
      database.institution.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        take: query.limit + 1,
        select: { id: true, districtId: true, name: true, externalCode: true, archivedAt: true, createdAt: true, updatedAt: true },
      }),
      database.institution.count({ where }),
    ]);
    const hasNext = rows.length > query.limit;
    const data = hasNext ? rows.slice(0, query.limit) : rows;
    response.json({ data, page: { limit: query.limit, nextCursor: hasNext ? data.at(-1)?.id ?? null : null, total } });
  });

  app.post('/api/v1/institutions', validateBody(createSchema), async (request, response) => {
    const input = request.body as z.infer<typeof createSchema>;
    const inspectorId = response.locals.inspectorId as string;
    await requireInspectorDistrictMembership(database, inspectorId, input.districtId);
    const institution = await database.institution.create({ data: input });
    response.status(201).json({ data: institution });
  });
}
