import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createApp } from '../dist/app.js';
import { registerAuthRoutes, requireAuthenticatedInspector } from '../dist/identity/auth-routes.js';
import { registerTeacherProfileRoutes } from '../dist/teachers/routes.js';
import { registerTeacherSupplementaryWorkplaceRoutes } from '../dist/teachers/supplementary-workplace-routes.js';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const migrationsDir = join(apiDir, 'prisma', 'migrations');
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const migrationName = '20261001120000_task_082_teacher_supplementary_workplaces';
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(require('node:fs').readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const password = 'task082-integration-synthetic-password';
let admin, db, upgrade, server, baseUrl, inspector, cookies, district, otherDistrict, teacher, home, b, c, outside, cleanSchema, upgradeSchema, tempRoot;

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('Isolated test target is required; refusing database access.');
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55432'
    || decodeURIComponent(url.username) !== 'task020_test_user' || url.pathname !== '/task020_test') throw new Error('Unapproved isolated database target.');
  return raw;
}
function scopedUrl(base, schema) { const url = new URL(base); url.searchParams.set('schema', schema); return url.toString(); }
function runPrisma(args, url, selectedSchema = schemaPath) {
  const result = require('node:child_process').spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', selectedSchema], {
    cwd: rootDir, encoding: 'utf8', timeout: 120000, windowsHide: true, env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) throw new Error(`Isolated Prisma ${args[0]} failed.`);
}
const cookiesFrom = (response) => response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? ''];
const csrf = (parts) => decodeURIComponent(parts.find((item) => item.startsWith('inspector_csrf=')).split(';', 1)[0].slice('inspector_csrf='.length));
const cookieHeader = (parts) => parts.map((item) => item.split(';', 1)[0]).join('; ');
async function request(path, method = 'GET', body, session = cookies) {
  const headers = { 'content-type': 'application/json' };
  if (session) headers.cookie = cookieHeader(session);
  if (['POST', 'PATCH', 'PUT'].includes(method) && session) headers['x-csrf-token'] = csrf(session);
  return fetch(`${baseUrl}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function loginAs(account) {
  const csrfCookie = cookiesFrom(await fetch(`${baseUrl}/api/v1/auth/me`));
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { cookie: cookieHeader(csrfCookie), 'x-csrf-token': csrf(csrfCookie), 'content-type': 'application/json' }, body: JSON.stringify({ email: account.email, password }) });
  assert.equal(response.status, 200);
  return cookiesFrom(response);
}
const collection = (id) => `/api/v1/teachers/${id}/supplementary-workplaces`;
function todayAlgiers() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

before(async () => {
  const base = approvedUrl();
  const { PrismaClient } = await import('@prisma/client');
  const { hashPassword } = await import('../dist/identity/password.js');
  admin = new PrismaClient({ datasources: { db: { url: base } } }); await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port`;
  assert.deepEqual(identity[0], { db: 'task020_test', role: 'task020_test_user', address: '127.0.0.1/32', port: 55432 });
  const tag = `${process.pid}_${randomBytes(5).toString('hex')}`;
  cleanSchema = `task082_clean_${tag}`; upgradeSchema = `task082_upgrade_${tag}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${cleanSchema}"`); await admin.$executeRawUnsafe(`CREATE SCHEMA "${upgradeSchema}"`);
  const cleanUrl = scopedUrl(base, cleanSchema); const upgradeUrl = scopedUrl(base, upgradeSchema);
  runPrisma(['migrate', 'deploy'], cleanUrl);
  db = new PrismaClient({ datasources: { db: { url: cleanUrl } } }); await db.$connect();

  tempRoot = mkdtempSync(join(tmpdir(), 'task082-upgrade-')); const tempMigrations = join(tempRoot, 'migrations'); mkdirSync(tempMigrations);
  cpSync(join(migrationsDir, 'migration_lock.toml'), join(tempRoot, 'migration_lock.toml'));
  for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) if (entry.isDirectory() && entry.name < migrationName) cpSync(join(migrationsDir, entry.name), join(tempMigrations, entry.name), { recursive: true });
  const tempSchema = join(tempRoot, 'schema.prisma'); cpSync(schemaPath, tempSchema);
  runPrisma(['migrate', 'deploy'], upgradeUrl, tempSchema);
  const upgradeSchemaName = new URL(upgradeUrl).searchParams.get('schema');
  const oldDistrict = randomUUID(), oldInstitution = randomUUID(), oldTeacher = randomUUID();
  await admin.$executeRawUnsafe(`INSERT INTO "${upgradeSchemaName}"."District" ("id","name","createdAt","updatedAt") VALUES ('${oldDistrict}','retained',now(),now())`);
  await admin.$executeRawUnsafe(`INSERT INTO "${upgradeSchemaName}"."Institution" ("id","districtId","name","createdAt","updatedAt") VALUES ('${oldInstitution}','${oldDistrict}','retained home',now(),now())`);
  await admin.$executeRawUnsafe(`INSERT INTO "${upgradeSchemaName}"."Teacher" ("id","districtId","institutionId","name","surname","createdAt","updatedAt") VALUES ('${oldTeacher}','${oldDistrict}','${oldInstitution}','retained','teacher',now(),now())`);
  const oldDb = new PrismaClient({ datasources: { db: { url: upgradeUrl } } }); await oldDb.$connect();
  const oldInspector = await oldDb.inspector.create({ data: { email: `task082-upgrade-${tag}@example.invalid`, passwordHash: 'synthetic-upgrade-hash', status: 'ACTIVE' } });
  await oldDb.inspectorDistrictMembership.create({ data: { inspectorId: oldInspector.id, districtId: oldDistrict, role: 'INSPECTOR', validFrom: new Date('2020-01-01T00:00:00.000Z') } });
  const oldQualification = await oldDb.teacherQualification.create({ data: { teacherId: oldTeacher, name: 'Preserved qualification' } });
  const oldSchedule = await oldDb.weeklySchedule.create({ data: { teacherId: oldTeacher, academicYear: '2026-2027', slots: { create: [{ dayOfWeek: 1, startMinute: 480, endMinute: 540 }] } } });
  const oldVisit = await oldDb.pedagogicalVisit.create({ data: { districtId: oldDistrict, inspectorId: oldInspector.id, teacherId: oldTeacher, institutionId: oldInstitution, institutionNameSnapshot: 'retained home', academicYear: '2026-2027', visitType: 'GUIDANCE', scheduledStartAt: new Date('2027-01-01T08:00:00Z'), scheduledEndAt: new Date('2027-01-01T09:00:00Z') } });
  const oldReport = await oldDb.inspectionReport.create({ data: { visitId: oldVisit.id } });
  const oldFollowUp = await oldDb.followUp.create({ data: { reportId: oldReport.id, ownerInspectorId: oldInspector.id, note: 'preserved follow-up', dueDate: new Date('2027-02-01T00:00:00.000Z') } });
  const oldSubmission = await oldDb.teacherSubmission.create({ data: { districtId: oldDistrict, submittedProfile: { purpose: 'migration-preservation-test' } } });
  const oldAudit = await oldDb.auditLog.create({ data: { actorInspectorId: oldInspector.id, districtId: oldDistrict, action: 'TASK082_UPGRADE_SENTINEL', entityType: 'Teacher', entityId: oldTeacher } });
  await oldDb.$disconnect();
  cpSync(join(migrationsDir, migrationName), join(tempMigrations, migrationName), { recursive: true });
  runPrisma(['migrate', 'deploy'], upgradeUrl, tempSchema);
  upgrade = new PrismaClient({ datasources: { db: { url: upgradeUrl } } }); await upgrade.$connect();
  assert.equal(await upgrade.teacher.count({ where: { id: oldTeacher, institutionId: oldInstitution } }), 1);
  assert.equal(await upgrade.inspectorDistrictMembership.count({ where: { inspectorId: oldInspector.id, districtId: oldDistrict } }), 1);
  assert.equal(await upgrade.teacherQualification.count({ where: { id: oldQualification.id, teacherId: oldTeacher, name: 'Preserved qualification' } }), 1);
  assert.equal(await upgrade.weeklySchedule.count({ where: { id: oldSchedule.id, teacherId: oldTeacher, slots: { some: { dayOfWeek: 1, startMinute: 480, endMinute: 540 } } } }), 1);
  assert.equal(await upgrade.pedagogicalVisit.count({ where: { id: oldVisit.id, teacherId: oldTeacher, institutionId: oldInstitution, institutionNameSnapshot: 'retained home' } }), 1);
  assert.equal(await upgrade.inspectionReport.count({ where: { id: oldReport.id, visitId: oldVisit.id } }), 1);
  assert.equal(await upgrade.followUp.count({ where: { id: oldFollowUp.id, reportId: oldReport.id } }), 1);
  assert.equal(await upgrade.teacherSubmission.count({ where: { id: oldSubmission.id, districtId: oldDistrict } }), 1);
  assert.equal(await upgrade.auditLog.count({ where: { id: oldAudit.id, actorInspectorId: oldInspector.id, districtId: oldDistrict } }), 1);
  assert.equal(await upgrade.teacherSupplementaryWorkplace.count(), 0);

  inspector = await db.inspector.create({ data: { email: `task082-${randomUUID()}@example.invalid`, passwordHash: await hashPassword(password), status: 'ACTIVE' } });
  district = await db.district.create({ data: { name: 'TASK-082 district' } });
  otherDistrict = await db.district.create({ data: { name: 'TASK-082 other district' } });
  await db.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(Date.now() - 86400000) } });
  home = await db.institution.create({ data: { districtId: district.id, name: 'Home A' } });
  b = await db.institution.create({ data: { districtId: district.id, name: 'Institution B', municipality: 'Town' } });
  c = await db.institution.create({ data: { districtId: district.id, name: 'Institution C' } });
  outside = await db.institution.create({ data: { districtId: otherDistrict.id, name: 'Outside' } });
  teacher = await db.teacher.create({ data: { districtId: district.id, institutionId: home.id, name: 'Teacher', surname: 'Test', institutionAppointmentDate: new Date('2020-01-01T00:00:00Z'), institutionAppointmentNumber: 'A-1' } });
  const app = createApp((instance) => {
    registerAuthRoutes(instance, db);
    const guard = requireAuthenticatedInspector(db);
    registerTeacherProfileRoutes(instance, db, guard);
    registerTeacherSupplementaryWorkplaceRoutes(instance, db, guard);
  });
  server = app.listen(0, '127.0.0.1'); await new Promise((resolveListen, reject) => { server.once('listening', resolveListen); server.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const initial = cookiesFrom(await fetch(`${baseUrl}/api/v1/auth/me`));
  const login = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { cookie: cookieHeader(initial), 'x-csrf-token': csrf(initial), 'content-type': 'application/json' }, body: JSON.stringify({ email: inspector.email, password }) });
  assert.equal(login.status, 200); cookies = cookiesFrom(login);
});

