import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import process from 'node:process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createApp } from '../dist/app.js';
import { registerAuthRoutes, requireAuthenticatedInspector } from '../dist/identity/auth-routes.js';
import { registerPedagogicalVisitRoutes } from '../dist/visits/routes.js';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const migrationsDir = join(apiDir, 'prisma', 'migrations');
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const migrationName = '20260929070000_task_050_pedagogical_visit';
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const password = `task050-${randomUUID()}-synthetic`;
let PrismaClient, admin, db, server, baseUrl, cleanSchema, upgradeSchema, tempRoot;
let inspector, inactiveInspector, otherInspector, district, otherDistrict, institution, secondInstitution, teacher, otherTeacher, cookies, otherCookies;
let visitQueryCount = 0;

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('Isolated TEST_DATABASE_URL is required.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Isolated test target is invalid.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55432'
      || url.username !== 'task020_test_user' || url.pathname !== '/task020_test' || url.searchParams.get('schema') !== 'public') {
    throw new Error('Refusing an unapproved TASK-020 test database target.');
  }
  return raw;
}
function schemaUrl(raw, schema) { const url = new URL(raw); url.searchParams.set('schema', schema); return url.toString(); }
function runPrisma(args, url, selectedSchema = schemaPath) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', selectedSchema], {
    cwd: rootDir, encoding: 'utf8', timeout: 120_000, windowsHide: true, env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) throw new Error(`Isolated Prisma ${args[0]} failed.`);
}
function cookieParts(response) { return (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).filter(Boolean); }
function cookieHeader(parts) { return parts.map((part) => part.split(';', 1)[0]).join('; '); }
function csrf(parts) { return decodeURIComponent(parts.find((part) => part.startsWith('inspector_csrf=')).split(';', 1)[0].slice('inspector_csrf='.length)); }
async function login(target) {
  const initial = cookieParts(await fetch(`${baseUrl}/api/v1/auth/me`));
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { cookie: cookieHeader(initial), 'x-csrf-token': csrf(initial), 'content-type': 'application/json' }, body: JSON.stringify({ email: target.email, password }) });
  return response;
}
async function call(path, method = 'GET', body, selectedCookies = cookies, omitCsrf = false) {
  const headers = { 'content-type': 'application/json' };
  if (selectedCookies) headers.cookie = cookieHeader(selectedCookies);
  if (selectedCookies && method !== 'GET' && !omitCsrf) headers['x-csrf-token'] = csrf(selectedCookies);
  return fetch(`${baseUrl}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function bodyFor(start, end, teacherId = teacher.id) { return { teacherId, academicYear: '2026-2027', scheduledStartAt: start, scheduledEndAt: end }; }

before(async () => {
  const rawUrl = approvedUrl();
  ({ PrismaClient } = await import('@prisma/client'));
  const { hashPassword } = await import('../dist/identity/password.js');
  admin = new PrismaClient({ datasources: { db: { url: rawUrl } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  assert.deepEqual(identity[0], { db: 'task020_test', role: 'task020_test_user' });
  const publicObjects = await admin.$queryRaw`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename !~ '^pg_'`;
  const publicMigrations = await admin.$queryRaw`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
  assert.deepEqual(publicObjects, []); assert.equal(publicMigrations[0]?.present, false);

  cleanSchema = `task050_clean_${process.pid}_${randomBytes(5).toString('hex')}`;
  upgradeSchema = `task050_upgrade_${process.pid}_${randomBytes(5).toString('hex')}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${cleanSchema}"`);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${upgradeSchema}"`);
  const cleanUrl = schemaUrl(rawUrl, cleanSchema);
  runPrisma(['migrate', 'deploy'], cleanUrl);
  runPrisma(['migrate', 'status'], cleanUrl);
  const history = await admin.$queryRawUnsafe(`SELECT migration_name,finished_at FROM "${cleanSchema}"."_prisma_migrations" ORDER BY started_at`);
  assert.equal(history.length, 12); assert.equal(history.at(-1)?.migration_name, '20260930030000_task_053_follow_up');
  assert.ok(history.some((row) => row.migration_name === migrationName)); assert.ok(history.every((row) => row.finished_at));

  tempRoot = mkdtempSync(join(tmpdir(), 'task050-prisma-upgrade-'));
  const copiedMigrations = join(tempRoot, 'migrations');
  const copiedSchema = join(tempRoot, 'schema.prisma');
  cpSync(join(migrationsDir, 'migration_lock.toml'), join(tempRoot, 'migration_lock.toml'));
  for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== migrationName && entry.name !== '20260930020000_task_052_inspection_report' && entry.name !== '20260930030000_task_053_follow_up') cpSync(join(migrationsDir, entry.name), join(copiedMigrations, entry.name), { recursive: true });
  }
  cpSync(schemaPath, copiedSchema);
  const upgradeUrl = schemaUrl(rawUrl, upgradeSchema);
  runPrisma(['migrate', 'deploy'], upgradeUrl, copiedSchema);
  const baseDb = new PrismaClient({ datasources: { db: { url: upgradeUrl } } });
  await baseDb.$connect();
  const oldDistrict = await baseDb.district.create({ data: { name: 'TASK-050 preserved G4 district' } });
  const oldInspector = await baseDb.inspector.create({ data: { email: `task050-g4-${randomUUID()}@example.invalid`, passwordHash: 'synthetic-hash', status: 'ACTIVE' } });
  const oldInstitution = await baseDb.institution.create({ data: { districtId: oldDistrict.id, name: 'G4 original institution' } });
  const oldTeacher = await baseDb.teacher.create({ data: { districtId: oldDistrict.id, institutionId: oldInstitution.id, name: 'G4', surname: 'Teacher' } });
  await baseDb.$disconnect();
  cpSync(join(migrationsDir, migrationName), join(copiedMigrations, migrationName), { recursive: true });
  runPrisma(['migrate', 'deploy'], upgradeUrl, copiedSchema);
  const upgraded = new PrismaClient({ datasources: { db: { url: upgradeUrl } } });
  await upgraded.$connect();
  assert.equal((await upgraded.teacher.findUniqueOrThrow({ where: { id: oldTeacher.id } })).institutionId, oldInstitution.id);
  assert.equal(await upgraded.inspector.count({ where: { id: oldInspector.id } }), 1);
  assert.equal((await upgraded.$queryRaw`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=${upgradeSchema} AND table_name='PedagogicalVisit'`)[0].n, 1);
  await upgraded.$disconnect();

  db = new PrismaClient({ datasources: { db: { url: cleanUrl } }, log: [{ level: 'query', emit: 'event' }] });
  db.$on('query', (event) => { if (event.query.includes('"PedagogicalVisit"')) visitQueryCount += 1; });
  await db.$connect();
  const passwordHash = await hashPassword(password);
  inspector = await db.inspector.create({ data: { email: `task050-${randomUUID()}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  inactiveInspector = await db.inspector.create({ data: { email: `task050-inactive-${randomUUID()}@example.invalid`, passwordHash, status: 'INACTIVE' } });
  otherInspector = await db.inspector.create({ data: { email: `task050-other-${randomUUID()}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  district = await db.district.create({ data: { name: 'TASK-050 district' } });
  otherDistrict = await db.district.create({ data: { name: 'TASK-050 other district' } });
  const membershipStart = new Date(Date.now() - 60_000);
  await db.inspectorDistrictMembership.createMany({ data: [
    { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: membershipStart },
    { inspectorId: otherInspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: membershipStart },
    { inspectorId: inactiveInspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: membershipStart },
  ] });
  institution = await db.institution.create({ data: { districtId: district.id, name: 'Original institution' } });
  secondInstitution = await db.institution.create({ data: { districtId: district.id, name: 'Second institution' } });
  teacher = await db.teacher.create({ data: { districtId: district.id, institutionId: institution.id, name: 'أمينة', surname: 'زيارة', phone: '+213555555555', email: 'private@example.invalid' } });
  otherTeacher = await db.teacher.create({ data: { districtId: district.id, institutionId: secondInstitution.id, name: 'ليلى', surname: 'ثانية' } });
  await db.weeklySchedule.create({ data: { teacherId: teacher.id, academicYear: '2026-2027', slots: { create: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i + 1, startMinute: 0, endMinute: 1440 })) } } });
  await db.weeklySchedule.create({ data: { teacherId: otherTeacher.id, academicYear: '2026-2027', slots: { create: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i + 1, startMinute: 0, endMinute: 1440 })) } } });
  const app = createApp((instance) => { registerAuthRoutes(instance, db); registerPedagogicalVisitRoutes(instance, db, requireAuthenticatedInspector(db)); });
  server = app.listen(0, '127.0.0.1'); await new Promise((yes, no) => { server.once('listening', yes); server.once('error', no); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const loggedIn = await login(inspector); assert.equal(loggedIn.status, 200); cookies = cookieParts(loggedIn);
  const otherLoggedIn = await login(otherInspector); assert.equal(otherLoggedIn.status, 200); otherCookies = cookieParts(otherLoggedIn);
});

