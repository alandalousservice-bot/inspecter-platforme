import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { assertLiveTestDatabase, createOwnedTestSchema, dropOwnedTestSchema, generateTestSchema } from '../../../scripts/test-schema-safety.mjs';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const migrationsDir = join(apiDir, 'prisma', 'migrations');
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const migrationName = '20261003130000_task_076a_institution_location';
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(require('node:fs').readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const password = 'task076a-synthetic-password';
let baseUrl; let admin; let db; let upgradeDb; let server; let appUrl;
let cleanSchema; let upgradeSchema; let cleanSchemaCreated = false; let upgradeSchemaCreated = false; let tempRoot;
let inspector; let inactiveInspector; let activeCookies; let csrf; let district; let outsideDistrict;

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('Isolated test target is required; refusing database access.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Isolated test target is malformed.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55432'
    || decodeURIComponent(url.username) !== 'task020_test_user' || url.pathname !== '/task020_test'
    || url.searchParams.get('schema') !== 'public') throw new Error('Unapproved isolated test database target.');
  return raw;
}

function runPrisma(args, url, selectedSchema = schemaPath) {
  const result = require('node:child_process').spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', selectedSchema], {
    cwd: rootDir, encoding: 'utf8', timeout: 180_000, windowsHide: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) {
    const details = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/giu, '[redacted]');
    throw new Error(`Isolated Prisma ${args[0]} failed.${details.trim() ? ` ${details.trim()}` : ''}`);
  }
}