after(async () => {
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  await db?.$disconnect(); await upgrade?.$disconnect();
  if (admin && cleanSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${cleanSchema}" CASCADE`);
  if (admin && upgradeSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${upgradeSchema}" CASCADE`);
  await admin?.$disconnect(); if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('clean and TASK-081 upgrade migration preserve historical rows and fabricate no supplementary links', async () => {
  const applied = await db.$queryRaw`SELECT finished_at FROM "_prisma_migrations" WHERE migration_name=${migrationName}`;
  assert.equal(applied.length, 1); assert.ok(applied[0].finished_at);
  const rowCount = await db.$queryRaw`SELECT count(*)::int AS count FROM "TeacherSupplementaryWorkplace"`;
  assert.equal(rowCount[0].count, 0);
});

test('scoped API validates dates, overlap and same-home policy while preserving distinct history', async () => {
  const path = collection(teacher.id);
  assert.equal((await request(path, 'GET', undefined, null)).status, 401);
  const csrfless = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { cookie: cookieHeader(cookies), 'content-type': 'application/json' }, body: JSON.stringify({ institutionId: b.id, validFrom: '2026-01-01' }) });
  assert.equal(csrfless.status, 403);
  for (const body of [{ institutionId: b.id }, { institutionId: b.id, validFrom: '2026-02-30' }, { institutionId: b.id, validFrom: '2026-01-02', validTo: '2026-01-02' }, { institutionId: b.id, validFrom: '2026-01-03', validTo: '2026-01-02' }, { institutionId: b.id, districtId: district.id, validFrom: '2025-01-01' }, { institutionId: b.id, teacherId: teacher.id, validFrom: '2025-01-01' }]) assert.equal((await request(path, 'POST', body)).status, 400);
  assert.equal((await request(path, 'POST', { institutionId: home.id, validFrom: '2025-01-01', validTo: '2025-02-01' })).status, 409);
  assert.equal((await request(path, 'POST', { institutionId: outside.id, validFrom: '2026-01-01' })).status, 404);
  assert.equal((await request(path, 'POST', { institutionId: outside.id, validFrom: '2025-01-01' })).status, 404);
  const pastInput = { institutionId: b.id, validFrom: '2025-01-01', validTo: '2025-03-01' };
  const pastResponse = await request(path, 'POST', pastInput); assert.equal(pastResponse.status, 201);
  const past = (await pastResponse.json()).data; assert.equal(past.isCurrent, false);
  const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'TEACHER_SUPPLEMENTARY_WORKPLACE_CREATED', entityId: past.id } });
  assert.deepEqual(audit.metadata, { teacherId: teacher.id, institutionId: b.id });
  assert.equal(JSON.stringify(audit.metadata).includes('Institution B'), false);
  assert.equal((await request(path, 'POST', pastInput)).status, 409);
  const contained = await request(path, 'POST', { institutionId: b.id, validFrom: '2025-01-15', validTo: '2025-02-01' }); assert.equal(contained.status, 409);
  const adjacent = await request(path, 'POST', { institutionId: b.id, validFrom: '2025-03-01', validTo: '2025-04-01' }); assert.equal(adjacent.status, 201);
  const overlaps = await request(path, 'POST', { institutionId: b.id, validFrom: '2025-02-01', validTo: '2025-03-15' }); assert.equal(overlaps.status, 409);
  const separateTeacher = await db.teacher.create({ data: { districtId: district.id, institutionId: home.id, name: 'Separate', surname: 'Teacher' } });
  const open = await request(collection(separateTeacher.id), 'POST', { institutionId: b.id, validFrom: '2025-01-01' }); assert.equal(open.status, 201);
  const openConflict = await request(collection(separateTeacher.id), 'POST', { institutionId: b.id, validFrom: '2026-01-01' }); assert.equal(openConflict.status, 409);
  const list = await request(path); const { items } = await list.json(); assert.equal(items.length, 2); assert.equal(items[0].institution.municipality, 'Town');
  assert.equal(Object.hasOwn(items[0].institution, 'address'), false);

  const changeHome = await request(`/api/v1/teachers/${teacher.id}/current-institution`, 'PUT', { expectedInstitutionId: home.id, institutionId: b.id });
  assert.equal(changeHome.status, 200);
  const moved = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } }); assert.equal(moved.institutionId, b.id);
  assert.equal(moved.institutionAppointmentDate, null); assert.equal(moved.institutionAppointmentNumber, null);
  assert.equal(await db.teacherSupplementaryWorkplace.count({ where: { id: past.id } }), 1);
  assert.equal((await request(path, 'GET')).status, 200);
  assert.equal((await request(path, 'POST', pastInput)).status, 409);
  const yesterday = new Date(`${todayAlgiers()}T00:00:00.000Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  assert.equal((await request(path, 'POST', { institutionId: b.id, validFrom: yesterday.toISOString().slice(0, 10) })).status, 409);
  assert.equal((await request(path, 'POST', { institutionId: b.id, validFrom: '2030-01-01' })).status, 409);
  for (const body of [{ institutionId: c.id }, { districtId: district.id }, { teacherId: teacher.id }, { validFrom: '2025-02-01', institutionId: c.id, id: randomUUID() }]) {
    assert.equal((await request(`${path}/${past.id}`, 'PATCH', body)).status, 400);
  }
  assert.equal((await request(`${path}/${past.id}`, 'PATCH', { validTo: '2025-05-01' })).status, 409);
});

test('current/future B relations block home change atomically; unrelated links and no-op are preserved', async () => {
  const currentTeacher = await db.teacher.create({ data: { districtId: district.id, institutionId: home.id, name: 'Current', surname: 'Teacher', institutionAppointmentNumber: 'C-1' } });
  const current = await request(collection(currentTeacher.id), 'POST', { institutionId: b.id, validFrom: '2025-01-01' }); assert.equal(current.status, 201);
  const auditCountBefore = await db.auditLog.count({ where: { action: 'TEACHER_INSTITUTION_CHANGED', entityType: 'Teacher', entityId: currentTeacher.id } });
  const currentHomeChange = await request(`/api/v1/teachers/${currentTeacher.id}/current-institution`, 'PUT', { expectedInstitutionId: home.id, institutionId: b.id });
  assert.equal(currentHomeChange.status, 409);
  assert.equal((await db.teacher.findUniqueOrThrow({ where: { id: currentTeacher.id } })).institutionAppointmentNumber, 'C-1');
  assert.equal(await db.auditLog.count({ where: { action: 'TEACHER_INSTITUTION_CHANGED', entityType: 'Teacher', entityId: currentTeacher.id } }), auditCountBefore);

  const t = await db.teacher.create({ data: { districtId: district.id, institutionId: home.id, name: 'Concurrent', surname: 'Test', institutionAppointmentDate: new Date('2021-04-01T00:00:00Z'), institutionAppointmentNumber: 'B-2' } });
  const unrelatedPast = await request(collection(t.id), 'POST', { institutionId: b.id, validFrom: '2024-01-01', validTo: '2025-01-01' }); assert.equal(unrelatedPast.status, 201);
  const future = await request(collection(t.id), 'POST', { institutionId: c.id, validFrom: '2030-01-01' }); assert.equal(future.status, 201);
  const before = await db.teacher.findUniqueOrThrow({ where: { id: t.id } });
  const rejected = await request(`/api/v1/teachers/${t.id}/current-institution`, 'PUT', { expectedInstitutionId: home.id, institutionId: c.id });
  assert.equal(rejected.status, 409);
  const afterReject = await db.teacher.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(afterReject.institutionId, before.institutionId); assert.equal(afterReject.institutionAppointmentNumber, before.institutionAppointmentNumber);
  const close = await request(`${collection(t.id)}/${(await future.json()).data.id}`, 'PATCH', { validFrom: '2025-01-01', validTo: '2025-02-01' }); assert.equal(close.status, 200);
  const allowed = await request(`/api/v1/teachers/${t.id}/current-institution`, 'PUT', { expectedInstitutionId: home.id, institutionId: c.id }); assert.equal(allowed.status, 200);
  assert.equal((await db.teacher.findUniqueOrThrow({ where: { id: t.id } })).institutionAppointmentNumber, null);
  assert.equal(await db.teacherSupplementaryWorkplace.count({ where: { id: (await unrelatedPast.json()).data.id, teacherId: t.id, institutionId: b.id } }), 1);
});

test('concurrent duplicate interval creation is serialized and only one succeeds', async () => {
  const t = await db.teacher.create({ data: { districtId: district.id, institutionId: home.id, name: 'Race', surname: 'Teacher' } });
  const body = { institutionId: c.id, validFrom: '2026-01-01', validTo: '2026-06-01' };
  const responses = await Promise.all([request(collection(t.id), 'POST', body), request(collection(t.id), 'POST', body)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(await db.teacherSupplementaryWorkplace.count({ where: { teacherId: t.id, institutionId: c.id } }), 1);
});

test('DB constraints, archive behavior, close audit, and non-delete API are enforced', async () => {
  const t = await db.teacher.create({ data: { districtId: district.id, name: 'Second', surname: 'Teacher' } });
  const created = await db.teacherSupplementaryWorkplace.create({ data: { teacherId: t.id, districtId: district.id, institutionId: b.id, validFrom: new Date('2024-01-01T00:00:00Z') } });
  await assert.rejects(db.teacherSupplementaryWorkplace.create({ data: { teacherId: t.id, districtId: district.id, institutionId: b.id, validFrom: new Date('2024-03-01T00:00:00Z'), validTo: new Date('2024-03-01T00:00:00Z') } }));
  await assert.rejects(db.teacherSupplementaryWorkplace.create({ data: { teacherId: t.id, districtId: otherDistrict.id, institutionId: outside.id, validFrom: new Date('2024-01-01T00:00:00Z') } }));
  const archived = await db.institution.create({ data: { districtId: district.id, name: 'Archived', archivedAt: new Date() } });
  assert.equal((await request(collection(t.id), 'POST', { institutionId: archived.id, validFrom: '2026-01-01' })).status, 409);
  const retained = await db.teacherSupplementaryWorkplace.create({ data: { teacherId: t.id, districtId: district.id, institutionId: c.id, validFrom: new Date('2024-01-01T00:00:00Z') } });
  await db.institution.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
  assert.equal(await db.teacherSupplementaryWorkplace.count({ where: { id: retained.id } }), 1);
  await assert.rejects(db.teacher.delete({ where: { id: t.id } }));
  await assert.rejects(db.institution.delete({ where: { id: c.id } }));
  const noOpAudit = await db.auditLog.count({ where: { entityId: created.id } });
  assert.equal((await request(`${collection(t.id)}/${created.id}`, 'PATCH', { validFrom: '2024-01-01' })).status, 200);
  assert.equal(await db.auditLog.count({ where: { entityId: created.id } }), noOpAudit);
  const corrected = await request(`${collection(t.id)}/${created.id}`, 'PATCH', { validFrom: '2023-12-01' }); assert.equal(corrected.status, 200);
  const updateAudit = await db.auditLog.findFirstOrThrow({ where: { entityId: created.id, action: 'TEACHER_SUPPLEMENTARY_WORKPLACE_UPDATED' } });
  assert.deepEqual(updateAudit.metadata, { teacherId: t.id, institutionId: b.id, changedFields: ['validFrom'] });
  assert.equal(JSON.stringify(updateAudit.metadata).includes('2023-12-01'), false);
  const closed = await request(`${collection(t.id)}/${created.id}`, 'PATCH', { validTo: '2024-02-01' }); assert.equal(closed.status, 200);
  assert.ok(await db.teacherSupplementaryWorkplace.findUnique({ where: { id: created.id } }));
  const closeAudit = await db.auditLog.findFirstOrThrow({ where: { entityId: created.id, action: 'TEACHER_SUPPLEMENTARY_WORKPLACE_CLOSED' } });
  assert.deepEqual(closeAudit.metadata, { teacherId: t.id, institutionId: b.id });
  assert.equal((await request(`${collection(t.id)}/${created.id}`, 'DELETE')).status, 404);
});

test('audit failure rolls back supplementary workplace creation', async () => {
  const t = await db.teacher.create({ data: { districtId: district.id, institutionId: home.id, name: 'Rollback', surname: 'Teacher' } });
  const schemaName = new URL(approvedUrl()).searchParams.get('schema');
  await db.$executeRawUnsafe(`CREATE FUNCTION "${schemaName}"."task082_reject_audit"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action" = 'TEACHER_SUPPLEMENTARY_WORKPLACE_CREATED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER "task082_reject_audit" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${schemaName}"."task082_reject_audit"()`);
  try {
    const response = await request(collection(t.id), 'POST', { institutionId: c.id, validFrom: '2026-01-01' });
    assert.equal(response.status, 500);
    const envelope = await response.json();
    assert.equal(envelope.error.code, 'INTERNAL_ERROR');
    assert.equal(JSON.stringify(envelope).includes('synthetic audit failure'), false);
    assert.equal(await db.teacherSupplementaryWorkplace.count({ where: { teacherId: t.id } }), 0);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "task082_reject_audit" ON "AuditLog"');
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${schemaName}"."task082_reject_audit"()`);
  }
});

test('expired or absent Inspector membership cannot read another District Teacher', async () => {
  const { hashPassword } = await import('../dist/identity/password.js');
  const unauthorized = await db.inspector.create({ data: { email: `task082-expired-${randomUUID()}@example.invalid`, passwordHash: await hashPassword(password), status: 'ACTIVE' } });
  await db.inspectorDistrictMembership.create({ data: { inspectorId: unauthorized.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date('2020-01-01T00:00:00.000Z'), validTo: new Date('2020-02-01T00:00:00.000Z') } });
  const unauthorizedCookies = await loginAs(unauthorized);
  assert.equal((await request(collection(teacher.id), 'GET', undefined, unauthorizedCookies)).status, 404);
});