after(async () => {
  if (server) await new Promise((yes) => server.close(yes));
  await db?.$disconnect();
  if (admin && cleanSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${cleanSchema}" CASCADE`);
  if (admin && upgradeSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${upgradeSchema}" CASCADE`);
  await admin?.$disconnect();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('TASK-050 migration, visit API lifecycle, privacy, scope, concurrency and atomic audit', async (t) => {
  const path = '/api/v1/visits';
  await t.test('migration constraints, FK history and bounded indexes', async () => {
    const constraints = await db.$queryRaw`SELECT conname,contype,confdeltype,confupdtype,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace=${cleanSchema}::regnamespace`;
    for (const name of ['PedagogicalVisit_status_check','PedagogicalVisit_academicYear_check','PedagogicalVisit_time_order_check','PedagogicalVisit_occurredAt_status_check','PedagogicalVisit_revision_positive_check','PedagogicalVisit_institutionNameSnapshot_nonempty_check']) assert.ok(constraints.some((item) => item.conname === name && item.contype === 'c'));
    for (const name of ['PedagogicalVisit_districtId_fkey','PedagogicalVisit_inspectorId_fkey','PedagogicalVisit_teacherId_fkey','PedagogicalVisit_institutionId_districtId_fkey']) {
      const fk = constraints.find((item) => item.conname === name); assert.equal(fk?.contype, 'f'); assert.equal(fk?.confdeltype, 'r'); assert.equal(fk?.confupdtype, 'r');
    }
    assert.ok(constraints.some((item) => item.conname === 'PedagogicalVisit_inspector_no_overlapping_active_visit' && item.contype === 'x'));
    assert.ok(constraints.some((item) => item.conname === 'PedagogicalVisit_teacher_no_overlapping_active_visit' && item.contype === 'x'));
    const indexes = await db.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname=${cleanSchema} AND tablename='PedagogicalVisit'`;
    assert.equal(indexes.length, 7);
    const base = { districtId: district.id, inspectorId: otherInspector.id, teacherId: otherTeacher.id, institutionId: secondInstitution.id,
      institutionNameSnapshot: 'Original institution', academicYear: '2026-2027', scheduledStartAt: new Date('2026-09-28T07:30:00Z'), scheduledEndAt: new Date('2026-09-28T08:30:00Z') };
    await assert.rejects(db.pedagogicalVisit.create({ data: { ...base, academicYear: '2026-2028' } }));
    await assert.rejects(db.pedagogicalVisit.create({ data: { ...base, scheduledStartAt: base.scheduledEndAt } }));
    await assert.rejects(db.pedagogicalVisit.create({ data: { ...base, revision: 0 } }));
    await assert.rejects(db.pedagogicalVisit.create({ data: { ...base, status: 'COMPLETED' } }));
    await assert.rejects(db.pedagogicalVisit.create({ data: { ...base, status: 'CANCELLED', occurredAt: new Date() } }));
    await assert.rejects(db.pedagogicalVisit.create({ data: { ...base, institutionNameSnapshot: '  ' } }));
    const defaulted = await db.pedagogicalVisit.create({ data: { ...base, scheduledStartAt: new Date('2026-09-28T09:00:00Z'), scheduledEndAt: new Date('2026-09-28T10:00:00Z') } });
    assert.equal(defaulted.status, 'PLANNED'); assert.equal(defaulted.revision, 1); assert.equal(defaulted.occurredAt, null);
    await assert.rejects(db.institution.delete({ where: { id: institution.id } }));
  });

  await t.test('authentication, CSRF, current membership and generic scope behavior', async () => {
    assert.equal((await call(path, 'GET', undefined, null)).status, 401);
    assert.equal((await login(inactiveInspector)).status, 401);
    const noCsrf = await call(path, 'POST', bodyFor('2026-09-30T08:00:00+01:00', '2026-09-30T09:00:00+01:00'), cookies, true);
    assert.equal(noCsrf.status, 403);
    const outside = await db.pedagogicalVisit.create({ data: {
      districtId: otherDistrict.id, inspectorId: inspector.id, teacherId: otherTeacher.id, institutionId: institution.id,
      institutionNameSnapshot: 'private', academicYear: '2026-2027', scheduledStartAt: new Date('2026-09-28T11:00:00Z'), scheduledEndAt: new Date('2026-09-28T12:00:00Z'),
    } }).catch(() => null);
    assert.equal(outside, null); // composite institution/district FK rejects invalid cross-district context.
    const hidden = await call(`${path}?districtId=${otherDistrict.id}`); assert.equal(hidden.status, 404);
    const outsideTeacher = await db.teacher.create({ data: { districtId: otherDistrict.id, name: 'Hidden', surname: 'Teacher' } });
    const rejected = await call(path, 'POST', bodyFor('2026-09-30T08:00:00+01:00', '2026-09-30T09:00:00+01:00', outsideTeacher.id));
    assert.equal(rejected.status, 404);
    const unassigned = await db.teacher.create({ data: { districtId: district.id, name: 'No', surname: 'Institution' } });
    const missingWorkplace = await call(path, 'POST', bodyFor('2026-09-30T10:00:00+01:00', '2026-09-30T11:00:00+01:00', unassigned.id));
    assert.equal(missingWorkplace.status, 409); assert.equal((await missingWorkplace.json()).error.code, 'TEACHER_CURRENT_INSTITUTION_REQUIRED');
    assert.equal((await call(`${path}?unknown=1`)).status, 400);
    assert.equal((await call(`${path}?status=PLANNED&status=CANCELLED`)).status, 400);
  });

  const create = async (start, end, targetTeacher = teacher) => call(path, 'POST', bodyFor(start, end, targetTeacher.id));
  await t.test('create, projection privacy, list filters, stable cursor, total and detail', async () => {
    const response = await create('2026-09-28T08:30:00+01:00', '2026-09-28T09:30:00+01:00');
    assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
    const visit = (await response.json()).data.visit;
    assert.equal(visit.status, 'PLANNED'); assert.equal(visit.revision, 1); assert.equal(visit.institution.name, 'Original institution');
    assert.equal(visit.scheduledStartAt, '2026-09-28T07:30:00.000Z');
    assert.equal(JSON.stringify(visit).includes('private@example.invalid'), false); assert.equal(JSON.stringify(visit).includes('+213555555555'), false);
    assert.equal('report' in visit, false); assert.equal('inspectorId' in visit, false);
    const event = await db.auditLog.findFirstOrThrow({ where: { entityId: visit.id, action: 'PEDAGOGICAL_VISIT_CREATED' } });
    assert.deepEqual(event.metadata, {}); assert.equal(event.districtId, district.id); assert.equal(event.actorInspectorId, inspector.id);
    const detail = await call(`${path}/${visit.id}`); assert.equal(detail.status, 200); assert.equal((await detail.json()).data.visit.institution.name, 'Original institution');
    const otherOwner = await call(`${path}/${visit.id}`, 'GET', undefined, otherCookies); assert.equal(otherOwner.status, 404);
    const next = await create('2026-09-29T08:30:00+01:00', '2026-09-29T09:30:00+01:00'); assert.equal(next.status, 201);
    const third = await create('2026-09-30T08:30:00+01:00', '2026-09-30T09:30:00+01:00', otherTeacher); assert.equal(third.status, 201);
    visitQueryCount = 0;
    const page1 = await call(`${path}?limit=1&districtId=${district.id}`); assert.equal(page1.status, 200);
    assert.ok(visitQueryCount <= 3, `bounded Visit reads expected, actual query count ${visitQueryCount}`);
    const pageData1 = await page1.json(); assert.equal(pageData1.page.total, 3); assert.equal(pageData1.data.length, 1); assert.ok(pageData1.page.nextCursor);
    const page2Response = await call(`${path}?limit=1&districtId=${district.id}&cursor=${pageData1.page.nextCursor}`); const page2 = await page2Response.json();
    assert.equal(page2.data.length, 1); assert.notEqual(page2.data[0].id, pageData1.data[0].id);
    const filtered = await call(`${path}?teacherId=${otherTeacher.id}&status=PLANNED`); assert.equal(filtered.status, 200);
    assert.equal((await filtered.json()).page.total, 1);
    assert.equal((await call(`${path}?from=2026-09-29T00:00:00Z&to=2026-09-30T00:00:00Z`)).status, 200);
    assert.equal((await call(`${path}/${randomUUID()}`)).status, 404);
    assert.equal((await call(`${path}/not-a-uuid`)).status, 400);
    assert.ok([visit, pageData1.data[0]].every(Boolean));
  });

  await t.test('UUID cursor preserves composite ordering across tied timestamps and scoped filters', async () => {
    const tieInstitution = await db.institution.create({ data: { districtId: district.id, name: 'Cursor tie institution' } });
    const tieTeacher = await db.teacher.create({ data: { districtId: district.id, institutionId: tieInstitution.id, name: 'Cursor', surname: 'Tie' } });
    const tiedStart = new Date('2026-10-02T10:00:00Z');
    const orderedIds = [1, 2, 3, 4, 5].map((suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`);
    await db.pedagogicalVisit.createMany({ data: orderedIds.map((id) => ({
      id, districtId: district.id, inspectorId: inspector.id, teacherId: tieTeacher.id,
      institutionId: tieInstitution.id, institutionNameSnapshot: tieInstitution.name,
      academicYear: '2026-2027', scheduledStartAt: tiedStart,
      scheduledEndAt: new Date(tiedStart.getTime() + 30 * 60_000), status: 'CANCELLED',
    })) });

    const query = `teacherId=${tieTeacher.id}&status=CANCELLED&limit=2`;
    const page1Response = await call(`${path}?${query}`);
    assert.equal(page1Response.status, 200);
    const page1 = await page1Response.json();
    assert.equal(page1.page.total, orderedIds.length);
    assert.deepEqual(page1.data.map((item) => item.id), orderedIds.slice().reverse().slice(0, 2));
    assert.ok(page1.page.nextCursor);

    const page2Response = await call(`${path}?${query}&cursor=${page1.page.nextCursor}`);
    assert.equal(page2Response.status, 200);
    const page2 = await page2Response.json();
    assert.equal(page2.page.total, orderedIds.length);
    assert.deepEqual(page2.data.map((item) => item.id), orderedIds.slice().reverse().slice(2, 4));

    const page3Response = await call(`${path}?${query}&cursor=${page2.page.nextCursor}`);
    assert.equal(page3Response.status, 200);
    const page3 = await page3Response.json();
    assert.equal(page3.page.total, orderedIds.length);
    assert.deepEqual(page3.data.map((item) => item.id), orderedIds.slice().reverse().slice(4));
    assert.equal(page3.page.nextCursor, null);

    const allPageIds = [...page1.data, ...page2.data, ...page3.data].map((item) => item.id);
    assert.equal(new Set(allPageIds).size, orderedIds.length);
    assert.deepEqual(allPageIds, orderedIds.slice().reverse());

    const mismatchedFilter = await call(`${path}?teacherId=${otherTeacher.id}&status=CANCELLED&limit=2&cursor=${page1.page.nextCursor}`);
    assert.equal(mismatchedFilter.status, 404);
    assert.equal((await mismatchedFilter.json()).error.code, 'NOT_FOUND');
    const outsideVisit = await db.pedagogicalVisit.create({ data: {
      districtId: district.id, inspectorId: otherInspector.id, teacherId: tieTeacher.id,
      institutionId: tieInstitution.id, institutionNameSnapshot: tieInstitution.name,
      academicYear: '2026-2027', scheduledStartAt: tiedStart,
      scheduledEndAt: new Date(tiedStart.getTime() + 30 * 60_000), status: 'CANCELLED',
    } });
    const outOfScopeCursor = await call(`${path}?limit=2&cursor=${outsideVisit.id}`);
    assert.equal(outOfScopeCursor.status, 404);
    assert.equal((await outOfScopeCursor.json()).error.code, 'NOT_FOUND');
    assert.equal((await call(`${path}?cursor=not-a-uuid`)).status, 400);
  });

  await t.test('advisory warning acknowledgement is exact, recomputed, and recorded without text', async () => {
    const noScheduleTeacher = await db.teacher.create({ data: { districtId: district.id, institutionId: secondInstitution.id, name: 'بدون', surname: 'جدول' } });
    const input = bodyFor('2026-10-01T08:00:00+01:00', '2026-10-01T09:00:00+01:00', noScheduleTeacher.id);
    const warning = await call(path, 'POST', input); assert.equal(warning.status, 409); assert.equal((await warning.json()).error.code, 'VISIT_WEEKLY_SCHEDULE_MISSING');
    await db.weeklySchedule.create({ data: { teacherId: noScheduleTeacher.id, academicYear: '2026-2027' } });
    const stale = await call(path, 'POST', { ...input, scheduleWarningAcknowledgement: 'VISIT_WEEKLY_SCHEDULE_MISSING' });
    assert.equal(stale.status, 409); assert.equal((await stale.json()).error.code, 'VISIT_OUTSIDE_WEEKLY_SCHEDULE');
    const accepted = await call(path, 'POST', { ...input, scheduleWarningAcknowledgement: 'VISIT_OUTSIDE_WEEKLY_SCHEDULE' });
    assert.equal(accepted.status, 201);
    const created = (await accepted.json()).data.visit;
    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: created.id, action: 'PEDAGOGICAL_VISIT_CREATED' } });
    assert.deepEqual(audit.metadata, { scheduleWarningCode: 'VISIT_OUTSIDE_WEEKLY_SCHEDULE' });
  });

  await t.test('overlap exclusions reject conflicts, allow adjacent/different parties, and concurrent create has one winner', async () => {
    const base = new Date('2026-10-04T07:00:00Z');
    const iso = (date) => date.toISOString();
    const first = await create(iso(base), iso(new Date(base.getTime() + 3_600_000))); assert.equal(first.status, 201);
    const conflictResponse = await create(iso(new Date(base.getTime() + 15 * 60_000)), iso(new Date(base.getTime() + 45 * 60_000))); assert.equal(conflictResponse.status, 409);
    assert.equal((await conflictResponse.json()).error.code, 'VISIT_OVERLAP_CONFLICT');
    const adjacent = await create(iso(new Date(base.getTime() + 3_600_000)), iso(new Date(base.getTime() + 7_200_000))); assert.equal(adjacent.status, 201);
    const different = await call(path, 'POST', bodyFor(iso(base), iso(new Date(base.getTime() + 3_600_000)), otherTeacher.id), otherCookies); assert.equal(different.status, 201);
    const raceBase = new Date('2026-10-05T07:00:00Z');
    const race = await Promise.all([0, 1].map(() => create(iso(raceBase), iso(new Date(raceBase.getTime() + 3_600_000)))));
    assert.deepEqual(race.map((item) => item.status).sort(), [201, 409]);

    const inspectorRaceStart = new Date('2026-10-12T07:00:00Z');
    const inspectorRaceEnd = new Date(inspectorRaceStart.getTime() + 3_600_000);
    const contestants = await Promise.all(['One', 'Two'].map(async (suffix) => {
      const raceInstitution = await db.institution.create({ data: { districtId: district.id, name: `Inspector race ${suffix}` } });
      return db.teacher.create({ data: {
        districtId: district.id, institutionId: raceInstitution.id,
        name: 'Inspector race', surname: suffix,
      } });
    }));
    assert.notEqual(contestants[0].id, contestants[1].id);
    assert.notEqual(contestants[0].institutionId, contestants[1].institutionId);
    const createdAuditCountBeforeRace = await db.auditLog.count({ where: { actorInspectorId: inspector.id, action: 'PEDAGOGICAL_VISIT_CREATED' } });
    const inspectorRaceResponses = await Promise.all(contestants.map((contestant) => call(path, 'POST', {
      ...bodyFor(iso(inspectorRaceStart), iso(inspectorRaceEnd), contestant.id),
      scheduleWarningAcknowledgement: 'VISIT_WEEKLY_SCHEDULE_MISSING',
    })));
    assert.deepEqual(inspectorRaceResponses.map((item) => item.status).sort(), [201, 409]);
    const loser = inspectorRaceResponses.find((item) => item.status === 409);
    const safeConflict = await loser.json();
    assert.equal(safeConflict.error.code, 'VISIT_OVERLAP_CONFLICT');
    assert.equal(JSON.stringify(safeConflict).includes('PedagogicalVisit_inspector_no_overlapping_active_visit'), false);
    assert.equal(JSON.stringify(safeConflict).includes('exclusion'), false);
    const persistedContestants = await db.pedagogicalVisit.findMany({
      where: { inspectorId: inspector.id, teacherId: { in: contestants.map((item) => item.id) }, scheduledStartAt: inspectorRaceStart, scheduledEndAt: inspectorRaceEnd },
    });
    assert.equal(persistedContestants.length, 1);
    const successfulVisit = persistedContestants[0];
    assert.equal(await db.auditLog.count({ where: { entityType: 'PedagogicalVisit', entityId: successfulVisit.id, action: 'PEDAGOGICAL_VISIT_CREATED' } }), 1);
    assert.equal(await db.auditLog.count({ where: { actorInspectorId: inspector.id, action: 'PEDAGOGICAL_VISIT_CREATED' } }), createdAuditCountBeforeRace + 1);
  });

  await t.test('reschedule, no-op, optimistic revision, complete/cancel terminal transitions and event contracts', async () => {
    const created = await create('2026-10-06T08:00:00+01:00', '2026-10-06T09:00:00+01:00');
    assert.equal(created.status, 201); const visit = (await created.json()).data.visit;
    const originalBody = { operation: 'RESCHEDULE', expectedRevision: 1, academicYear: '2026-2027', scheduledStartAt: '2026-10-06T08:00:00+01:00', scheduledEndAt: '2026-10-06T09:00:00+01:00' };
    const noOp = await call(`${path}/${visit.id}`, 'PATCH', originalBody); assert.equal(noOp.status, 200); assert.equal((await noOp.json()).data.visit.revision, 1);
    const updated = await call(`${path}/${visit.id}`, 'PATCH', { ...originalBody, scheduledStartAt: '2026-10-06T10:00:00+01:00', scheduledEndAt: '2026-10-06T11:00:00+01:00' });
    assert.equal(updated.status, 200); const rescheduled = (await updated.json()).data.visit; assert.equal(rescheduled.revision, 2);
    const updateEvent = await db.auditLog.findFirstOrThrow({ where: { entityId: visit.id, action: 'PEDAGOGICAL_VISIT_UPDATED' } });
    assert.deepEqual(updateEvent.metadata, { changedFields: ['scheduledStartAt', 'scheduledEndAt'] });
    const race = await Promise.all([
      call(`${path}/${visit.id}`, 'PATCH', { ...originalBody, expectedRevision: 2, scheduledStartAt: '2026-10-06T12:00:00+01:00', scheduledEndAt: '2026-10-06T13:00:00+01:00' }),
      call(`${path}/${visit.id}`, 'PATCH', { ...originalBody, expectedRevision: 2, scheduledStartAt: '2026-10-06T14:00:00+01:00', scheduledEndAt: '2026-10-06T15:00:00+01:00' }),
    ]);
    assert.deepEqual(race.map((result) => result.status).sort(), [200, 409]);
    const raceFailure = race.find((result) => result.status === 409); assert.equal((await raceFailure.json()).error.code, 'VISIT_REVISION_CONFLICT');
    const racedVisit = await db.pedagogicalVisit.findUniqueOrThrow({ where: { id: visit.id } }); assert.equal(racedVisit.revision, 3);
    assert.equal(await db.auditLog.count({ where: { entityId: visit.id, action: 'PEDAGOGICAL_VISIT_UPDATED' } }), 2);
    const stale = await call(`${path}/${visit.id}`, 'PATCH', { operation: 'CANCEL', expectedRevision: 1 }); assert.equal(stale.status, 409); assert.equal((await stale.json()).error.code, 'VISIT_REVISION_CONFLICT');
    const completed = await call(`${path}/${visit.id}`, 'PATCH', { operation: 'COMPLETE', expectedRevision: 3, occurredAt: new Date(Date.now() - 1000).toISOString() });
    assert.equal(completed.status, 200); const done = (await completed.json()).data.visit; assert.equal(done.status, 'COMPLETED'); assert.equal(done.revision, 4); assert.ok(done.occurredAt);
    const completeEvent = await db.auditLog.findFirstOrThrow({ where: { entityId: visit.id, action: 'PEDAGOGICAL_VISIT_COMPLETED' } });
    assert.deepEqual(completeEvent.metadata, { fromStatus: 'PLANNED', toStatus: 'COMPLETED' });
    assert.equal((await call(`${path}/${visit.id}`, 'PATCH', { operation: 'CANCEL', expectedRevision: 4 })).status, 409);

    const cancelledResponse = await create('2026-10-07T08:00:00+01:00', '2026-10-07T09:00:00+01:00'); const cancelled = (await cancelledResponse.json()).data.visit;
    const cancelledResult = await call(`${path}/${cancelled.id}`, 'PATCH', { operation: 'CANCEL', expectedRevision: 1 });
    assert.equal(cancelledResult.status, 200); assert.equal((await cancelledResult.json()).data.visit.occurredAt, null);
    const cancelEvent = await db.auditLog.findFirstOrThrow({ where: { entityId: cancelled.id, action: 'PEDAGOGICAL_VISIT_CANCELLED' } });
    assert.deepEqual(cancelEvent.metadata, { fromStatus: 'PLANNED', toStatus: 'CANCELLED' });
    const freed = await create('2026-10-07T08:00:00+01:00', '2026-10-07T09:00:00+01:00'); assert.equal(freed.status, 201);
    assert.equal((await call(`${path}/${cancelled.id}`, 'PATCH', { operation: 'RESCHEDULE', expectedRevision: 2, ...originalBody })).status, 409);
  });

  await t.test('historical institution snapshot survives teacher change, archive and rename; inactive teacher completion/cancel allowed', async () => {
    const response = await create('2026-10-08T08:00:00+01:00', '2026-10-08T09:00:00+01:00'); const visit = (await response.json()).data.visit;
    await db.teacher.update({ where: { id: teacher.id }, data: { institutionId: secondInstitution.id, recordStatus: 'INACTIVE' } });
    await db.institution.update({ where: { id: institution.id }, data: { archivedAt: new Date(), name: 'Renamed archived institution' } });
    const historical = await call(`${path}/${visit.id}`); assert.equal((await historical.json()).data.visit.institution.name, 'Original institution');
    const reschedule = await call(`${path}/${visit.id}`, 'PATCH', { operation: 'RESCHEDULE', expectedRevision: 1, academicYear: '2026-2027', scheduledStartAt: '2026-10-08T10:00:00+01:00', scheduledEndAt: '2026-10-08T11:00:00+01:00' });
    assert.equal(reschedule.status, 409); assert.equal((await reschedule.json()).error.code, 'VISIT_WORKPLACE_CHANGED');
    const complete = await call(`${path}/${visit.id}`, 'PATCH', { operation: 'COMPLETE', expectedRevision: 1, occurredAt: new Date(Date.now() - 1000).toISOString() }); assert.equal(complete.status, 200);
    const inactiveCreate = await create('2026-10-09T08:00:00+01:00', '2026-10-09T09:00:00+01:00'); assert.equal(inactiveCreate.status, 409);
    const archivedTeacher = await db.teacher.create({ data: { districtId: district.id, institutionId: institution.id, name: 'Archived', surname: 'Workplace' } });
    const archivedCreate = await create('2026-10-09T10:00:00+01:00', '2026-10-09T11:00:00+01:00', archivedTeacher);
    assert.equal(archivedCreate.status, 409); assert.equal((await archivedCreate.json()).error.code, 'VISIT_WORKPLACE_UNAVAILABLE');
    await db.teacher.update({ where: { id: otherTeacher.id }, data: { recordStatus: 'INACTIVE' } });
    const inactiveVisit = await db.pedagogicalVisit.create({ data: { districtId: district.id, inspectorId: inspector.id, teacherId: otherTeacher.id,
      institutionId: secondInstitution.id, institutionNameSnapshot: secondInstitution.name, academicYear: '2026-2027',
      scheduledStartAt: new Date('2026-10-10T07:00:00Z'), scheduledEndAt: new Date('2026-10-10T08:00:00Z') } });
    const canceled = await call(`${path}/${inactiveVisit.id}`, 'PATCH', { operation: 'CANCEL', expectedRevision: 1 }); assert.equal(canceled.status, 200);
  });

  await t.test('audit append failure rolls back the visit mutation and log payload stays allowlisted', async () => {
    const rollbackTeacher = await db.teacher.create({ data: { districtId: district.id, institutionId: secondInstitution.id, name: 'Rollback', surname: 'Audit' } });
    await db.weeklySchedule.create({ data: { teacherId: rollbackTeacher.id, academicYear: '2026-2027', slots: { create: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i + 1, startMinute: 0, endMinute: 1440 })) } } });
    const created = await create('2026-10-11T08:00:00+01:00', '2026-10-11T09:00:00+01:00', rollbackTeacher); const visit = (await created.json()).data.visit;
    await db.$executeRaw`CREATE FUNCTION task050_fail_visit_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='PEDAGOGICAL_VISIT_CANCELLED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`;
    await db.$executeRaw`CREATE TRIGGER task050_fail_visit_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION task050_fail_visit_audit()`;
    try {
      const failed = await call(`${path}/${visit.id}`, 'PATCH', { operation: 'CANCEL', expectedRevision: 1 }); assert.equal(failed.status, 500);
      const unchanged = await db.pedagogicalVisit.findUniqueOrThrow({ where: { id: visit.id } }); assert.equal(unchanged.status, 'PLANNED'); assert.equal(unchanged.revision, 1);
      assert.equal(await db.auditLog.count({ where: { entityId: visit.id, action: 'PEDAGOGICAL_VISIT_CANCELLED' } }), 0);
    } finally {
      await db.$executeRaw`DROP TRIGGER task050_fail_visit_audit ON "AuditLog"`;
      await db.$executeRaw`DROP FUNCTION task050_fail_visit_audit()`;
    }
    const events = await db.auditLog.findMany({ where: { entityType: 'PedagogicalVisit' } });
    for (const event of events) {
      const content = JSON.stringify(event.metadata);
      assert.equal(content.includes('Original institution'), false); assert.equal(content.includes('private@example.invalid'), false);
      assert.equal(content.includes('+213555555555'), false);
    }
  });
});