function cookieParts(response) { return (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).filter(Boolean); }
function cookieHeader(parts) { return parts.map((part) => part.split(';', 1)[0]).join('; '); }
function cookieValue(parts, name) {
  const part = parts.find((value) => value.startsWith(`${name}=`));
  assert.ok(part);
  return decodeURIComponent(part.split(';', 1)[0].slice(name.length + 1));
}
async function request(path, { method = 'GET', cookies = [], csrfToken, body } = {}) {
  const headers = {};
  if (cookies.length) headers.cookie = cookieHeader(cookies);
  if (csrfToken) headers['x-csrf-token'] = csrfToken;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${appUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function login(target = inspector) {
  const initial = cookieParts(await request('/api/v1/auth/me'));
  const bootCsrf = cookieValue(initial, 'inspector_csrf');
  const response = await request('/api/v1/auth/login', {
    method: 'POST', cookies: initial, csrfToken: bootCsrf, body: { email: target.email, password },
  });
  return { response, cookies: cookieParts(response) };
}

before(async () => {
  baseUrl = approvedUrl();
  runPrisma(['generate'], baseUrl);
  const { PrismaClient } = await import('@prisma/client');
  admin = new PrismaClient({ datasources: { db: { url: baseUrl } } }); await admin.$connect();
  await assertLiveTestDatabase(admin);
  cleanSchema = generateTestSchema('task076a_clean');
  upgradeSchema = generateTestSchema('task076a_upgrade');
  const cleanUrl = await createOwnedTestSchema(admin, baseUrl, cleanSchema); cleanSchemaCreated = true;
  const upgradeUrl = await createOwnedTestSchema(admin, baseUrl, upgradeSchema); upgradeSchemaCreated = true;
  await assertLiveTestDatabase(admin);
  runPrisma(['migrate', 'deploy'], cleanUrl);
  runPrisma(['migrate', 'status'], cleanUrl);
  db = new PrismaClient({ datasources: { db: { url: cleanUrl } } }); await db.$connect();

  tempRoot = mkdtempSync(join(tmpdir(), 'task076a-prisma-upgrade-'));
  const tempMigrations = join(tempRoot, 'migrations'); mkdirSync(tempMigrations);
  cpSync(join(migrationsDir, 'migration_lock.toml'), join(tempRoot, 'migration_lock.toml'));
  const allMigrations = readdirSync(migrationsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.equal(allMigrations.filter((name) => name === migrationName).length, 1);
  for (const name of allMigrations.filter((name) => name < migrationName)) cpSync(join(migrationsDir, name), join(tempMigrations, name), { recursive: true });
  const tempSchema = join(tempRoot, 'schema.prisma'); cpSync(schemaPath, tempSchema);
  runPrisma(['migrate', 'deploy'], upgradeUrl, tempSchema);
  const oldSchema = new PrismaClient({ datasources: { db: { url: upgradeUrl } } }); await oldSchema.$connect();
  const oldDistrictId = randomUUID(); const oldInstitutionId = randomUUID(); const oldTeacherId = randomUUID();
  const schema = new URL(upgradeUrl).searchParams.get('schema');
  await oldSchema.$executeRawUnsafe(`INSERT INTO "${schema}"."District" ("id","name","createdAt","updatedAt") VALUES ('${oldDistrictId}','Existing district',now(),now())`);
  await oldSchema.$executeRawUnsafe(`INSERT INTO "${schema}"."Institution" ("id","districtId","name","createdAt","updatedAt") VALUES ('${oldInstitutionId}','${oldDistrictId}','Existing institution',now(),now())`);
  await oldSchema.$executeRawUnsafe(`INSERT INTO "${schema}"."Teacher" ("id","districtId","name","surname","institutionId","createdAt","updatedAt") VALUES ('${oldTeacherId}','${oldDistrictId}','Existing','Teacher','${oldInstitutionId}',now(),now())`);
  const beforeCounts = await oldSchema.$queryRawUnsafe(`SELECT (SELECT count(*)::int FROM "${schema}"."District") AS districts,(SELECT count(*)::int FROM "${schema}"."Institution") AS institutions,(SELECT count(*)::int FROM "${schema}"."Teacher") AS teachers`);
  assert.deepEqual(beforeCounts[0], { districts: 1, institutions: 1, teachers: 1 });
  await oldSchema.$disconnect();
  cpSync(join(migrationsDir, migrationName), join(tempMigrations, migrationName), { recursive: true });
  runPrisma(['migrate', 'deploy'], upgradeUrl, tempSchema);
  upgradeDb = new PrismaClient({ datasources: { db: { url: upgradeUrl } } }); await upgradeDb.$connect();
  const preserved = await upgradeDb.$queryRaw`SELECT i."latitude",i."longitude",i."locationSource",t."institutionId" FROM "Institution" i JOIN "Teacher" t ON t."institutionId"=i."id" WHERE i."id"=${oldInstitutionId}::uuid`;
  assert.deepEqual(preserved, [{ latitude: null, longitude: null, locationSource: null, institutionId: oldInstitutionId }]);
  const afterCounts = await upgradeDb.$queryRaw`SELECT (SELECT count(*)::int FROM "District") AS districts,(SELECT count(*)::int FROM "Institution") AS institutions,(SELECT count(*)::int FROM "Teacher") AS teachers`;
  assert.deepEqual(afterCounts[0], beforeCounts[0]);

  const { hashPassword } = await import('../dist/identity/password.js');
  const suffix = randomBytes(5).toString('hex');
  inspector = await db.inspector.create({ data: { email: `task076a-${suffix}@example.invalid`, passwordHash: await hashPassword(password), status: 'ACTIVE' } });
  inactiveInspector = await db.inspector.create({ data: { email: `task076a-inactive-${suffix}@example.invalid`, passwordHash: await hashPassword(password), status: 'INACTIVE' } });
  district = await db.district.create({ data: { name: `TASK-076A district ${suffix}` } });
  outsideDistrict = await db.district.create({ data: { name: `TASK-076A other district ${suffix}` } });
  await db.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date('2020-01-01T00:00:00Z') } });
  await db.inspectorDistrictMembership.create({ data: { inspectorId: inactiveInspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date('2020-01-01T00:00:00Z') } });

  const { createApp } = await import('../dist/app.js');
  const { registerAuthRoutes, requireAuthenticatedInspector } = await import('../dist/identity/auth-routes.js');
  const { registerInstitutionRoutes } = await import('../dist/institutions/routes.js');
  const { registerTeacherSubmissionRoutes } = await import('../dist/intake/routes.js');
  const { registerInspectorSubmissionRoutes } = await import('../dist/intake/inspector-routes.js');
  const { registerSubmissionDecisionRoute } = await import('../dist/intake/decision-routes.js');
  const { createPublicSubmissionRateLimiter } = await import('../dist/intake/rate-limit.js');
  const app = createApp((instance) => {
    registerAuthRoutes(instance, db);
    const requireInspector = requireAuthenticatedInspector(db);
    registerInstitutionRoutes(instance, db, requireInspector);
    registerTeacherSubmissionRoutes(instance, db);
    registerInspectorSubmissionRoutes(instance, db, requireInspector);
    registerSubmissionDecisionRoute(instance, db, requireInspector);
  }, { publicSubmissionRateLimiter: createPublicSubmissionRateLimiter({ limit: 100, resolveClientIp: (incoming) => incoming.socket.remoteAddress }) });
  server = app.listen(0, '127.0.0.1');
  await new Promise((yes, no) => { server.once('listening', yes); server.once('error', no); });
  appUrl = `http://127.0.0.1:${server.address().port}`;
  const active = await login(); assert.equal(active.response.status, 200); activeCookies = active.cookies; csrf = cookieValue(activeCookies, 'inspector_csrf');
  const inactive = await login(inactiveInspector); assert.equal(inactive.response.status, 401);
});

