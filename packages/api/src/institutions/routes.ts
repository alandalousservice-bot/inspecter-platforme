import type { Express, Request, Response, RequestHandler } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { appendAuditEvent, AuditAction } from '../audit/append.js';
import { ApiError } from '../http/api-error.js';
import { validateBody } from '../http/validate-body.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { cleanText, directorPhoneField, emailField } from '../intake/submission-schema.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';

type InstitutionDatabase = Pick<PrismaClient, 'institution' | 'inspectorDistrictMembership' | '$transaction'>;

const uuid = z.string().uuid();
const workplaceFields = {
  municipality: cleanText(150, true).nullable().optional(),
  address: cleanText(300, true).nullable().optional(),
  directorPhone: directorPhoneField.nullable().optional(),
  email: emailField.nullable().optional(),
};
const createSchema = z.object({
  districtId: uuid,
  name: cleanText(200, true),
  externalCode: z.string().trim().min(1).max(100).optional(),
  ...workplaceFields,
}).strict();
const updateSchema = z.object({
  name: cleanText(200, true).optional(),
  ...workplaceFields,
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'يلزم حقل واحد على الأقل.' });
const listSchema = z.object({
  districtId: uuid.optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: uuid.optional(),
}).strict();
const institutionSelect = {
  id: true, districtId: true, name: true, externalCode: true,
  municipality: true, address: true, directorPhone: true,
  email: true, archivedAt: true, createdAt: true, updatedAt: true,
} as const;
const changedInstitutionFields = ['name', 'municipality', 'address', 'directorPhone', 'email'] as const;
type ChangedInstitutionField = typeof changedInstitutionFields[number];
type InstitutionUpdate = z.infer<typeof updateSchema>;

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

function invalidId(): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { id: ['قيمة غير صالحة.'] });
}

async function findScopedInstitution(
  database: Pick<PrismaClient, 'institution' | 'inspectorDistrictMembership'>,
  inspectorId: string,
  id: string,
) {
  const institution = await database.institution.findUnique({ where: { id }, select: institutionSelect });
  if (!institution) throw new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
  await requireInspectorDistrictMembership(database, inspectorId, institution.districtId);
  return institution;
}

function changedFields(institution: Awaited<ReturnType<typeof findScopedInstitution>>, patch: InstitutionUpdate) {
  const changed: Partial<Record<ChangedInstitutionField, string | null>> = {};
  for (const field of changedInstitutionFields) {
    const value = patch[field];
    if (value !== undefined && value !== institution[field]) changed[field] = value;
  }
  return changed;
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
        where: { inspectorId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
        select: { districtId: true }, distinct: ['districtId'],
      });
      districtIds = memberships.map(({ districtId }) => districtId);
    }

    const where: Prisma.InstitutionWhereInput = {
      districtId: { in: districtIds }, archivedAt: null,
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
    };
    if (query.cursor) {
      const cursorRecord = await database.institution.findFirst({ where: { ...where, id: query.cursor }, select: { id: true } });
      if (!cursorRecord) throw new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
    }
    const [rows, total] = await Promise.all([
      database.institution.findMany({
        where, orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        take: query.limit + 1, select: institutionSelect,
      }),
      database.institution.count({ where }),
    ]);
    const hasNext = rows.length > query.limit;
    const data = hasNext ? rows.slice(0, query.limit) : rows;
    response.json({ data, page: { limit: query.limit, nextCursor: hasNext ? data.at(-1)?.id ?? null : null, total } });
  });

  app.post('/api/v1/institutions', validateBody(createSchema), async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const input = request.body as z.infer<typeof createSchema>;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    const institution = await database.$transaction(async (transaction) => {
      await requireInspectorDistrictMembership(transaction, inspectorId, input.districtId);
      const created = await transaction.institution.create({ data: input, select: institutionSelect });
      await appendAuditEvent(transaction, {
        source: 'HTTP', actorInspectorId: inspectorId, districtId: created.districtId,
        action: AuditAction.INSTITUTION_CREATED, entityType: 'Institution', entityId: created.id,
        requestId, metadata: {},
      });
      return created;
    });
    response.status(201).json({ data: institution });
  });

  app.get('/api/v1/institutions/:id', async (request, response) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) throw invalidId();
    const institution = await findScopedInstitution(database, response.locals.inspectorId as string, id.data);
    response.json({ data: institution });
  });

  app.patch('/api/v1/institutions/:id', validateBody(updateSchema), async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const id = uuid.safeParse(request.params.id);
    if (!id.success) throw invalidId();
    const patch = request.body as InstitutionUpdate;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;
    const result = await database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "Institution" WHERE id = ${id.data}::uuid FOR UPDATE`;
      const institution = await findScopedInstitution(transaction, inspectorId, id.data);
      if (institution.archivedAt !== null) throw new ApiError(409, 'CONFLICT', 'لا يمكن تعديل مؤسسة مؤرشفة.');
      const changes = changedFields(institution, patch);
      const fields = Object.keys(changes).sort() as ChangedInstitutionField[];
      if (fields.length === 0) return institution;
      const updated = await transaction.institution.update({ where: { id: institution.id }, data: changes as Prisma.InstitutionUpdateInput, select: institutionSelect });
      await appendAuditEvent(transaction, {
        source: 'HTTP', actorInspectorId: inspectorId, districtId: institution.districtId,
        action: AuditAction.INSTITUTION_UPDATED, entityType: 'Institution', entityId: institution.id,
        requestId, metadata: { changedFields: fields },
      });
      return updated;
    });
    response.json({ data: result });
  });
}
