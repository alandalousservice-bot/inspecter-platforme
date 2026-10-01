import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import { log } from 'node:console';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { createApp } from '../dist/app.js';
import { registerAuthRoutes, requireAuthenticatedInspector } from '../dist/identity/auth-routes.js';
import { registerTeacherDirectoryRoutes } from '../dist/teachers/directory-routes.js';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const password = `task044-${randomUUID()}-synthetic`;
const academicYear = '2026-2027';
const fixedInstant = new Date('2026-09-29T07:30:00.000Z'); // Tuesday 08:30 in Africa/Algiers.
let admin, db, server, baseUrl, schemaName, inspector, noMembershipInspector, otherInspector;
let districtA, districtB, outsideDistrict, futureDistrict, expiredDistrict, institutionA, institutionB, outsideInstitution;
let cookies, noMembershipCookies, clockCalls = 0, routeQueries = 0;

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('Isolated TEST_DATABASE_URL required.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid isolated test target.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
      || url.port !== '55432' || url.username !== 'task020_test_user'
      || url.pathname !== '/task020_test' || url.searchParams.get('schema') !== 'public') {
    throw new Error('Refusing unapproved database target.');
  }
  const ambient = process.env.DATABASE_URL;
  if (ambient) {
    let other;
    try { other = new URL(ambient); } catch { throw new Error('Ambient DATABASE_URL is invalid.'); }
    if (other.hostname === url.hostname && other.port === url.port && other.pathname === url.pathname) {
      throw new Error('Isolated test target must differ from DATABASE_URL.');
    }
  }
  return raw;
}

function runPrisma(args, url) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', join(apiDir, 'prisma/schema.prisma')], {
    cwd: rootDir, env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8', timeout: 120_000, windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error(`Isolated TASK-044 Prisma ${args[0]} failed.`);
}

function cookieParts(response) { return (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).filter(Boolean); }
function cookieHeader(parts) { return parts.map((part) => part.split(';', 1)[0]).join('; '); }
function csrf(parts) { return decodeURIComponent(parts.find((part) => part.startsWith('inspector_csrf=')).split(';', 1)[0].slice('inspector_csrf='.length)); }
async function login(target) {
  const initial = cookieParts(await fetch(`${baseUrl}/api/v1/auth/me`));
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST', headers: { cookie: cookieHeader(initial), 'x-csrf-token': csrf(initial), 'content-type': 'application/json' },
    body: JSON.stringify({ email: target.email, password }),
  });
  assert.equal(response.status, 200);
  return cookieParts(response);
}
async function call(path, selectedCookies = cookies) {
  const headers = selectedCookies ? { cookie: cookieHeader(selectedCookies) } : {};
  return fetch(`${baseUrl}/api/v1/teachers${path ? `?${path}` : ''}`, { headers });
}
async function list(path = '', selectedCookies = cookies) {
  const response = await call(path, selectedCookies);
  const body = await response.json();
  return { response, body };
}
async function createTeacher(data) {
  return db.teacher.create({ data: { districtId: districtA.id, name: 'اختبار', surname: randomUUID(), ...data } });
}

