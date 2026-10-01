import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import process from 'node:process';
import { createApp } from '../dist/app.js';
import { registerAuthRoutes, requireAuthenticatedInspector } from '../dist/identity/auth-routes.js';
import { registerProfessionalIdentityRoutes } from '../dist/identity/professional-identity-routes.js';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(apiDir, '../..');
const migrations = join(apiDir, 'prisma', 'migrations');
const schemaFile = join(apiDir, 'prisma', 'schema.prisma');
const prismaPackage = require.resolve('prisma/package.json');
const cli = resolve(dirname(prismaPackage), JSON.parse(readFileSync(prismaPackage, 'utf8')).bin.prisma);
const { PrismaClient } = require('@prisma/client');
let admin, db, server, base, schema, upgradeSchema, temp, inspector, inactive, other, cookies, membershipId, sessionId, testPassword;

function target() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('Approved isolated database target required.');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55432'
    || url.username !== 'task020_test_user' || url.pathname !== '/task020_test' || url.searchParams.get('schema') !== 'public') {
    throw new Error('Refusing unapproved test database target.');
  }
  return value;
}
function urlFor(raw, name) { const url = new URL(raw); url.searchParams.set('schema', name); return url.toString(); }
function migrate(url, file = schemaFile) {
  const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', file], {
    cwd: root, env: { ...process.env, DATABASE_URL: url }, windowsHide: true, encoding: 'utf8', timeout: 120_000,
  });
  if (result.error || result.status !== 0) throw new Error('Isolated migration failed.');
}
const cookieParts = (response) => (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).filter(Boolean);
const cookieHeader = (parts) => parts.map((part) => part.split(';', 1)[0]).join('; ');
const csrf = (parts) => decodeURIComponent(parts.find((part) => part.startsWith('inspector_csrf=')).split(';', 1)[0].slice(15));
async function login(user, password) {
  const bootstrap = cookieParts(await fetch(`${base}/api/v1/auth/me`));
  const response = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: {
    cookie: cookieHeader(bootstrap), 'x-csrf-token': csrf(bootstrap), 'content-type': 'application/json',
  }, body: JSON.stringify({ email: user.email, password }) });
  return { response, cookies: cookieParts(response) };
}
async function call(method = 'GET', body, chosen = cookies, includeCsrf = true) {
  const headers = { cookie: cookieHeader(chosen), 'content-type': 'application/json' };
  if (method !== 'GET' && includeCsrf && chosen.length) headers['x-csrf-token'] = csrf(chosen);
  return fetch(`${base}/api/v1/me/professional-identity`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

before(async () => {
  const raw = target();
  admin = new PrismaClient({ datasources: { db: { url: raw } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  assert.deepEqual(identity[0], { db: 'task020_test', role: 'task020_test_user' });
  const suffix = `${process.pid}_${randomBytes(5).toString('hex')}`;
  schema = `task052a_clean_${suffix}`; upgradeSchema = `task052a_upgrade_${suffix}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${upgradeSchema}"`);
  migrate(urlFor(raw, schema));
  const history = await admin.$queryRawUnsafe(`SELECT migration_name FROM "${schema}"."_prisma_migrations" ORDER BY started_at`);
  assert.equal(history.length, 17); assert.equal(history.at(-1).migration_name, '20261001120000_task_082_teacher_supplementary_workplaces');
  const reportTable = await admin.$queryRawUnsafe(`SELECT to_regclass('"${schema}"."InspectionReport"') IS NOT NULL AS present`);
  assert.equal(reportTable[0].present, true);
  temp = mkdtempSync(join(tmpdir(), 'task052a-upgrade-'));
  const oldMigrations = join(temp, 'migrations');
  cpSync(join(migrations, 'migration_lock.toml'), join(temp, 'migration_lock.toml'));
  for (const item of readdirSync(migrations, { withFileTypes: true })) {
    if (item.isDirectory() && !item.name.includes('task_052a')) cpSync(join(migrations, item.name), join(oldMigrations, item.name), { recursive: true });
  }
  cpSync(schemaFile, join(temp, 'schema.prisma'));
  migrate(urlFor(raw, upgradeSchema), join(temp, 'schema.prisma'));
  const oldDb = new PrismaClient({ datasources: { db: { url: urlFor(raw, upgradeSchema) } } });
  const oldId = randomUUID();
  const oldEmail = `old-${suffix}@example.invalid`;
  await oldDb.$executeRaw`INSERT INTO "Inspector" ("id", "email", "passwordHash", "status", "createdAt", "updatedAt") VALUES (${oldId}::uuid, ${oldEmail}, 'synthetic', 'ACTIVE', now(), now())`;
  const oldDistrict = await oldDb.district.create({ data: { name: 'مقاطعة محفوظة' } });
  const oldMembership = await oldDb.inspectorDistrictMembership.create({ data: { inspectorId: oldId, districtId: oldDistrict.id, role: 'INSPECTOR', validFrom: new Date() } });
  const oldSession = await oldDb.session.create({ data: { inspectorId: oldId, tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3_600_000) } });
  await oldDb.$disconnect();
  migrate(urlFor(raw, upgradeSchema));
  const upgraded = new PrismaClient({ datasources: { db: { url: urlFor(raw, upgradeSchema) } } });
  const preserved = await upgraded.inspector.findUniqueOrThrow({ where: { id: oldId } });
  assert.equal(preserved.email, oldEmail); assert.equal(preserved.status, 'ACTIVE');
  assert.equal(preserved.name, null); assert.equal(preserved.surname, null);
  assert.ok(await upgraded.inspectorDistrictMembership.findUnique({ where: { id: oldMembership.id } }));
  assert.ok(await upgraded.session.findUnique({ where: { id: oldSession.id } }));
  await upgraded.$disconnect();

  db = new PrismaClient({ datasources: { db: { url: urlFor(raw, schema) } } });
  const { hashPassword } = await import('../dist/identity/password.js');
  const password = `task052a-${randomUUID()}`; testPassword = password;
  inspector = await db.inspector.create({ data: { email: `active-${suffix}@example.invalid`, passwordHash: await hashPassword(password), status: 'ACTIVE' } });
  inactive = await db.inspector.create({ data: { email: `inactive-${suffix}@example.invalid`, passwordHash: await hashPassword(password), status: 'INACTIVE' } });
  other = await db.inspector.create({ data: { email: `other-${suffix}@example.invalid`, passwordHash: await hashPassword(password), status: 'ACTIVE' } });
  const district = await db.district.create({ data: { name: 'مقاطعة اختبار' } });
  const membership = await db.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date() } });
  membershipId = membership.id;
  server = createApp((app) => {
    registerAuthRoutes(app, db);
    registerProfessionalIdentityRoutes(app, db, requireAuthenticatedInspector(db));
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const logged = await login(inspector, password);
  assert.equal(logged.response.status, 200);
  cookies = logged.cookies;
  const session = await db.session.findFirstOrThrow({ where: { inspectorId: inspector.id } }); sessionId = session.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db?.$disconnect();
  if (admin && schema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  if (admin && upgradeSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${upgradeSchema}" CASCADE`);
  await admin?.$disconnect();
  if (temp) rmSync(temp, { recursive: true, force: true });
});

test('migration pair constraint and existing record preservation', async () => {
  const current = await db.inspector.findUniqueOrThrow({ where: { id: inspector.id } });
  assert.equal(current.name, null); assert.equal(current.surname, null);
  await assert.rejects(db.inspector.update({ where: { id: inspector.id }, data: { name: 'محمد' } }));
  assert.ok(await db.inspectorDistrictMembership.findUnique({ where: { id: membershipId } }));
  assert.ok(await db.session.findUnique({ where: { id: sessionId } }));
});

test('GET is self-only, no-store, and requires ACTIVE session', async () => {
  const response = await call();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { data: { name: null, surname: null } });
  assert.equal((await db.inspector.findUniqueOrThrow({ where: { id: other.id } })).name, null);
  assert.equal((await call('GET', undefined, [])).status, 401);
  assert.equal((await login(inactive, testPassword)).response.status, 401);
  await db.inspector.update({ where: { id: inspector.id }, data: { status: 'INACTIVE' } });
  assert.equal((await call()).status, 401);
  await db.inspector.update({ where: { id: inspector.id }, data: { status: 'ACTIVE' } });
});

test('PUT normalizes Unicode and audits only changed field names', async () => {
  const response = await call('PUT', { name: '  محمّد   علي  ', surname: '  بن   سالم ' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { name: 'محمّد علي', surname: 'بن سالم' } });
  const row = await db.inspector.findUniqueOrThrow({ where: { id: inspector.id } });
  assert.equal(row.email, inspector.email); assert.equal(row.status, 'ACTIVE');
  assert.equal((await db.session.findUniqueOrThrow({ where: { id: sessionId } })).inspectorId, inspector.id);
  const event = await db.auditLog.findFirstOrThrow({ where: { action: 'INSPECTOR_PROFESSIONAL_IDENTITY_UPDATED' } });
  assert.equal(event.districtId, null); assert.deepEqual(event.metadata, { changedFields: ['name', 'surname'] });
  assert.equal(event.actorInspectorId, inspector.id);
  assert.equal((await call('PUT', { name: 'محمّد  علي', surname: 'بن سالم' })).status, 200);
  assert.equal(await db.auditLog.count({ where: { action: event.action } }), 1);
  assert.equal((await db.inspector.findUniqueOrThrow({ where: { id: inspector.id } })).updatedAt.getTime(), row.updatedAt.getTime());
});

test('PUT validation, CSRF, and self-only mutation', async () => {
  for (const body of [
    { name: 'محمد' }, { name: 'محمد', surname: null }, { name: ' ', surname: 'سالم' },
    { name: 'محمد\n', surname: 'سالم' }, { name: 'x'.repeat(101), surname: 'سالم' },
    { name: 'محمد', surname: 'سالم', email: other.email },
  ]) assert.equal((await call('PUT', body)).status, 400);
  assert.equal((await call('PUT', { name: 'صالح', surname: 'محمد' }, cookies, false)).status, 403);
  assert.equal((await call('PUT', { name: 'صالح', surname: 'محمد' }, [])).status, 401);
  assert.equal((await db.inspector.findUniqueOrThrow({ where: { id: other.id } })).name, null);
  assert.equal((await call('PUT', { name: 'م'.repeat(100), surname: 'é'.repeat(100) })).status, 200);
  assert.equal((await call('PUT', { name: 'م'.repeat(101), surname: 'سالم' })).status, 400);
});

test('audit failure rolls back identity change', async () => {
  const before = await db.inspector.findUniqueOrThrow({ where: { id: inspector.id } });
  const auditCount = await db.auditLog.count({ where: { actorInspectorId: inspector.id } });
  await db.$executeRawUnsafe(`CREATE FUNCTION "${schema}".task052a_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'INSPECTOR_PROFESSIONAL_IDENTITY_UPDATED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER task052a_reject_audit BEFORE INSERT ON "${schema}"."AuditLog" FOR EACH ROW EXECUTE FUNCTION "${schema}".task052a_reject_audit()`);
  try {
    const response = await call('PUT', { name: 'تغيير غير محفوظ', surname: 'سالم' });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(JSON.stringify(body).includes('synthetic audit failure'), false);
    const after = await db.inspector.findUniqueOrThrow({ where: { id: inspector.id } });
    assert.equal(after.name, before.name); assert.equal(after.surname, before.surname);
    assert.equal(await db.auditLog.count({ where: { actorInspectorId: inspector.id } }), auditCount);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER task052a_reject_audit ON "${schema}"."AuditLog"`);
    await db.$executeRawUnsafe(`DROP FUNCTION "${schema}".task052a_reject_audit()`);
  }
});
