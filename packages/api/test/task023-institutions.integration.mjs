import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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
  assert.deepEqual(columns.map(({ column_name }) => column_name).sort(), ['archivedAt', 'createdAt', 'districtId', 'externalCode', 'id', 'name', 'updatedAt'].sort());
  const districtNameIndex = await db.$queryRaw`SELECT indexname, indexdef FROM pg_catalog.pg_indexes WHERE schemaname=${schemaName} AND tablename='Institution' AND indexname='Institution_districtId_name_idx'`;
  assert.equal(districtNameIndex.length, 1);
  assert.ok(districtNameIndex[0].indexdef.includes('districtId'));
  assert.ok(districtNameIndex[0].indexdef.includes('name'));
  const fks = await db.$queryRaw`SELECT confdeltype, confupdtype FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass(${`${schemaName}."Institution"`}) AND contype='f'`;
  assert.deepEqual(fks.map(({ confdeltype, confupdtype }) => ({ confdeltype, confupdtype })), [{ confdeltype: 'r', confupdtype: 'c' }]);
  const history = await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied FROM "${schemaName}"."_prisma_migrations"`);
  assert.deepEqual(history[0], { total: 4, applied: 4 });
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