after(async () => {
  if (server) await new Promise((yes) => server.close(yes));
  await db?.$disconnect(); await upgradeDb?.$disconnect();
  if (admin && cleanSchemaCreated) await dropOwnedTestSchema(admin, baseUrl, cleanSchema);
  if (admin && upgradeSchemaCreated) await dropOwnedTestSchema(admin, baseUrl, upgradeSchema);
  await admin?.$disconnect();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('clean and upgrade migration add exact nullable Decimal columns, checks and preserve existing relationships', async () => {
  const migrations = readdirSync(migrationsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  assert.equal(migrations.filter((entry) => entry.name === migrationName).length, 1);
  const history = await db.$queryRaw`SELECT migration_name,finished_at FROM "_prisma_migrations" WHERE migration_name=${migrationName}`;
  assert.equal(history.length, 1); assert.ok(history[0].finished_at);
  const columns = await db.$queryRaw`SELECT column_name,is_nullable,data_type,numeric_precision,numeric_scale,character_maximum_length FROM information_schema.columns WHERE table_schema=${cleanSchema} AND table_name='Institution' AND column_name IN ('latitude','longitude','locationSource') ORDER BY column_name`;
  assert.deepEqual(columns.map((column) => [column.column_name, column.is_nullable, column.data_type, column.numeric_precision, column.numeric_scale, column.character_maximum_length]), [
    ['latitude', 'YES', 'numeric', 9, 6, null], ['locationSource', 'YES', 'character varying', null, null, 32], ['longitude', 'YES', 'numeric', 9, 6, null],
  ]);
  const checks = await db.$queryRaw`SELECT conname,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace=${cleanSchema}::regnamespace AND (conname LIKE 'Institution_%location%check' OR conname LIKE 'Institution_%_range_check')`;
  assert.equal(checks.length, 3); assert.ok(checks.every((check) => check.convalidated));
  assert.ok(checks.some((check) => check.conname === 'Institution_location_pair_source_check'));
  assert.ok(checks.some((check) => check.conname === 'Institution_latitude_range_check'));
  assert.ok(checks.some((check) => check.conname === 'Institution_longitude_range_check'));
  const fk = await db.$queryRaw`SELECT conname,confdeltype,confupdtype,convalidated FROM pg_constraint WHERE connamespace=${cleanSchema}::regnamespace AND conname='Institution_districtId_fkey'`;
  assert.deepEqual(fk.map((row) => [row.confdeltype,row.confupdtype,row.convalidated]), [['r','c',true]]);
  const applied = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  assert.equal(applied.length, migrations.length);
});

test('PostgreSQL enforces coordinate ranges and all-null or complete pair/source states', async () => {
  const institution = await db.institution.create({ data: { districtId: district.id, name: 'DB constraint target' } });
  const rejects = [
    () => db.$executeRaw`UPDATE "Institution" SET "latitude"=90.000001,"longitude"=0,"locationSource"='MANUAL_INSPECTOR' WHERE id=${institution.id}::uuid`,
    () => db.$executeRaw`UPDATE "Institution" SET "latitude"=-90.000001,"longitude"=0,"locationSource"='MANUAL_INSPECTOR' WHERE id=${institution.id}::uuid`,
    () => db.$executeRaw`UPDATE "Institution" SET "latitude"=0,"longitude"=180.000001,"locationSource"='MANUAL_INSPECTOR' WHERE id=${institution.id}::uuid`,
    () => db.$executeRaw`UPDATE "Institution" SET "latitude"=0,"longitude"=-180.000001,"locationSource"='MANUAL_INSPECTOR' WHERE id=${institution.id}::uuid`,
    () => db.$executeRaw`UPDATE "Institution" SET "latitude"=1 WHERE id=${institution.id}::uuid`,
    () => db.$executeRaw`UPDATE "Institution" SET "latitude"=1,"longitude"=1 WHERE id=${institution.id}::uuid`,
    () => db.$executeRaw`UPDATE "Institution" SET "locationSource"='MANUAL_INSPECTOR' WHERE id=${institution.id}::uuid`,
    () => db.$executeRaw`UPDATE "Institution" SET "latitude"=1,"longitude"=1,"locationSource"='IMPORTED' WHERE id=${institution.id}::uuid`,
  ];
  for (const statement of rejects) await assert.rejects(statement);
  await db.$executeRaw`UPDATE "Institution" SET "latitude"=0,"longitude"=0,"locationSource"='MANUAL_INSPECTOR' WHERE id=${institution.id}::uuid`;
  assert.equal((await db.institution.findUniqueOrThrow({ where: { id: institution.id } })).latitude.toFixed(6), '0.000000');
});

test('existing Institution APIs serialize locations and strictly validate manual POST/PATCH decimals', async () => {
  const noLocation = await request('/api/v1/institutions', { method: 'POST', cookies: activeCookies, csrfToken: csrf, body: { districtId: district.id, name: 'No location' } });
  assert.equal(noLocation.status, 201); const empty = (await noLocation.json()).data; assert.equal(empty.location, null);
  const createAudit = await db.auditLog.findFirstOrThrow({ where: { action: 'INSTITUTION_CREATED', entityId: empty.id } }); assert.deepEqual(createAudit.metadata, {});

  const validPairs = [
    ['0', '0', '0.000000', '0.000000'], ['90', '180', '90.000000', '180.000000'],
    ['-90', '-180', '-90.000000', '-180.000000'], ['36.7538', '3.0588', '36.753800', '3.058800'],
  ];
  const institutions = [];
  for (const [lat, lng, normalizedLat, normalizedLng] of validPairs) {
    const response = await request('/api/v1/institutions', { method: 'POST', cookies: activeCookies, csrfToken: csrf, body: { districtId: district.id, name: `Valid ${lat} ${lng}`, location: { latitude: lat, longitude: lng } } });
    assert.equal(response.status, 201); const { data } = await response.json();
    assert.deepEqual(data.location, { latitude: normalizedLat, longitude: normalizedLng, source: 'MANUAL_INSPECTOR' }); institutions.push(data);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'INSTITUTION_CREATED', entityId: data.id } });
    assert.deepEqual(audit.metadata, { locationChange: 'SET' });
    assert.equal(JSON.stringify(audit.metadata).includes(lat), false); assert.equal(JSON.stringify(audit.metadata).includes(lng), false);
  }
  const selected = institutions[3];
  const detail = await request(`/api/v1/institutions/${selected.id}`, { cookies: activeCookies });
  assert.deepEqual((await detail.json()).data.location, { latitude: '36.753800', longitude: '3.058800', source: 'MANUAL_INSPECTOR' });
  const list = await request('/api/v1/institutions?limit=100', { cookies: activeCookies });
  assert.ok((await list.json()).data.some((row) => row.id === selected.id && row.location?.latitude === '36.753800'));

  const invalidLocations = [
    { latitude: '90.000001', longitude: '0' }, { latitude: '-90.000001', longitude: '0' },
    { latitude: '0', longitude: '180.000001' }, { latitude: '0', longitude: '-180.000001' },
    { latitude: '36.1234567', longitude: '3' }, { latitude: '1e2', longitude: '3' },
    { latitude: 'NaN', longitude: '3' }, { latitude: 'Infinity', longitude: '3' },
    { latitude: 'north', longitude: '3' }, { latitude: '1' }, { latitude: '1', longitude: '2', source: 'IMPORTED' },
    { latitude: '1', longitude: '2', verifiedAt: '2026-01-01' },
  ];
  for (const location of invalidLocations) {
    const response = await request('/api/v1/institutions', { method: 'POST', cookies: activeCookies, csrfToken: csrf, body: { districtId: district.id, name: `Invalid ${randomUUID()}`, location } });
    assert.equal(response.status, 400); const body = await response.json();
    assert.equal(body.error.code, 'VALIDATION_ERROR'); assert.ok(!JSON.stringify(body).includes(JSON.stringify(location)));
  }
  const invalidTopLevel = await request('/api/v1/institutions', { method: 'POST', cookies: activeCookies, csrfToken: csrf, body: { districtId: district.id, name: 'Client source', location: { latitude: '1', longitude: '2' }, locationSource: 'MANUAL_INSPECTOR' } });
  assert.equal(invalidTopLevel.status, 400);
  const noCsrf = await request('/api/v1/institutions', { method: 'POST', cookies: activeCookies, body: { districtId: district.id, name: 'No CSRF', location: { latitude: '1', longitude: '2' } } }); assert.equal(noCsrf.status, 403);
  assert.equal((await request('/api/v1/institutions', { method: 'POST', body: { districtId: district.id, name: 'Unauth', location: { latitude: '1', longitude: '2' } } })).status, 401);
});

