import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { createApp } from '../dist/app.js';
import { registerAuthRoutes, requireAuthenticatedInspector } from '../dist/identity/auth-routes.js';
import { registerWeeklyScheduleRoutes } from '../dist/schedules/routes.js';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const password = `task048-${randomUUID()}-synthetic`;
let admin, db, server, baseUrl, schemaName, inspector, otherInspector, district, otherDistrict, institution, teacher, unassignedTeacher, cookies, otherCookies;

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
  const app = createApp((instance) => { registerAuthRoutes(instance, db); registerWeeklyScheduleRoutes(instance, db, requireAuthenticatedInspector(db)); });
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
  await t.test('strict schedule create, audit, duplicate and unassigned prerequisite', async () => {
    const unassigned = await call(`/api/v1/teachers/${unassignedTeacher.id}/schedules`, 'POST', { academicYear: year, slots: [] });
    assert.equal(unassigned.status, 409); assert.equal((await unassigned.json()).error.code, 'TEACHER_CURRENT_INSTITUTION_REQUIRED');
    const unknown = await call(`/api/v1/teachers/${teacher.id}/schedules`, 'POST', { academicYear: year, slots: [], extra: true }); assert.equal(unknown.status, 400);
    const create = await call(`/api/v1/teachers/${teacher.id}/schedules`, 'POST', { academicYear: year, slots: [] });
    assert.equal(create.status, 201); const created = (await create.json()).data.schedule; assert.equal(created.revision, 1); assert.deepEqual(created.slots, []);
    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: created.id, action: 'WEEKLY_SCHEDULE_CREATED' } }); assert.deepEqual(audit.metadata, {});
    const duplicate = await call(`/api/v1/teachers/${teacher.id}/schedules`, 'POST', { academicYear: year, slots: [] }); assert.equal(duplicate.status, 409); assert.equal((await duplicate.json()).error.code, 'WEEKLY_SCHEDULE_ALREADY_EXISTS');
    const race = await Promise.all(['2027-2028', '2027-2028'].map(() => call(`/api/v1/teachers/${teacher.id}/schedules`, 'POST', { academicYear: '2027-2028', slots: [] })));
    assert.deepEqual(race.map((response) => response.status).sort(), [201, 409]);
    const initialSlots = [
      { dayOfWeek: 4, startMinute: 480, endMinute: 540 },
      { dayOfWeek: 4, startMinute: 540, endMinute: 600 },
    ];
    const withInitialSlots = await call(`/api/v1/teachers/${teacher.id}/schedules`, 'POST', { academicYear: '2029-2030', slots: initialSlots });
    assert.equal(withInitialSlots.status, 201); assert.equal((await withInitialSlots.json()).data.schedule.slots.length, 2);
    const overlappingInitial = await call(`/api/v1/teachers/${teacher.id}/schedules`, 'POST', { academicYear: '2030-2031', slots: [initialSlots[0], { ...initialSlots[0], startMinute: 500 }] });
    assert.equal(overlappingInitial.status, 400); assert.equal((await overlappingInitial.json()).error.code, 'WEEKLY_SCHEDULE_SLOT_OVERLAP');
    const outsideTeacher = await db.teacher.create({ data: { districtId: otherDistrict.id, name: 'X', surname: 'Y' } });
    const hiddenCreate = await call(`/api/v1/teachers/${outsideTeacher.id}/schedules`, 'POST', { academicYear: year, slots: [] });
    assert.equal(hiddenCreate.status, 404);
  });
  await t.test('adjacency, overlap, revision, patch normalization/no-op, delete-final and audit metadata', async () => {
    let schedule = (await (await call(getPath)).json()).data.schedule;
    const add = async (slot) => call(`/api/v1/schedules/${schedule.id}/slots`, 'POST', { expectedRevision: schedule.revision, slot });
    const mondayA = { dayOfWeek: 1, startMinute: 480, endMinute: 540, levelLabel: null, groupLabel: null, notes: null };
    let response = await add(mondayA); assert.equal(response.status, 201); schedule = (await response.json()).data.schedule; assert.equal(schedule.revision, 2);
    const firstId = schedule.slots[0].id;
    response = await add({ ...mondayA, startMinute: 540, endMinute: 600 }); assert.equal(response.status, 201); schedule = (await response.json()).data.schedule; assert.equal(schedule.revision, 3);
    response = await add({ ...mondayA, startMinute: 530, endMinute: 550 }); assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'WEEKLY_SCHEDULE_SLOT_OVERLAP');
    const otherScoped = await call(`/api/v1/schedules/${schedule.id}/slots`, 'POST', { expectedRevision: schedule.revision, slot: { ...mondayA, dayOfWeek: 2 } }, otherCookies); assert.equal(otherScoped.status, 404);
    response = await add({ ...mondayA, dayOfWeek: 2 }); assert.equal(response.status, 201); schedule = (await response.json()).data.schedule;
    const mondaySlots = schedule.slots.filter((item) => item.dayOfWeek === 1); const patchTarget = mondaySlots[0];
    response = await call(`/api/v1/slots/${patchTarget.id}`, 'PATCH', { expectedRevision: schedule.revision, changes: {
      dayOfWeek: 3, startMinute: 610, endMinute: 670, levelLabel: '  مستوى   أول ', groupLabel: 'فوج 1', notes: '  ملاحظة   اختبار  ',
    } });
    assert.equal(response.status, 200); schedule = (await response.json()).data.schedule; assert.equal(schedule.revision, 5);
    assert.deepEqual(schedule.slots.find((item) => item.id === patchTarget.id), { ...patchTarget, dayOfWeek: 3, startMinute: 610, endMinute: 670, levelLabel: 'مستوى أول', groupLabel: 'فوج 1', notes: 'ملاحظة اختبار' });
    response = await call(`/api/v1/slots/${patchTarget.id}`, 'PATCH', { expectedRevision: schedule.revision, changes: { levelLabel: null, groupLabel: null, notes: null } });
    assert.equal(response.status, 200); schedule = (await response.json()).data.schedule; assert.equal(schedule.revision, 6);
    assert.deepEqual([schedule.slots.find((item) => item.id === patchTarget.id).levelLabel, schedule.slots.find((item) => item.id === patchTarget.id).groupLabel, schedule.slots.find((item) => item.id === patchTarget.id).notes], [null, null, null]);
    const auditBeforeNoop = await db.auditLog.count({ where: { entityId: schedule.id, action: 'WEEKLY_SCHEDULE_UPDATED' } });
    response = await call(`/api/v1/slots/${patchTarget.id}`, 'PATCH', { expectedRevision: schedule.revision, changes: { notes: null } }); assert.equal(response.status, 200);
    assert.equal((await response.json()).data.schedule.revision, schedule.revision);
    assert.equal(await db.auditLog.count({ where: { entityId: schedule.id, action: 'WEEKLY_SCHEDULE_UPDATED' } }), auditBeforeNoop);
    response = await call(`/api/v1/slots/${patchTarget.id}`, 'PATCH', { expectedRevision: schedule.revision - 1, changes: { notes: null } }); assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'WEEKLY_SCHEDULE_REVISION_CONFLICT');
    response = await call(`/api/v1/slots/${patchTarget.id}`, 'PATCH', { expectedRevision: schedule.revision, changes: { notes: '   ' } }); assert.equal(response.status, 400);
    response = await call(`/api/v1/slots/${firstId}`, 'DELETE', { expectedRevision: schedule.revision }); assert.equal(response.status, 200); schedule = (await response.json()).data.schedule;
    for (const slot of [...schedule.slots]) { response = await call(`/api/v1/slots/${slot.id}`, 'DELETE', { expectedRevision: schedule.revision }); assert.equal(response.status, 200); schedule = (await response.json()).data.schedule; }
    assert.deepEqual(schedule.slots, []);
    const events = await db.auditLog.findMany({ where: { entityId: schedule.id, action: 'WEEKLY_SCHEDULE_UPDATED' } });
    assert.ok(events.every((event) => Object.keys(event.metadata).sort().join(',') === 'affectedSlotIds,changedFields,slotCount'));
    assert.ok(events.every((event) => event.metadata.changedFields[0] === 'slots'));
    assert.ok(events.every((event) => event.metadata.affectedSlotIds.length === 1));
    assert.ok(events.some((event) => event.metadata.affectedSlotIds[0] === patchTarget.id));
    assert.equal(events.at(-1).metadata.slotCount, 0);
  });
  await t.test('revision gives at most one concurrent winner and audit failure rolls back slot plus revision', async () => {
    const scheduleResponse = await call(`/api/v1/teachers/${teacher.id}/schedules`, 'POST', { academicYear: '2028-2029', slots: [] });
    const schedule = (await scheduleResponse.json()).data.schedule;
    const candidate = { dayOfWeek: 1, startMinute: 100, endMinute: 200, levelLabel: null, groupLabel: null, notes: null };
    const race = await Promise.all([candidate, { ...candidate, dayOfWeek: 2 }].map((slot) => call(`/api/v1/schedules/${schedule.id}/slots`, 'POST', { expectedRevision: 1, slot })));
    assert.deepEqual(race.map((response) => response.status).sort(), [201, 409]);
    const afterRace = await db.weeklySchedule.findUniqueOrThrow({ where: { id: schedule.id }, include: { slots: true } }); assert.equal(afterRace.revision, 2); assert.equal(afterRace.slots.length, 1);
    await db.$executeRaw`CREATE FUNCTION task048_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action" = 'WEEKLY_SCHEDULE_UPDATED' THEN RAISE EXCEPTION 'audit test failure'; END IF; RETURN NEW; END $$`;
    await db.$executeRaw`CREATE TRIGGER task048_fail_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION task048_fail_audit()`;
    try {
      const slot = { dayOfWeek: 3, startMinute: 100, endMinute: 200, levelLabel: null, groupLabel: null, notes: null };
      const failed = await call(`/api/v1/schedules/${schedule.id}/slots`, 'POST', { expectedRevision: 2, slot }); assert.equal(failed.status, 500);
      const unchanged = await db.weeklySchedule.findUniqueOrThrow({ where: { id: schedule.id }, include: { slots: true } }); assert.equal(unchanged.revision, 2); assert.equal(unchanged.slots.length, 1);
    } finally { await db.$executeRaw`DROP TRIGGER task048_fail_audit ON "AuditLog"`; await db.$executeRaw`DROP FUNCTION task048_fail_audit()`; }
  });
  await t.test('mutation requires CSRF and returns safe request error envelope', async () => {
    const denied = await call(`/api/v1/teachers/${teacher.id}/schedules`, 'POST', { academicYear: '2030-2031', slots: [] }, cookies, true);
    assert.equal(denied.status, 403); assert.equal((await denied.json()).error.code, 'FORBIDDEN');
  });
});
