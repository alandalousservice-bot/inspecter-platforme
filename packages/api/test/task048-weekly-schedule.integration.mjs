import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { createApp } from '../dist/app.js';
import { registerAuthRoutes, requireAuthenticatedInspector } from '../dist/identity/auth-routes.js';
import { registerTeacherSchedules } from '../dist/teacher-portal/schedules.js';
import { registerWeeklyScheduleRoutes } from '../dist/schedules/routes.js';
import { registerTeacherSupplementaryWorkplaceRoutes } from '../dist/teachers/supplementary-workplace-routes.js';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const password = `task048-${randomUUID()}-synthetic`;
let admin, db, server, baseUrl, schemaName, inspector, otherInspector, district, otherDistrict, institution, teacher, unassignedTeacher, cookies, otherCookies;

const teacherCredentials = new Map();
async function teacherCall(target, body) {
  let credential = teacherCredentials.get(target.id);
  if (!credential) {
    const account = await db.teacherAccount.create({ data: { teacherId: target.id, loginEmail: `task048-${target.id}@example.invalid`, passwordHash: 'synthetic-unused', status: 'ACTIVE' } });
    const token = randomBytes(32).toString('base64url');
    const csrfToken = createHmac('sha256', token).update('teacher-portal-csrf-v1').digest('base64url');
    await db.teacherSession.create({ data: { accountId: account.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    credential = { cookie: `teacher_session=${token}; teacher_csrf=${csrfToken}`, csrfToken };
    teacherCredentials.set(target.id, credential);
  }
  return fetch(`${baseUrl}/api/v1/teacher/schedules`, { method: 'POST', headers: { cookie: credential.cookie, 'x-csrf-token': credential.csrfToken, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('Isolated TEST_DATABASE_URL required.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid isolated target.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55432'
      || url.username !== 'task020_test_user' || url.pathname !== '/task020_test' || url.searchParams.get('schema') !== 'public') throw new Error('Unapproved database target.');
  return raw;
}
function cookieParts(response) { return (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).filter(Boolean); }
function cookieHeader(parts) { return parts.map((part) => part.split(';', 1)[0]).join('; '); }
function csrf(parts) { return decodeURIComponent(parts.find((part) => part.startsWith('inspector_csrf=')).split(';', 1)[0].slice('inspector_csrf='.length)); }
async function login(target) {
  const initial = cookieParts(await fetch(`${baseUrl}/api/v1/auth/me`));
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { cookie: cookieHeader(initial), 'x-csrf-token': csrf(initial), 'content-type': 'application/json' }, body: JSON.stringify({ email: target.email, password }) });
  assert.equal(response.status, 200);
  return cookieParts(response);
}
async function call(path, method = 'GET', body, selectedCookies = cookies, omitCsrf = false) {
  const headers = { 'content-type': 'application/json' };
  if (selectedCookies) headers.cookie = cookieHeader(selectedCookies);
  if (selectedCookies && !omitCsrf && method !== 'GET') headers['x-csrf-token'] = csrf(selectedCookies);
  return fetch(`${baseUrl}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

before(async () => {
  const databaseUrl = approvedUrl();
  const { PrismaClient } = await import('@prisma/client');
  const { hashPassword } = await import('../dist/identity/password.js');
  admin = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  assert.deepEqual(identity[0], { db: 'task020_test', role: 'task020_test_user' });
  schemaName = `task048_${process.pid}_${randomBytes(6).toString('hex')}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  const scoped = new URL(databaseUrl); scoped.searchParams.set('schema', schemaName);
  const migrated = spawnSync(process.execPath, [prismaCliPath, 'migrate', 'deploy', '--schema', join(apiDir, 'prisma/schema.prisma')], { cwd: rootDir, env: { ...process.env, DATABASE_URL: scoped.toString() }, encoding: 'utf8', timeout: 120000, windowsHide: true });
  if (migrated.error || migrated.status !== 0) throw new Error('Isolated TASK-048 migration chain failed.');
  db = new PrismaClient({ datasources: { db: { url: scoped.toString() } } }); await db.$connect();
  const passwordHash = await hashPassword(password);
  inspector = await db.inspector.create({ data: { email: `task048-${randomUUID()}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  otherInspector = await db.inspector.create({ data: { email: `task048-other-${randomUUID()}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  district = await db.district.create({ data: { name: 'TASK-048 district' } });
  otherDistrict = await db.district.create({ data: { name: 'TASK-048 other district' } });
  const now = new Date(Date.now() - 60000);
  await db.inspectorDistrictMembership.createMany({ data: [
    { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: now },
    { inspectorId: otherInspector.id, districtId: otherDistrict.id, role: 'INSPECTOR', validFrom: now },
  ] });
  institution = await db.institution.create({ data: { districtId: district.id, name: 'TASK-048 institution' } });
  teacher = await db.teacher.create({ data: { districtId: district.id, institutionId: institution.id, name: 'أمينة', surname: 'اختبار' } });
  unassignedTeacher = await db.teacher.create({ data: { districtId: district.id, name: 'ليلى', surname: 'غير مسندة' } });
  const app = createApp((instance) => {
    registerAuthRoutes(instance, db);
    const guard = requireAuthenticatedInspector(db);
    registerWeeklyScheduleRoutes(instance, db, guard);
    registerTeacherSchedules(instance, db, guard);
    registerTeacherSupplementaryWorkplaceRoutes(instance, db, guard);
  });
  server = app.listen(0, '127.0.0.1'); await new Promise((yes, no) => { server.once('listening', yes); server.once('error', no); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  cookies = await login(inspector); otherCookies = await login(otherInspector);
});

after(async () => {
  if (server) await new Promise((yes) => server.close(yes));
  await db?.$disconnect();
  if (admin && schemaName) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin?.$disconnect();
});

test('TASK-048 authenticated schedule lifecycle, scope, concurrency and audit atomicity', async (t) => {
  const year = '2026-2027';
  const getPath = `/api/v1/teachers/${teacher.id}/schedules?academicYear=${year}`;
  await t.test('GET absent, malformed query, authentication and cross-district hiding', async () => {
    const absent = await call(getPath); assert.equal(absent.status, 200); assert.deepEqual((await absent.json()).data, { schedule: null });
    assert.equal((await call(`/api/v1/teachers/${teacher.id}/schedules`)).status, 400);
    assert.equal((await call(getPath, 'GET', undefined, null)).status, 401);
    const outside = await call(`/api/v1/teachers/${(await db.teacher.create({ data: { districtId: otherDistrict.id, name: 'A', surname: 'B' } })).id}/schedules?academicYear=${year}`,'GET',undefined,cookies);
    assert.equal(outside.status, 404);
  });
  await t.test('R2 closes legacy creation without an account; Teacher initial create remains validated and audited', async () => {
    assert.equal((await call(`/api/v1/teachers/${unassignedTeacher.id}/schedules`, 'POST', { academicYear: year, slots: [] })).status, 409);
    assert.equal(await db.weeklySchedule.count({ where: { teacherId: unassignedTeacher.id } }), 0);
    assert.equal((await teacherCall(teacher, { academicYear: year, slots: [], extra: true })).status, 400);
    const initial = await teacherCall(teacher, { academicYear: year, slots: [] }); assert.equal(initial.status, 201);
    const created = (await initial.json()).data.schedule; assert.equal(created.revision, 1); assert.deepEqual(created.slots, []);
    assert.deepEqual((await db.auditLog.findFirstOrThrow({ where: { entityId: created.id, action: 'TEACHER_SCHEDULE_SUBMITTED' } })).metadata, {});
    assert.equal((await teacherCall(teacher, { academicYear: year, slots: [] })).status, 409);
    const slots = [
      { institutionId: institution.id, validFrom: '2029-09-01', validTo: null, dayOfWeek: 4, startMinute: 480, endMinute: 540 },
      { institutionId: institution.id, validFrom: '2029-09-01', validTo: null, dayOfWeek: 4, startMinute: 540, endMinute: 600 },
    ];
    const withSlots = await teacherCall(teacher, { academicYear: '2029-2030', slots }); assert.equal(withSlots.status, 201);
    assert.equal((await withSlots.json()).data.schedule.slots.length, 2);
    const overlapping = await teacherCall(teacher, { academicYear: '2030-2031', slots: [slots[0], { ...slots[0], startMinute: 500 }] });
    assert.equal(overlapping.status, 400); assert.equal((await overlapping.json()).error.code, 'WEEKLY_SCHEDULE_SLOT_OVERLAP');
  });
  await t.test('R2 all legacy writes including no-op are denied, scoped and never mutate canonical or audit', async () => {
    const schedule = await db.weeklySchedule.findUniqueOrThrow({ where: { teacherId_academicYear: { teacherId: teacher.id, academicYear: '2029-2030' } }, include: { slots: true } });
    const auditCount = await db.auditLog.count();
    const routes = [
      [`/api/v1/teachers/${teacher.id}/schedules`, 'POST', { academicYear: year, slots: [] }],
      [`/api/v1/schedules/${schedule.id}/slots`, 'POST', { expectedRevision: 1, slot: { institutionId: institution.id, validFrom: '2029-09-01', dayOfWeek: 3, startMinute: 480, endMinute: 540 } }],
      [`/api/v1/slots/${schedule.slots[0].id}`, 'PATCH', { expectedRevision: 1, changes: { startMinute: 480 } }],
      [`/api/v1/slots/${schedule.slots[0].id}`, 'DELETE', { expectedRevision: 1 }],
    ];
    for (const [path, method, body] of routes) {
      const denied = await call(path, method, body); assert.equal(denied.status, 409); assert.ok(denied.headers.get('x-request-id'));
      assert.equal((await call(path, method, body, otherCookies)).status, 404);
    }
    assert.deepEqual(await db.weeklySchedule.findUniqueOrThrow({ where: { id: schedule.id }, include: { slots: true } }), schedule);
    assert.equal(await db.auditLog.count(), auditCount);
  });
  await t.test('TASK-083 workplace picker, dated slot projection, containment, legacy neutrality and cross-schedule overlap', async () => {
    const workplaceTeacher = await db.teacher.create({ data: { districtId: district.id, institutionId: institution.id, name: 'مكان', surname: 'عمل' } });
    const supplementary = await db.institution.create({ data: { districtId: district.id, name: 'TASK-083 supplementary' } });
    const outside = await db.institution.create({ data: { districtId: otherDistrict.id, name: 'TASK-083 outside' } });
    await db.teacherSupplementaryWorkplace.create({ data: { teacherId: workplaceTeacher.id, districtId: district.id, institutionId: supplementary.id,
      validFrom: new Date('2035-09-01T00:00:00.000Z'), validTo: new Date('2035-12-01T00:00:00.000Z') } });

    const picked = await call(`/api/v1/teachers/${workplaceTeacher.id}/valid-workplaces?date=2035-10-01`);
    assert.equal(picked.status, 200);
    assert.deepEqual((await picked.json()).data.items.map(({ id, role }) => ({ id, role })), [
      { id: institution.id, role: 'HOME' }, { id: supplementary.id, role: 'SUPPLEMENTARY' },
    ]);
    const interval = await call(`/api/v1/teachers/${workplaceTeacher.id}/valid-workplaces?validFrom=2035-09-01&validTo=2035-10-01`);
    assert.equal(interval.status, 200); assert.ok((await interval.json()).data.items.some((item) => item.id === supplementary.id));
    assert.equal((await call(`/api/v1/teachers/${workplaceTeacher.id}/valid-workplaces?date=2035-10-01`, 'GET', undefined, null)).status, 401);
    assert.equal((await call(`/api/v1/teachers/${outside.id}/valid-workplaces?date=2035-10-01`)).status, 404);
    assert.equal((await call(`/api/v1/teachers/${workplaceTeacher.id}/valid-workplaces?date=2035-02-30`)).status, 400);
    assert.equal((await call(`/api/v1/teachers/${workplaceTeacher.id}/valid-workplaces?date=2035-10-01&validFrom=2035-09-01`)).status, 400);

    const firstSlot = { institutionId: supplementary.id, validFrom: '2035-09-01', validTo: '2035-10-01', dayOfWeek: 7, startMinute: 480, endMinute: 540 };
    const firstResponse = await teacherCall(workplaceTeacher, { academicYear: '2035-2036', slots: [firstSlot] }); assert.equal(firstResponse.status, 201);
    const firstProjection = (await firstResponse.json()).data.schedule.slots[0];
    assert.equal(firstProjection.institution.name, supplementary.name); assert.equal(firstProjection.validFrom, '2035-09-01');
    assert.deepEqual(firstProjection.consistency, { status: 'CONSISTENT', reasonCode: null });
    const adjacent = await teacherCall(workplaceTeacher, { academicYear: '2036-2037', slots: [{ ...firstSlot, validFrom: '2035-10-01', validTo: '2035-11-01' }] });
    assert.equal(adjacent.status, 201, 'adjacent half-open periods allowed across labels');
    const exclusion = await db.$queryRaw`SELECT conname FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND conname='WeeklyScheduleSlot_temporal_no_overlapping_teacher_slots'`;
    assert.equal(exclusion.length, 1);
    const overlap = await teacherCall(workplaceTeacher, { academicYear: '2037-2038', slots: [{ ...firstSlot, validFrom: '2035-09-15', validTo: '2035-09-20' }] });
    assert.equal(overlap.status, 400); assert.equal((await overlap.json()).error.code, 'WEEKLY_SCHEDULE_SLOT_OVERLAP');
    const racePeriod = { institutionId: institution.id, validFrom: '2040-01-01', validTo: '2040-02-01', dayOfWeek: 1, startMinute: 480, endMinute: 540 };
    const temporalRace = await Promise.all(['2040-2041', '2041-2042'].map(academicYear => teacherCall(workplaceTeacher, { academicYear, slots: [racePeriod] })));
    assert.deepEqual(temporalRace.map(r => r.status).sort(), [201,400]);
    assert.equal((await temporalRace.find(r => r.status === 400).json()).error.code, 'WEEKLY_SCHEDULE_SLOT_OVERLAP');
    assert.equal(await db.weeklyScheduleSlot.count({ where: { teacherId: workplaceTeacher.id, validFrom: new Date('2040-01-01T00:00:00.000Z') } }), 1);
    const arbitrary = await teacherCall(workplaceTeacher, { academicYear: '2037-2038', slots: [{ ...firstSlot, institutionId: outside.id, validFrom: '2038-01-01', validTo: '2038-02-01' }] });
    assert.equal(arbitrary.status, 404);
    const containment = await teacherCall(workplaceTeacher, { academicYear: '2037-2038', slots: [{ ...firstSlot, validTo: '2036-01-01' }] }); assert.equal(containment.status, 409);
    const legacySchedule = await db.weeklySchedule.create({ data: { teacherId: workplaceTeacher.id, academicYear: '2038-2039', slots: { create: [{ dayOfWeek: 1, startMinute: 600, endMinute: 660 }] } } });
    const legacyRead = await call(`/api/v1/teachers/${workplaceTeacher.id}/schedules?academicYear=2038-2039`);
    const legacySlot = (await legacyRead.json()).data.schedule.slots[0];
    assert.equal(legacySlot.institution, null); assert.equal(legacySlot.validFrom, null); assert.equal(legacySlot.validTo, null);
    assert.equal(legacySlot.consistency.status, 'LEGACY_UNKNOWN');
    const legacyEdit = await call(`/api/v1/slots/${legacySlot.id}`, 'PATCH', { expectedRevision: legacySchedule.revision, changes: { startMinute: 610 } });
    assert.equal(legacyEdit.status, 409);
    const legacyNoop = await call(`/api/v1/slots/${legacySlot.id}`, 'PATCH', { expectedRevision: legacySchedule.revision, changes: { startMinute: 600 } });
    assert.equal(legacyNoop.status, 409); assert.equal((await db.weeklyScheduleSlot.findUniqueOrThrow({ where: { id: legacySlot.id } })).institutionId, null);

    const relation = await db.teacherSupplementaryWorkplace.findFirstOrThrow({ where: { teacherId: workplaceTeacher.id, institutionId: supplementary.id } });
    const closePath = `/api/v1/teachers/${workplaceTeacher.id}/supplementary-workplaces/${relation.id}`;
    const closedRelation = await call(closePath, 'PATCH', { validTo: '2035-09-15' });
    assert.equal(closedRelation.status, 200, 'TASK-082 permits closing the authoritative workplace interval');
    const unchangedSlot = await db.weeklyScheduleSlot.findUniqueOrThrow({ where: { id: firstProjection.id } });
    assert.deepEqual({ institutionId: unchangedSlot.institutionId, validFrom: unchangedSlot.validFrom?.toISOString(), validTo: unchangedSlot.validTo?.toISOString(), dayOfWeek: unchangedSlot.dayOfWeek, startMinute: unchangedSlot.startMinute, endMinute: unchangedSlot.endMinute },
      { institutionId: supplementary.id, validFrom: '2035-09-01T00:00:00.000Z', validTo: '2035-10-01T00:00:00.000Z', dayOfWeek: 7, startMinute: 480, endMinute: 540 });
    const afterWorkplaceChange = await call(`/api/v1/teachers/${workplaceTeacher.id}/schedules?academicYear=2035-2036`);
    const afterSlot = (await afterWorkplaceChange.json()).data.schedule.slots[0];
    assert.equal(afterSlot.id, firstProjection.id); assert.equal(afterSlot.institutionId, supplementary.id);
    assert.deepEqual(afterSlot.consistency, { status: 'NEEDS_CORRECTION', reasonCode: 'SUPPLEMENTARY_VALIDITY_CHANGED' });
    const archivedPicker = await db.institution.update({ where: { id: supplementary.id }, data: { archivedAt: new Date() } });
    assert.ok(archivedPicker.archivedAt);
    assert.equal((await call(`/api/v1/teachers/${workplaceTeacher.id}/valid-workplaces?date=2035-10-01`)).status, 200);
  });
  await t.test('Teacher concurrent initial creates have one winner; initial audit failure rolls back schedule', async () => {
    const race = await Promise.all([[], []].map(slots => teacherCall(teacher, { academicYear: '2028-2029', slots })));
    assert.deepEqual(race.map(r => r.status).sort(), [201,409]);
    assert.equal(await db.weeklySchedule.count({ where: { teacherId: teacher.id, academicYear: '2028-2029' } }), 1);
    await db.$executeRaw`CREATE FUNCTION task048_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action" = 'TEACHER_SCHEDULE_SUBMITTED' THEN RAISE EXCEPTION 'audit test failure'; END IF; RETURN NEW; END $$`;
    await db.$executeRaw`CREATE TRIGGER task048_fail_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION task048_fail_audit()`;
    try {
      const failed = await teacherCall(teacher, { academicYear: '2031-2032', slots: [] }); assert.equal(failed.status, 500);
      assert.equal(await db.weeklySchedule.count({ where: { teacherId: teacher.id, academicYear: '2031-2032' } }), 0);
    } finally { await db.$executeRaw`DROP TRIGGER task048_fail_audit ON "AuditLog"`; await db.$executeRaw`DROP FUNCTION task048_fail_audit()`; }
  });
  await t.test('mutation requires CSRF and returns safe request error envelope', async () => {
    const denied = await call(`/api/v1/teachers/${teacher.id}/schedules`, 'POST', { academicYear: '2030-2031', slots: [] }, cookies, true);
    assert.equal(denied.status, 403); assert.equal((await denied.json()).error.code, 'FORBIDDEN');
  });
});