test('PATCH applies, replaces, clears and no-ops location atomically with transition-only AuditLog', async () => {
  const target = await db.institution.create({ data: { districtId: district.id, name: 'Patch location' } });
  const patch = (body) => request(`/api/v1/institutions/${target.id}`, { method: 'PATCH', cookies: activeCookies, csrfToken: csrf, body });
  const first = await patch({ location: { latitude: '36.7538', longitude: '3.0588' } }); assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).data.location, { latitude: '36.753800', longitude: '3.058800', source: 'MANUAL_INSPECTOR' });
  let events = await db.auditLog.findMany({ where: { entityId: target.id, action: 'INSTITUTION_UPDATED' }, orderBy: { occurredAt: 'asc' } });
  assert.deepEqual(events.at(-1).metadata, { changedFields: ['location'], locationChange: 'SET' });
  const locationBeforeNoop = await db.institution.findUniqueOrThrow({ where: { id: target.id } }); const eventCount = events.length;
  const same = await patch({ location: { latitude: '36.753800', longitude: '3.058800' } }); assert.equal(same.status, 200);
  assert.deepEqual((await same.json()).data.location, { latitude: '36.753800', longitude: '3.058800', source: 'MANUAL_INSPECTOR' });
  assert.equal((await db.institution.findUniqueOrThrow({ where: { id: target.id } })).updatedAt.getTime(), locationBeforeNoop.updatedAt.getTime());
  assert.equal(await db.auditLog.count({ where: { entityId: target.id, action: 'INSTITUTION_UPDATED' } }), eventCount);

  const changed = await patch({ location: { latitude: '-90', longitude: '-180' } }); assert.equal(changed.status, 200);
  events = await db.auditLog.findMany({ where: { entityId: target.id, action: 'INSTITUTION_UPDATED' }, orderBy: { occurredAt: 'asc' } });
  assert.deepEqual(events.at(-1).metadata, { changedFields: ['location'], locationChange: 'UPDATE' });
  const omitted = await patch({ name: 'Changed without location' }); assert.equal(omitted.status, 200);
  assert.deepEqual((await omitted.json()).data.location, { latitude: '-90.000000', longitude: '-180.000000', source: 'MANUAL_INSPECTOR' });
  events = await db.auditLog.findMany({ where: { entityId: target.id, action: 'INSTITUTION_UPDATED' }, orderBy: { occurredAt: 'asc' } });
  assert.deepEqual(events.at(-1).metadata, { changedFields: ['name'] });
  const cleared = await patch({ location: null }); assert.equal(cleared.status, 200); assert.equal((await cleared.json()).data.location, null);
  events = await db.auditLog.findMany({ where: { entityId: target.id, action: 'INSTITUTION_UPDATED' }, orderBy: { occurredAt: 'asc' } });
  assert.deepEqual(events.at(-1).metadata, { changedFields: ['location'], locationChange: 'CLEAR' });
  const clearNoopCount = events.length; assert.equal((await patch({ location: null })).status, 200);
  assert.equal(await db.auditLog.count({ where: { entityId: target.id, action: 'INSTITUTION_UPDATED' } }), clearNoopCount);
  const malformed = [
    { location: { latitude: '36' } }, { location: { longitude: '3' } },
    { location: { latitude: '36', longitude: '3', source: 'MANUAL_INSPECTOR' } },
    { location: { latitude: '36', longitude: '3', extra: true } }, { latitude: '36', longitude: '3' },
  ];
  for (const body of malformed) assert.equal((await patch(body)).status, 400);
  assert.equal((await request(`/api/v1/institutions/${target.id}`, { method: 'PATCH', cookies: activeCookies, body: { location: { latitude: '1', longitude: '2' } } })).status, 403);
});

