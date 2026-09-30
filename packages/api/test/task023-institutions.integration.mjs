import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { URLSearchParams } from 'node:url';

const require = createRequire(import.meta.url);
const testDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(testDir, '..');
const rootDir = resolve(apiDir, '../..');
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const password = 'task023-integration-password';

let databaseUrl;
let schemaName;
let schemaCreated = false;
let admin;
let db;
let server;
let baseUrl;
let inspector;
let districtA;
let districtB;
let otherDistrict;
let expiredDistrict;
let futureDistrict;
let otherInspector;
let inspectorWithoutDistrict;
let inactiveInspector;
let inactiveCookies;
let allowedCookies;
let csrf;

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL is required; refusing database access.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('TEST_DATABASE_URL is malformed; refusing database access.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
      || url.port !== '55432' || url.username !== 'task020_test_user'
      || url.pathname.replace(/^\//, '') !== 'task020_test' || url.searchParams.get('schema') !== 'public') {
    throw new Error('TEST_DATABASE_URL is not the approved isolated target.');
  }
  return raw;
}

function runPrisma(args, url, label) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', schemaPath], {
    cwd: rootDir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) {
    const details = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[redacted]');
    throw new Error(`${label} failed.${details.trim() ? ` ${details.trim()}` : ''}`);
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function cookieParts(response) {
  return (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).filter(Boolean);
}
function cookieValue(cookies, name) {
  const entry = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  assert.ok(entry);
  return decodeURIComponent(entry.slice(name.length + 1).split(';', 1)[0]);
}
async function request(path, { method = 'GET', cookies = [], csrfToken, body } = {}) {
  const headers = {};
  if (cookies.length) headers.cookie = cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
  if (csrfToken) headers['x-csrf-token'] = csrfToken;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function login(targetInspector = inspector) {
  const bootstrap = await request('/api/v1/auth/me');
  const bootCookies = cookieParts(bootstrap);
  const bootCsrf = cookieValue(bootCookies, 'inspector_csrf');
  const response = await request('/api/v1/auth/login', {
    method: 'POST', cookies: bootCookies, csrfToken: bootCsrf,
    body: { email: targetInspector.email, password },
  });
  return { response, cookies: cookieParts(response) };
}

before(async () => {
  databaseUrl = approvedUrl();
  runPrisma(['generate'], databaseUrl, 'Prisma Client generation');
  const { PrismaClient } = await import('@prisma/client');
  admin = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  if (identity[0]?.db !== 'task020_test' || identity[0]?.role !== 'task020_test_user') throw new Error('Isolated database identity mismatch.');
  const publicTables = await admin.$queryRaw`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename !~ '^pg_'`;
  const migrations = await admin.$queryRaw`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
  if (publicTables.length || migrations[0]?.present) throw new Error('Public isolated test schema is not empty; refusing migration.');

  schemaName = `task023_${process.pid}_${randomBytes(6).toString('hex')}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  schemaCreated = true;
  const scoped = new URL(databaseUrl);
  scoped.searchParams.set('schema', schemaName);
  runPrisma(['migrate', 'deploy'], scoped.toString(), 'Clean full migration deploy');
  runPrisma(['migrate', 'status'], scoped.toString(), 'Migration status');
  db = new PrismaClient({ datasources: { db: { url: scoped.toString() } } });
  await db.$connect();

  const { hashPassword } = await import('../dist/identity/password.js');
  const suffix = randomBytes(5).toString('hex');
  const passwordHash = await hashPassword(password);
  inspector = await db.inspector.create({ data: { email: `task023-${suffix}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  otherInspector = await db.inspector.create({ data: { email: `task023-other-${suffix}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  inspectorWithoutDistrict = await db.inspector.create({ data: { email: `task023-none-${suffix}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  inactiveInspector = await db.inspector.create({ data: { email: `task023-inactive-${suffix}@example.invalid`, passwordHash, status: 'INACTIVE' } });
  districtA = await db.district.create({ data: { name: `Allowed A ${suffix}` } });
  districtB = await db.district.create({ data: { name: `Allowed B ${suffix}` } });
  otherDistrict = await db.district.create({ data: { name: `Outside ${suffix}` } });
  expiredDistrict = await db.district.create({ data: { name: `Expired ${suffix}` } });
  futureDistrict = await db.district.create({ data: { name: `Future ${suffix}` } });
  const now = new Date(Date.now() - 60_000);
  await db.inspectorDistrictMembership.createMany({ data: [
    ...[districtA, districtB].map(({ id }) => ({ inspectorId: inspector.id, districtId: id, role: 'INSPECTOR', validFrom: now })),
    { inspectorId: inspector.id, districtId: expiredDistrict.id, role: 'INSPECTOR', validFrom: new Date(now.getTime() - 120_000), validTo: now },
    { inspectorId: inspector.id, districtId: futureDistrict.id, role: 'INSPECTOR', validFrom: new Date(Date.now() + 60_000) },
    { inspectorId: otherInspector.id, districtId: otherDistrict.id, role: 'INSPECTOR', validFrom: now },
  ] });

  const { createApp } = await import('../dist/app.js');
  const { registerAuthRoutes, requireAuthenticatedInspector } = await import('../dist/identity/auth-routes.js');
  const { registerDistrictContextRoute } = await import('../dist/identity/district-routes.js');
  const { registerInstitutionRoutes } = await import('../dist/institutions/routes.js');
  const app = createApp((instance) => {
    registerAuthRoutes(instance, db);
    const requireInspector = requireAuthenticatedInspector(db);
    registerDistrictContextRoute(instance, db, requireInspector);
    registerInstitutionRoutes(instance, db, requireInspector);
  });
  await new Promise((resolveListen, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolveListen(listener));
    listener.once('error', reject);
  }).then((listener) => { server = listener; baseUrl = `http://127.0.0.1:${listener.address().port}`; });
  const activeLogin = await login();
  assert.equal(activeLogin.response.status, 200);
  allowedCookies = activeLogin.cookies;
  csrf = cookieValue(allowedCookies, 'inspector_csrf');
  const inactiveLogin = await login(inactiveInspector);
  assert.equal(inactiveLogin.response.status, 401);
  inactiveCookies = inactiveLogin.cookies;
});

after(async () => {
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  await db?.$disconnect();
  if (admin && schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin?.$disconnect();
});

test('TASK-023 migration chain installs Institution fields, FK and district/name index', async () => {
  const columns = await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema=${schemaName} AND table_name='Institution'`;
  assert.deepEqual(columns.map(({ column_name }) => column_name).sort(), ['address', 'archivedAt', 'createdAt', 'directorPhone', 'districtId', 'externalCode', 'id', 'municipality', 'name', 'updatedAt'].sort());
  const districtNameIndex = await db.$queryRaw`SELECT indexname, indexdef FROM pg_catalog.pg_indexes WHERE schemaname=${schemaName} AND tablename='Institution' AND indexname='Institution_districtId_name_idx'`;
  assert.equal(districtNameIndex.length, 1);
  assert.ok(districtNameIndex[0].indexdef.includes('districtId'));
  assert.ok(districtNameIndex[0].indexdef.includes('name'));
  const fks = await db.$queryRaw`SELECT confdeltype, confupdtype FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass(${`${schemaName}."Institution"`}) AND contype='f'`;
  assert.deepEqual(fks.map(({ confdeltype, confupdtype }) => ({ confdeltype, confupdtype })), [{ confdeltype: 'r', confupdtype: 'c' }]);
  const history = await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied FROM "${schemaName}"."_prisma_migrations"`);
  assert.deepEqual(history[0], { total: 11, applied: 11 });
});

test('authenticated District context returns only current memberships for the session owner', async () => {
  const activeResponse = await request('/api/v1/me/districts', { cookies: allowedCookies });
  assert.equal(activeResponse.status, 200);
  const activePayload = await activeResponse.json();
  assert.deepEqual(activePayload, { items: [
    { id: districtA.id, name: districtA.name },
    { id: districtB.id, name: districtB.name },
  ] });
  assert.ok(activePayload.items.every((item) => Object.keys(item).sort().join(',') === 'id,name'));
  assert.ok(!activePayload.items.some(({ id }) => [expiredDistrict.id, futureDistrict.id, otherDistrict.id].includes(id)));

  const otherLogin = await login(otherInspector);
  assert.equal(otherLogin.response.status, 200);
  const otherPayload = await (await request('/api/v1/me/districts', { cookies: otherLogin.cookies })).json();
  assert.deepEqual(otherPayload, { items: [{ id: otherDistrict.id, name: otherDistrict.name }] });

  const noDistrictLogin = await login(inspectorWithoutDistrict);
  assert.equal(noDistrictLogin.response.status, 200);
  const emptyPayload = await (await request('/api/v1/me/districts', { cookies: noDistrictLogin.cookies })).json();
  assert.deepEqual(emptyPayload, { items: [] });
});

test('District context rejects unauthenticated and inactive Inspector sessions', async () => {
  const unauthenticated = await request('/api/v1/me/districts');
  assert.equal(unauthenticated.status, 401);
  const inactive = await request('/api/v1/me/districts', { cookies: inactiveCookies });
  assert.equal(inactive.status, 401);
});

test('create is validated, authenticated and limited to current District scope', async () => {
  const created = await request('/api/v1/institutions', { method: 'POST', cookies: allowedCookies, csrfToken: csrf, body: { districtId: districtA.id, name: 'North Primary', externalCode: 'N-01' } });
  assert.equal(created.status, 201);
  const payload = await created.json();
  assert.equal(payload.data.name, 'North Primary');
  assert.equal(payload.data.districtId, districtA.id);
  assert.equal(payload.data.archivedAt, null);
  const outside = await request('/api/v1/institutions', { method: 'POST', cookies: allowedCookies, csrfToken: csrf, body: { districtId: otherDistrict.id, name: 'Outside School' } });
  assert.equal(outside.status, 404);
  assert.equal(await db.institution.count({ where: { name: 'Outside School' } }), 0);
  const invalid = await request('/api/v1/institutions', { method: 'POST', cookies: allowedCookies, csrfToken: csrf, body: { districtId: districtA.id, name: '  ' } });
  assert.equal(invalid.status, 400);
  const invalidBody = await invalid.json();
  assert.equal(invalidBody.error.code, 'VALIDATION_ERROR');
  assert.ok(invalid.headers.get('x-request-id'));
  assert.ok(!JSON.stringify(invalidBody).includes('  '));
});

test('TASK-042 create persists normalized workplace data and writes a minimal scoped audit', async () => {
  const create = await request('/api/v1/institutions', {
    method: 'POST', cookies: allowedCookies, csrfToken: csrf,
    body: { districtId: districtA.id, name: 'ابتدائية النور', externalCode: 'N-02', municipality: ' بلدية   وهران ', address: ' شارع   الاستقلال ', directorPhone: '0555 123 456' },
  });
  assert.equal(create.status, 201);
  const { data } = await create.json();
  assert.deepEqual(data, {
    id: data.id, districtId: districtA.id, name: 'ابتدائية النور', externalCode: 'N-02',
    municipality: 'بلدية وهران', address: 'شارع الاستقلال', directorPhone: '+213555123456',
    archivedAt: null, createdAt: data.createdAt, updatedAt: data.updatedAt,
  });
  assert.ok(create.headers.get('x-request-id'));
  const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'INSTITUTION_CREATED', entityId: data.id } });
  assert.equal(audit.actorInspectorId, inspector.id);
  assert.equal(audit.districtId, districtA.id);
  assert.equal(audit.entityType, 'Institution');
  assert.equal(audit.requestId, create.headers.get('x-request-id'));
  assert.deepEqual(audit.metadata, {});
  assert.equal(JSON.stringify(audit.metadata).includes('ابتدائية النور'), false);

  const fixed = await request('/api/v1/institutions', {
    method: 'POST', cookies: allowedCookies, csrfToken: csrf,
    body: { districtId: districtA.id, name: 'ابتدائية السهل', directorPhone: '021234567' },
  });
  assert.equal(fixed.status, 201);
  const fixedData = (await fixed.json()).data;
  assert.equal(fixedData.directorPhone, '+21321234567');
  assert.equal(fixedData.municipality, null);
  assert.equal(fixedData.address, null);

  const explicitlyCleared = await request('/api/v1/institutions', {
    method: 'POST', cookies: allowedCookies, csrfToken: csrf,
    body: { districtId: districtA.id, name: 'ابتدائية الوادي', municipality: null, address: null, directorPhone: null },
  });
  assert.equal(explicitlyCleared.status, 201);
  const explicitlyClearedData = (await explicitlyCleared.json()).data;
  assert.deepEqual([explicitlyClearedData.municipality, explicitlyClearedData.address, explicitlyClearedData.directorPhone], [null, null, null]);
});

test('TASK-042 workplace validation rejects overlong, malformed, empty, unknown and raw-overlimit input', async () => {
  const valid = { districtId: districtA.id, name: 'مؤسسة تحقق' };
  for (const body of [
    { ...valid, municipality: 'و'.repeat(151) },
    { ...valid, address: 'ع'.repeat(301) },
    { ...valid, municipality: '' }, { ...valid, address: '   ' },
    { ...valid, directorPhone: 'invalid' },
    { ...valid, directorPhone: '021234567             ' },
    { ...valid, unexpected: 'unknown' },
  ]) {
    const response = await request('/api/v1/institutions', { method: 'POST', cookies: allowedCookies, csrfToken: csrf, body });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
  }
  assert.equal(await db.institution.count({ where: { name: 'مؤسسة تحقق' } }), 0);
  const noCsrf = await request('/api/v1/institutions', { method: 'POST', cookies: allowedCookies, body: valid });
  assert.equal(noCsrf.status, 403);
  const unauthenticated = await request('/api/v1/institutions', { method: 'POST', body: valid });
  assert.equal(unauthenticated.status, 401);
  assert.equal(await db.institution.count({ where: { name: 'مؤسسة تحقق' } }), 0);
});

test('TASK-042 detail and update expose authorized fields and conceal cross-district records', async () => {
  const institution = await db.institution.create({ data: {
    districtId: districtA.id, name: 'Source Institution', externalCode: 'KEEP',
    municipality: 'بلدية قديمة', address: 'عنوان قديم', directorPhone: '+21321234567',
  } });
  const detail = await request(`/api/v1/institutions/${institution.id}`, { cookies: allowedCookies });
  assert.equal(detail.status, 200);
  assert.deepEqual(Object.keys((await detail.json()).data).sort(), [
    'id', 'districtId', 'name', 'externalCode', 'municipality', 'address', 'directorPhone', 'archivedAt', 'createdAt', 'updatedAt',
  ].sort());

  const update = await request(`/api/v1/institutions/${institution.id}`, {
    method: 'PATCH', cookies: allowedCookies, csrfToken: csrf,
    body: { name: ' ابتدائية   جديدة ', municipality: ' بلدية   جديدة ', address: ' شارع   جديد ', directorPhone: '0555 123 456' },
  });
  assert.equal(update.status, 200);
  const updated = (await update.json()).data;
  assert.deepEqual({ name: updated.name, externalCode: updated.externalCode, municipality: updated.municipality, address: updated.address, directorPhone: updated.directorPhone }, {
    name: 'ابتدائية جديدة', externalCode: 'KEEP', municipality: 'بلدية جديدة', address: 'شارع جديد', directorPhone: '+213555123456',
  });
  const updateAudit = await db.auditLog.findFirstOrThrow({ where: { action: 'INSTITUTION_UPDATED', entityId: institution.id } });
  assert.equal(updateAudit.actorInspectorId, inspector.id);
  assert.equal(updateAudit.districtId, districtA.id);
  assert.equal(updateAudit.entityType, 'Institution');
  assert.equal(updateAudit.requestId, update.headers.get('x-request-id'));
  assert.deepEqual(updateAudit.metadata, { changedFields: ['address', 'directorPhone', 'municipality', 'name'] });
  assert.equal(JSON.stringify(updateAudit.metadata).includes('بلدية جديدة'), false);
  assert.equal(JSON.stringify(updateAudit.metadata).includes('+213555123456'), false);

  const clear = await request(`/api/v1/institutions/${institution.id}`, {
    method: 'PATCH', cookies: allowedCookies, csrfToken: csrf,
    body: { municipality: null, address: null, directorPhone: null },
  });
  assert.equal(clear.status, 200);
  const clearResponse = (await clear.json()).data;
  const clearStored = await db.institution.findUniqueOrThrow({ where: { id: institution.id } });
  assert.deepEqual([clearResponse.municipality, clearResponse.address, clearResponse.directorPhone], [null, null, null]);
  assert.deepEqual([clearStored.municipality, clearStored.address, clearStored.directorPhone], [null, null, null]);
  const unchangedBefore = await db.institution.findUniqueOrThrow({ where: { id: institution.id } });
  const auditCountBeforeNoop = await db.auditLog.count({ where: { entityId: institution.id } });
  const noOp = await request(`/api/v1/institutions/${institution.id}`, {
    method: 'PATCH', cookies: allowedCookies, csrfToken: csrf,
    body: { name: 'ابتدائية جديدة', municipality: null, address: null, directorPhone: null },
  });
  assert.equal(noOp.status, 200);
  assert.equal((await db.institution.findUniqueOrThrow({ where: { id: institution.id } })).updatedAt.getTime(), unchangedBefore.updatedAt.getTime());
  assert.equal(await db.auditLog.count({ where: { entityId: institution.id } }), auditCountBeforeNoop);

  for (const body of [{ name: '' }, { municipality: '' }, { address: ' ' }, { directorPhone: '' }, { districtId: districtB.id }, { externalCode: 'OTHER' }, { archivedAt: null }, {}]) {
    const response = await request(`/api/v1/institutions/${institution.id}`, { method: 'PATCH', cookies: allowedCookies, csrfToken: csrf, body });
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  const noCsrf = await request(`/api/v1/institutions/${institution.id}`, { method: 'PATCH', cookies: allowedCookies, body: { name: 'بدون حماية' } });
  assert.equal(noCsrf.status, 403);
  assert.equal((await db.institution.findUniqueOrThrow({ where: { id: institution.id } })).name, 'ابتدائية جديدة');
  const malformedId = await request('/api/v1/institutions/not-a-uuid', { cookies: allowedCookies });
  assert.equal(malformedId.status, 400);
  const outside = await db.institution.create({ data: { districtId: otherDistrict.id, name: 'Private Outside Institution' } });
  const outsideRead = await request(`/api/v1/institutions/${outside.id}`, { cookies: allowedCookies });
  const outsideUpdate = await request(`/api/v1/institutions/${outside.id}`, { method: 'PATCH', cookies: allowedCookies, csrfToken: csrf, body: { name: 'Try Update' } });
  const missing = await request(`/api/v1/institutions/${randomUUID()}`, { cookies: allowedCookies });
  assert.equal(outsideRead.status, 404);
  assert.equal(outsideUpdate.status, 404);
  assert.equal((await outsideRead.json()).error.message, (await outsideUpdate.json()).error.message);
  assert.equal(await db.institution.findUniqueOrThrow({ where: { id: outside.id } }).then(({ name }) => name), 'Private Outside Institution');
  assert.equal(missing.status, 404);

  const expiredResource = await db.institution.create({ data: { districtId: expiredDistrict.id, name: 'Expired Scope Institution' } });
  const expiredRead = await request(`/api/v1/institutions/${expiredResource.id}`, { cookies: allowedCookies });
  const expiredUpdate = await request(`/api/v1/institutions/${expiredResource.id}`, { method: 'PATCH', cookies: allowedCookies, csrfToken: csrf, body: { name: 'Attempt Expired Update' } });
  const expiredCreate = await request('/api/v1/institutions', { method: 'POST', cookies: allowedCookies, csrfToken: csrf, body: { districtId: expiredDistrict.id, name: 'Attempt Expired Create' } });
  assert.equal(expiredRead.status, 404);
  assert.equal(expiredUpdate.status, 404);
  assert.equal(expiredCreate.status, 404);
  assert.equal((await db.institution.findUniqueOrThrow({ where: { id: expiredResource.id } })).name, 'Expired Scope Institution');
});

test('TASK-042 archived institutions remain readable but cannot be updated', async () => {
  const archived = await db.institution.create({ data: { districtId: districtA.id, name: 'Archived Detail', archivedAt: new Date() } });
  assert.equal((await request(`/api/v1/institutions/${archived.id}`, { cookies: allowedCookies })).status, 200);
  const update = await request(`/api/v1/institutions/${archived.id}`, { method: 'PATCH', cookies: allowedCookies, csrfToken: csrf, body: { name: 'Changed' } });
  assert.equal(update.status, 409);
  assert.equal((await db.institution.findUniqueOrThrow({ where: { id: archived.id } })).name, 'Archived Detail');
});

test('TASK-042 required audit append failure rolls create and update back', async () => {
  await db.$executeRawUnsafe(`CREATE FUNCTION "${schemaName}".reject_task042_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('INSTITUTION_CREATED','INSTITUTION_UPDATED') THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_task042_audit BEFORE INSERT ON "${schemaName}"."AuditLog" FOR EACH ROW EXECUTE FUNCTION "${schemaName}".reject_task042_audit()`);
  try {
    const create = await request('/api/v1/institutions', { method: 'POST', cookies: allowedCookies, csrfToken: csrf, body: { districtId: districtA.id, name: 'Rollback Create' } });
    assert.equal(create.status, 500);
    assert.equal(await db.institution.count({ where: { name: 'Rollback Create' } }), 0);
    const target = await db.institution.create({ data: { districtId: districtA.id, name: 'Rollback Update' } });
    const update = await request(`/api/v1/institutions/${target.id}`, { method: 'PATCH', cookies: allowedCookies, csrfToken: csrf, body: { name: 'Should Roll Back' } });
    assert.equal(update.status, 500);
    assert.equal((await db.institution.findUniqueOrThrow({ where: { id: target.id } })).name, 'Rollback Update');
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER reject_task042_audit ON "${schemaName}"."AuditLog"`);
    await db.$executeRawUnsafe(`DROP FUNCTION "${schemaName}".reject_task042_audit()`);
  }
});

test('list searches and paginates only active Institutions across authorized Districts', async () => {
  const a = await db.institution.create({ data: { districtId: districtA.id, name: 'Atlas School' } });
  const b = await db.institution.create({ data: { districtId: districtB.id, name: 'Beacon School' } });
  const archived = await db.institution.create({ data: { districtId: districtA.id, name: 'Archived Beacon', archivedAt: new Date() } });
  const outside = await db.institution.create({ data: { districtId: otherDistrict.id, name: 'Outside Beacon' } });

  const response = await request('/api/v1/institutions?q=beacon', { cookies: allowedCookies });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.data.map((row) => row.id), [b.id]);
  assert.equal(result.page.total, 1);
  assert.ok(response.headers.get('x-request-id'));
  const districtOnly = await request(`/api/v1/institutions?districtId=${districtA.id}`, { cookies: allowedCookies });
  const districtRows = await districtOnly.json();
  assert.ok(districtRows.data.some((row) => row.id === a.id));
  assert.ok(!districtRows.data.some((row) => row.id === outside.id));
  const denied = await request(`/api/v1/institutions?districtId=${otherDistrict.id}`, { cookies: allowedCookies });
  assert.equal(denied.status, 404);

  const page1Response = await request('/api/v1/institutions?limit=1', { cookies: allowedCookies });
  const page1 = await page1Response.json();
  assert.equal(page1.data.length, 1);
  let cursor = page1.page.nextCursor;
  let previous = page1.data[0];
  const traversed = [previous.id];
  while (cursor) {
    const pageResponse = await request(`/api/v1/institutions?limit=1&cursor=${cursor}`, { cookies: allowedCookies });
    const page = await pageResponse.json();
    assert.equal(page.data.length, 1);
    assert.ok(previous.name.localeCompare(page.data[0].name) <= 0);
    assert.ok(previous.name !== page.data[0].name || previous.id.localeCompare(page.data[0].id) < 0);
    traversed.push(page.data[0].id);
    previous = page.data[0];
    cursor = page.page.nextCursor;
  }
  assert.equal(new Set(traversed).size, traversed.length);
  assert.equal(traversed.length, await db.institution.count({ where: { districtId: { in: [districtA.id, districtB.id] }, archivedAt: null } }));
  assert.equal(await db.institution.count({ where: { id: archived.id } }), 1);

  const empty = await request(`/api/v1/institutions?districtId=${districtB.id}&q=missing`, { cookies: allowedCookies });
  assert.deepEqual((await empty.json()).data, []);
});

test('archived Institutions are excluded from default list, q, and page counts without deletion', async () => {
  const active = await db.institution.create({ data: { districtId: districtA.id, name: 'Current Primary' } });
  const archived = await db.institution.create({ data: { districtId: districtA.id, name: 'Archived Primary', archivedAt: new Date() } });
  const listed = await (await request('/api/v1/institutions', { cookies: allowedCookies })).json();
  assert.ok(listed.data.some(({ id }) => id === active.id));
  assert.ok(!listed.data.some(({ id }) => id === archived.id));
  const q = await (await request('/api/v1/institutions?q=Archived%20Primary', { cookies: allowedCookies })).json();
  assert.ok(!q.data.some(({ id }) => id === archived.id));
  const allActiveCount = await db.institution.count({ where: { districtId: { in: [districtA.id, districtB.id] }, archivedAt: null } });
  let seen = [];
  let cursor;
  do {
    const query = new URLSearchParams({ limit: '1' });
    if (cursor) query.set('cursor', cursor);
    const page = await (await request(`/api/v1/institutions?${query}`, { cookies: allowedCookies })).json();
    seen.push(...page.data.map(({ id }) => id));
    cursor = page.page.nextCursor;
  } while (cursor);
  assert.equal(seen.length, allActiveCount);
  assert.equal(listed.page.total, allActiveCount);
  assert.ok(!seen.includes(archived.id));
  assert.equal(await db.institution.count({ where: { id: archived.id } }), 1);
});

test('unauthenticated list and malformed pagination are rejected', async () => {
  const unauthenticated = await request('/api/v1/institutions');
  assert.equal(unauthenticated.status, 401);
  const invalid = await request('/api/v1/institutions?limit=1000', { cookies: allowedCookies });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
});