before(async () => {
  const databaseUrl = approvedUrl();
  const { PrismaClient } = await import('@prisma/client');
  const { hashPassword } = await import('../dist/identity/password.js');
  admin = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  assert.deepEqual(identity[0], { db: 'task020_test', role: 'task020_test_user' });
  schemaName = `task044_${process.pid}_${randomBytes(6).toString('hex')}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  const scopedUrl = new URL(databaseUrl);
  scopedUrl.searchParams.set('schema', schemaName);
  runPrisma(['migrate', 'deploy'], scopedUrl.toString());
  db = new PrismaClient({ datasources: { db: { url: scopedUrl.toString() } }, log: [{ emit: 'event', level: 'query' }] });
  db.$on('query', () => { routeQueries += 1; });
  await db.$connect();

  const passwordHash = await hashPassword(password);
  [inspector, noMembershipInspector, otherInspector] = await Promise.all([
    db.inspector.create({ data: { email: `task044-${randomUUID()}@example.invalid`, passwordHash, status: 'ACTIVE' } }),
    db.inspector.create({ data: { email: `task044-none-${randomUUID()}@example.invalid`, passwordHash, status: 'ACTIVE' } }),
    db.inspector.create({ data: { email: `task044-other-${randomUUID()}@example.invalid`, passwordHash, status: 'ACTIVE' } }),
  ]);
  [districtA, districtB, outsideDistrict, futureDistrict, expiredDistrict] = await Promise.all([
    db.district.create({ data: { name: 'TASK-044 A' } }),
    db.district.create({ data: { name: 'TASK-044 B' } }),
    db.district.create({ data: { name: 'TASK-044 outside' } }),
    db.district.create({ data: { name: 'TASK-044 future' } }),
    db.district.create({ data: { name: 'TASK-044 expired' } }),
  ]);
  const now = new Date(fixedInstant.getTime() - 60_000);
  await db.inspectorDistrictMembership.createMany({ data: [
    { inspectorId: inspector.id, districtId: districtA.id, role: 'INSPECTOR', validFrom: now },
    { inspectorId: inspector.id, districtId: districtB.id, role: 'INSPECTOR', validFrom: now },
    { inspectorId: inspector.id, districtId: futureDistrict.id, role: 'INSPECTOR', validFrom: new Date(fixedInstant.getTime() + 86_400_000) },
    { inspectorId: inspector.id, districtId: expiredDistrict.id, role: 'INSPECTOR', validFrom: new Date(fixedInstant.getTime() - 172_800_000), validTo: new Date(fixedInstant.getTime() - 86_400_000) },
    { inspectorId: otherInspector.id, districtId: outsideDistrict.id, role: 'INSPECTOR', validFrom: now },
  ] });
  [institutionA, institutionB, outsideInstitution] = await Promise.all([
    db.institution.create({ data: { districtId: districtA.id, name: 'مدرسة النور', municipality: 'الجزائر' } }),
    db.institution.create({ data: { districtId: districtB.id, name: 'مدرسة الأمل', municipality: 'وهران' } }),
    db.institution.create({ data: { districtId: outsideDistrict.id, name: 'مدرسة خارج النطاق' } }),
  ]);

  const app = createApp((instance) => {
    registerAuthRoutes(instance, db);
    const requireInspector = requireAuthenticatedInspector(db);
    registerTeacherDirectoryRoutes(instance, db, requireInspector, () => { clockCalls += 1; return fixedInstant; });
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((yes, no) => { server.once('listening', yes); server.once('error', no); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  [cookies, noMembershipCookies] = await Promise.all([
    login(inspector), login(noMembershipInspector),
  ]);

  await db.teacher.createMany({ data: Array.from({ length: 205 }, (_, index) => ({
    districtId: districtA.id,
    institutionId: index % 2 === 0 ? institutionA.id : null,
    name: `Demo ${String(index).padStart(3, '0')}`,
    surname: `Teacher ${String(index).padStart(3, '0')}`,
    professionalStatus: ['PERMANENT', 'TRAINEE', 'CONTRACT', 'TEMPORARY_CONTRACT', 'SUBSTITUTE'][index % 5],
    recordStatus: 'ACTIVE',
  })) });
  const bulkTeachers = await db.teacher.findMany({ where: { districtId: districtA.id, name: { startsWith: 'Demo ' } }, orderBy: { name: 'asc' }, select: { id: true } });
  const bulkSchedules = bulkTeachers.slice(0, 180).map(({ id }) => ({ id: randomUUID(), teacherId: id, academicYear }));
  await db.weeklySchedule.createMany({ data: bulkSchedules });
  await db.weeklyScheduleSlot.createMany({ data: bulkSchedules.map(({ id }) => ({ scheduleId: id, dayOfWeek: 2, startMinute: 480, endMinute: 540 })) });

  await createTeacher({ name: 'محمد', surname: 'علي', phone: '+213555123456', email: 'amina.search@example.dz', professionalStatus: 'PERMANENT', institutionId: institutionA.id });
  await createTeacher({ name: 'محمد', surname: 'فقط', institutionId: institutionA.id });
  await createTeacher({ name: 'أحمد', surname: 'بن صالح', institutionId: institutionA.id });
  await createTeacher({ name: 'غير نشط', surname: 'أستاذ', recordStatus: 'INACTIVE' });
  await createTeacher({ name: 'بلا مؤسسة', surname: 'نشط', institutionId: null });
  await createTeacher({ name: 'مع أرشفة مستقلة', surname: 'نشط', archivedAt: new Date('2026-01-01T00:00:00Z') });
  for (const professionalStatus of ['PERMANENT', 'TRAINEE', 'CONTRACT', 'TEMPORARY_CONTRACT', 'SUBSTITUTE']) {
    await createTeacher({ name: `حالة ${professionalStatus}`, surname: 'اختبار', professionalStatus });
  }
  await createTeacher({ name: 'NULL', surname: 'مهني', professionalStatus: null });
  const districtBTeacher = await db.teacher.create({ data: { districtId: districtB.id, name: 'مقيدة', surname: 'ب' } });
  await db.teacher.create({ data: { districtId: outsideDistrict.id, name: 'سري', surname: 'خارج' } });
  await db.teacher.create({ data: { districtId: futureDistrict.id, name: 'مستقبل', surname: 'عضوية' } });
  await db.teacher.create({ data: { districtId: expiredDistrict.id, name: 'منتهية', surname: 'عضوية' } });
  await db.teacherSubmission.create({ data: { districtId: districtA.id, submittedProfile: { firstName: 'معلومة', lastName: 'قديمة', workplace: { institutionName: 'عبارة لا تبحث في التصريح', municipality: 'بلدية قديمة' } } } });

  const slotTeachers = await Promise.all([
    createTeacher({ name: 'وقت', surname: 'يبدأ', institutionId: institutionA.id }),
    createTeacher({ name: 'وقت', surname: 'ينتهي', institutionId: institutionA.id }),
    createTeacher({ name: 'وقت', surname: 'مجاور', institutionId: institutionA.id }),
    createTeacher({ name: 'يوم', surname: 'الأربعاء' }),
  ]);
  const scheduleRows = slotTeachers.map((teacher) => ({ id: randomUUID(), teacherId: teacher.id, academicYear }));
  await db.weeklySchedule.createMany({ data: scheduleRows });
  await db.weeklyScheduleSlot.createMany({ data: [
    { scheduleId: scheduleRows[0].id, dayOfWeek: 2, startMinute: 510, endMinute: 600 },
    { scheduleId: scheduleRows[1].id, dayOfWeek: 2, startMinute: 480, endMinute: 510 },
    { scheduleId: scheduleRows[2].id, dayOfWeek: 2, startMinute: 510, endMinute: 540 },
    { scheduleId: scheduleRows[3].id, dayOfWeek: 3, startMinute: 510, endMinute: 600 },
  ] });
  Object.assign(globalThis, { task044DistrictBTeacher: districtBTeacher, task044SlotTeachers: slotTeachers });
});

after(async () => {
  if (server) await new Promise((yes) => server.close(yes));
  await db?.$disconnect();
  if (admin && schemaName) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin?.$disconnect();
});

test('TASK-044 authenticated scoped directory, search, schedule filters and stable pagination', async (t) => {
  await t.test('authentication, district union/narrowing, empty scope, safe 404 and cache/request metadata', async () => {
    let result = await list('', null);
    assert.equal(result.response.status, 401);
    assert.ok(result.response.headers.get('x-request-id'));
    assert.equal(result.response.headers.get('cache-control'), 'no-store');
    result = await list('');
    assert.equal(result.response.status, 200);
    assert.equal(result.body.page.total, await db.teacher.count({ where: { districtId: { in: [districtA.id, districtB.id] }, recordStatus: 'ACTIVE' } }));
    assert.ok(result.body.data.some((teacher) => teacher.districtId === districtA.id));
    assert.ok(result.body.page.total > await db.teacher.count({ where: { districtId: districtA.id, recordStatus: 'ACTIVE' } }));
    result = await list(`districtId=${districtB.id}`);
    assert.ok(result.body.data.some((teacher) => teacher.districtId === districtB.id));
    result = await list(`districtId=${districtA.id}`);
    assert.ok(result.body.data.every((teacher) => teacher.districtId === districtA.id));
    result = await list(`districtId=${outsideDistrict.id}`);
    assert.equal(result.response.status, 404);
    assert.deepEqual(Object.keys(result.body.error).sort(), ['code', 'message', 'requestId']);
    assert.equal(JSON.stringify(result.body).includes('سري'), false);
    assert.equal((await list(`districtId=${futureDistrict.id}`)).response.status, 404);
    assert.equal((await list(`districtId=${expiredDistrict.id}`)).response.status, 404);
    result = await list('', noMembershipCookies);
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.data, []);
    assert.deepEqual(result.body.page, { limit: 25, nextCursor: null, total: 0 });
    await db.inspector.update({ where: { id: inspector.id }, data: { status: 'INACTIVE' } });
    result = await list('');
    assert.equal(result.response.status, 401);
    await db.inspector.update({ where: { id: inspector.id }, data: { status: 'ACTIVE' } });
  });

  await t.test('defaults, minimized projection, active unassigned and separate archivedAt', async () => {
    const { response, body } = await list(`q=${encodeURIComponent('بلا مؤسسة')}`);
    assert.equal(response.status, 200);
    assert.equal(body.page.total, 1);
    assert.equal(body.data[0].currentInstitution, null);
    assert.deepEqual(Object.keys(body.data[0]).sort(), ['currentInstitution', 'districtId', 'id', 'name', 'professionalStatus', 'recordStatus', 'surname']);
    assert.equal(body.data[0].recordStatus, 'ACTIVE');
    const archivedActive = await list(`q=${encodeURIComponent('مع أرشفة مستقلة')}`);
    assert.equal(archivedActive.body.page.total, 1);
    const inactive = await list(`recordStatus=INACTIVE&q=${encodeURIComponent('غير نشط')}`);
    assert.equal(inactive.body.page.total, 1);
    assert.equal(inactive.body.data[0].recordStatus, 'INACTIVE');
    const defaultInactive = await list(`q=${encodeURIComponent('غير نشط')}`);
    assert.equal(defaultInactive.body.page.total, 0);
  });

  await t.test('q supports documented text/phone searches without historical fields or Arabic folding', async () => {
    const multi = await list(`q=${encodeURIComponent('  محمد    علي ')}`);
    assert.equal(multi.body.page.total, 1);
    assert.equal(multi.body.data[0].surname, 'علي');
    assert.equal((await list(`q=${encodeURIComponent('محمد فقط')}`)).body.page.total, 1);
    assert.equal((await list(`q=${encodeURIComponent('0555123456')}`)).body.page.total, 1);
    const email = await list(`q=${encodeURIComponent('amina.search@example.dz')}`);
    assert.equal(email.body.page.total, 1);
    assert.equal(email.body.data[0].name, 'محمد');
    const institutionName = await list(`q=${encodeURIComponent('مدرسة النور')}`);
    assert.ok(institutionName.body.page.total > 1);
    assert.ok(institutionName.body.data.every((teacher) => teacher.currentInstitution?.name === 'مدرسة النور'));
    assert.equal((await list(`q=${encodeURIComponent('عبارة لا تبحث في التصريح')}`)).body.page.total, 0);
    assert.equal((await list(`q=${encodeURIComponent('احمد')}`)).body.page.total, 0);
    const partial = await list(`q=${encodeURIComponent('حمد')}`);
    assert.ok(partial.body.page.total > 0);
    const tooLong = await list(`q=${'ا'.repeat(101)}`);
    assert.equal(tooLong.response.status, 400);
    assert.equal(JSON.stringify(tooLong.body).includes('ا'.repeat(101)), false);
  });

  await t.test('current Institution, assigned/unassigned and professional status filters compose safely', async () => {
    const assigned = await list(`institutionId=${institutionA.id}&hasCurrentInstitution=true`);
    assert.ok(assigned.body.data.every((teacher) => teacher.currentInstitution?.id === institutionA.id));
    assert.equal((await list('hasCurrentInstitution=false')).body.data.every((teacher) => teacher.currentInstitution === null), true);
    assert.equal((await list(`institutionId=${institutionA.id}&hasCurrentInstitution=false`)).response.status, 400);
    assert.equal((await list(`institutionId=${outsideInstitution.id}`)).response.status, 404);
    assert.equal((await list(`institutionId=${institutionB.id}&districtId=${districtA.id}`)).response.status, 404);
    for (const status of ['PERMANENT', 'TRAINEE', 'CONTRACT', 'TEMPORARY_CONTRACT', 'SUBSTITUTE']) {
      const filtered = await list(`professionalStatus=${status}`);
      assert.ok(filtered.body.data.every((teacher) => teacher.professionalStatus === status));
      assert.ok(filtered.body.page.total > 0);
    }
    assert.equal((await list('professionalStatus=UNKNOWN')).response.status, 400);
    assert.equal((await list('professionalStatus=PERMANENT')).body.page.total, await db.teacher.count({ where: { districtId: { in: [districtA.id, districtB.id] }, recordStatus: 'ACTIVE', professionalStatus: 'PERMANENT' } }));
    const composed = await list(`q=${encodeURIComponent('محمد علي')}&institutionId=${institutionA.id}&professionalStatus=PERMANENT&recordStatus=ACTIVE`);
    assert.equal(composed.body.page.total, 1);
  });

  await t.test('schedule year/day/time semantics and worksToday/worksNow use one Algiers instant', async () => {
    const slotTeachers = globalThis.task044SlotTeachers;
    const beforeClockCalls = clockCalls;
    const atStart = await list(`academicYear=${academicYear}&dayOfWeek=2&minuteOfDay=510&q=${encodeURIComponent('وقت')}`);
    assert.equal(clockCalls, beforeClockCalls + 1);
    const startIds = new Set(atStart.body.data.map((teacher) => teacher.id));
    assert.ok(startIds.has(slotTeachers[0].id));
    assert.ok(startIds.has(slotTeachers[2].id));
    assert.equal(startIds.has(slotTeachers[1].id), false);
    const atEnd = await list(`academicYear=${academicYear}&dayOfWeek=2&minuteOfDay=600&q=${encodeURIComponent('وقت')}`);
    assert.equal(atEnd.body.data.some((teacher) => teacher.id === slotTeachers[0].id), false);
    const today = await list(`academicYear=${academicYear}&worksToday=true&q=${encodeURIComponent('وقت')}`);
    assert.ok(today.body.data.some((teacher) => teacher.id === slotTeachers[0].id));
    const now = await list(`academicYear=${academicYear}&worksNow=true&q=${encodeURIComponent('وقت')}`);
    assert.ok(now.body.data.some((teacher) => teacher.id === slotTeachers[0].id));
    assert.equal(now.body.data.some((teacher) => teacher.id === slotTeachers[1].id), false);
    assert.ok((await list(`academicYear=${academicYear}&dayOfWeek=3&q=${encodeURIComponent('يوم الأربعاء')}`)).body.data.some((teacher) => teacher.id === slotTeachers[3].id));
    for (const query of [
      'dayOfWeek=2', 'minuteOfDay=510', 'academicYear=2026-2027',
      'academicYear=2026-2028&dayOfWeek=2', 'academicYear=abcd-efgh&dayOfWeek=2',
      'academicYear=2026-2027&dayOfWeek=8', 'academicYear=2026-2027&dayOfWeek=2&minuteOfDay=1440',
      'academicYear=2026-2027&minuteOfDay=510', 'academicYear=2026-2027&worksToday=false',
    ]) assert.equal((await list(query)).response.status, 400, query);
    assert.equal((await list(`academicYear=${academicYear}&dayOfWeek=2&minuteOfDay=510&worksNow=true`)).response.status, 200);
  });

  await t.test('cursor pages are bounded, stable, correctly sorted and filter/scope checked', async () => {
    const first = await list(`districtId=${districtA.id}&limit=100`);
    assert.equal(first.body.page.limit, 100);
    assert.equal(first.body.data.length, 100);
    assert.ok(first.body.page.nextCursor);
    const second = await list(`districtId=${districtA.id}&limit=100&cursor=${first.body.page.nextCursor}`);
    const third = await list(`districtId=${districtA.id}&limit=100&cursor=${second.body.page.nextCursor}`);
    const all = [...first.body.data, ...second.body.data, ...third.body.data];
    assert.equal(all.length, first.body.page.total);
    assert.equal(new Set(all.map((teacher) => teacher.id)).size, all.length);
    assert.deepEqual(all.map((teacher) => teacher.id), (await db.teacher.findMany({
      where: { districtId: districtA.id, recordStatus: 'ACTIVE' },
      orderBy: [{ surname: 'asc' }, { name: 'asc' }, { id: 'asc' }], select: { id: true },
    })).map(({ id }) => id));
    assert.equal((await list('')).body.data.length, 25);
    assert.equal((await list(`limit=101`)).response.status, 400);
    assert.equal((await list(`districtId=${districtA.id}&cursor=${globalThis.task044DistrictBTeacher.id}`)).response.status, 404);
    assert.equal((await list(`districtId=${districtA.id}&q=does-not-match&cursor=${first.body.data[0].id}`)).response.status, 404);
    assert.equal((await list(`districtId=${districtA.id}&cursor=not-a-uuid`)).response.status, 400);
    const lastCursor = third.body.page.nextCursor;
    assert.equal(lastCursor, null);
    const afterLast = await list(`districtId=${districtA.id}&limit=100&cursor=${all.at(-1).id}`);
    assert.deepEqual(afterLast.body.data, []);
    assert.equal(afterLast.body.page.total, first.body.page.total);
  });

  await t.test('strict query validation, privacy, no AuditLog, and bounded query count for 180+ rows', async () => {
    for (const query of ['unknown=1', 'municipality=الجزائر', 'sort=name', 'limit=1&limit=2', 'limit=0', 'limit=abc', `districtId=${districtA.id}&districtId=${districtB.id}`]) {
      assert.equal((await list(query)).response.status, 400, query);
    }
    const beforeAudit = await db.auditLog.count();
    routeQueries = 0;
    const bulk = await list(`districtId=${districtA.id}&q=Demo&limit=100`);
    assert.equal(bulk.response.status, 200);
    assert.equal(bulk.body.page.total, 205);
    assert.equal(bulk.body.data.length, 100);
    assert.ok(routeQueries <= 6, `Expected bounded DB query count, got ${routeQueries}.`);
    assert.equal(await db.auditLog.count(), beforeAudit);
    assert.equal(bulk.body.data.some((item) => 'phone' in item || 'email' in item || 'weeklySchedules' in item), false);
    const schedules = await list(`districtId=${districtA.id}&academicYear=${academicYear}&dayOfWeek=2&limit=100`);
    assert.ok(schedules.body.page.total >= 180);
    const plan = await db.$queryRaw`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT t."id" FROM "Teacher" t
      LEFT JOIN "Institution" i ON i."id" = t."institutionId" AND i."districtId" = t."districtId"
      WHERE t."districtId" = ${districtA.id}::uuid AND t."recordStatus" = 'ACTIVE'
        AND (t."name" ILIKE '%Demo%' OR t."surname" ILIKE '%Demo%' OR t."phone" ILIKE '%Demo%'
          OR t."email" ILIKE '%Demo%' OR i."name" ILIKE '%Demo%')
        AND EXISTS (SELECT 1 FROM "WeeklySchedule" s JOIN "WeeklyScheduleSlot" slot ON slot."scheduleId" = s."id"
          WHERE s."teacherId" = t."id" AND s."academicYear" = ${academicYear} AND slot."dayOfWeek" = 2)
      ORDER BY t."surname" ASC, t."name" ASC, t."id" ASC LIMIT 101`;
    assert.ok(Array.isArray(plan) && plan.length === 1);
    assert.ok(JSON.stringify(plan[0]).includes('Execution Time'));
    const planRoot = plan[0]['QUERY PLAN'][0];
    log(`TASK-044 205-teacher plan: ${planRoot.Plan['Node Type']}; rows=${planRoot.Plan['Actual Rows']}; execution=${planRoot['Execution Time']}ms.`);
  });
});