test('current district authorization, inactive and archived policies conceal or reject location access', async () => {
  const outside = await db.institution.create({ data: { districtId: outsideDistrict.id, name: 'Private location', latitude: '12.5', longitude: '13.5', locationSource: 'MANUAL_INSPECTOR' } });
  const read = await request(`/api/v1/institutions/${outside.id}`, { cookies: activeCookies });
  const update = await request(`/api/v1/institutions/${outside.id}`, { method: 'PATCH', cookies: activeCookies, csrfToken: csrf, body: { location: null } });
  assert.equal(read.status, 404); assert.equal(update.status, 404);
  const readBody = await read.json(); const updateBody = await update.json();
  assert.deepEqual(readBody.error && { code: readBody.error.code, message: readBody.error.message }, updateBody.error && { code: updateBody.error.code, message: updateBody.error.message });
  assert.ok(!JSON.stringify(readBody).includes(outside.id));
  const inactiveResult = await login(inactiveInspector); assert.equal(inactiveResult.response.status, 401);
  const inactiveCookies = inactiveResult.cookies;
  assert.equal((await request(`/api/v1/institutions/${outside.id}`, { cookies: inactiveCookies })).status, 401);
  const archived = await db.institution.create({ data: { districtId: district.id, name: 'Archived location', archivedAt: new Date(), latitude: '36.75', longitude: '3.05', locationSource: 'MANUAL_INSPECTOR' } });
  const archivedRead = await request(`/api/v1/institutions/${archived.id}`, { cookies: activeCookies }); assert.equal(archivedRead.status, 200);
  assert.deepEqual((await archivedRead.json()).data.location, { latitude: '36.750000', longitude: '3.050000', source: 'MANUAL_INSPECTOR' });
  const archivedWrite = await request(`/api/v1/institutions/${archived.id}`, { method: 'PATCH', cookies: activeCookies, csrfToken: csrf, body: { location: null } });
  assert.equal(archivedWrite.status, 409);
  assert.deepEqual((await db.institution.findUniqueOrThrow({ where: { id: archived.id } })).locationSource, 'MANUAL_INSPECTOR');
});

test('public submission cannot supply location and accepting declarations leaves Institution coordinates unchanged', async () => {
  const existing = await db.institution.create({ data: { districtId: district.id, name: 'Declared school', latitude: '36.7538', longitude: '3.0588', locationSource: 'MANUAL_INSPECTOR' } });
  const submission = {
    firstName: 'أمينة', lastName: 'بن صالح', dateOfBirth: '1985-03-04', placeOfBirth: 'وهران', phone: '+213555123456',
    email: `task076a-${randomUUID()}@example.invalid`, professionalStatus: 'SUBSTITUTE', employmentDate: '2005-09-01',
    workplace: { institutionName: existing.name, municipality: 'وهران', institutionAddress: 'عنوان معلن', directorPhone: '+21321234567' },
  };
  for (const invalid of [
    { ...submission, latitude: '36.75', longitude: '3.05' },
    { ...submission, workplace: { ...submission.workplace, latitude: '36.75', longitude: '3.05' } },
  ]) {
    const rejected = await request(`/api/v1/public/districts/${district.id}/submissions`, { method: 'POST', body: invalid });
    assert.equal(rejected.status, 400); assert.equal((await rejected.json()).error.code, 'VALIDATION_ERROR');
  }
  const beforeCount = await db.institution.count();
  const acceptedPost = await request(`/api/v1/public/districts/${district.id}/submissions`, { method: 'POST', body: submission });
  assert.equal(acceptedPost.status, 202); const acceptedBody = await acceptedPost.json(); const receipt = acceptedBody.data.receiptId;
  assert.deepEqual(Object.keys(acceptedBody.data), ['receiptId']);
  assert.equal(await db.institution.count(), beforeCount);
  const csrfless = await request(`/api/v1/submissions/${receipt}/decision`, { method: 'POST', cookies: activeCookies, body: { action: 'ACCEPT', expectedStatus: 'PENDING' } }); assert.equal(csrfless.status, 403);
  const decision = await request(`/api/v1/submissions/${receipt}/decision`, { method: 'POST', cookies: activeCookies, csrfToken: csrf, body: { action: 'ACCEPT', expectedStatus: 'PENDING' } });
  assert.equal(decision.status, 200);
  const after = await db.institution.findUniqueOrThrow({ where: { id: existing.id } });
  assert.equal(after.latitude.toFixed(6), '36.753800'); assert.equal(after.longitude.toFixed(6), '3.058800'); assert.equal(after.locationSource, 'MANUAL_INSPECTOR');
  assert.equal(await db.institution.count(), beforeCount);
});

test('Institution audit failure rolls back location mutation and never records coordinate values', async () => {
  const target = await db.institution.create({ data: { districtId: district.id, name: 'Audit rollback location' } });
  await db.$executeRawUnsafe(`CREATE FUNCTION "${cleanSchema}".reject_task076a_institution_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entityType='Institution' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_task076a_institution_audit BEFORE INSERT ON "${cleanSchema}"."AuditLog" FOR EACH ROW EXECUTE FUNCTION "${cleanSchema}".reject_task076a_institution_audit()`);
  try {
    const response = await request(`/api/v1/institutions/${target.id}`, { method: 'PATCH', cookies: activeCookies, csrfToken: csrf, body: { location: { latitude: '36.7538', longitude: '3.0588' } } });
    assert.equal(response.status, 500); const error = await response.json();
    assert.deepEqual(error.error, { code: 'INTERNAL_ERROR', message: 'حدث خطأ داخلي.', requestId: error.error.requestId });
    assert.ok(!JSON.stringify(error).includes('36.7538')); assert.ok(!JSON.stringify(error).includes('3.0588'));
    const unchanged = await db.institution.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(unchanged.latitude, null); assert.equal(unchanged.longitude, null); assert.equal(unchanged.locationSource, null);
    const targetAudit = await db.auditLog.count({ where: { entityId: target.id, action: 'INSTITUTION_UPDATED' } }); assert.equal(targetAudit, 0);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER reject_task076a_institution_audit ON "${cleanSchema}"."AuditLog"`);
    await db.$executeRawUnsafe(`DROP FUNCTION "${cleanSchema}".reject_task076a_institution_audit()`);
  }
});
