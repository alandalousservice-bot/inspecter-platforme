import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { after, before, test } from 'node:test';
import process from 'node:process';
import { createApp } from '../dist/app.js';
import { registerAuthRoutes, requireAuthenticatedInspector } from '../dist/identity/auth-routes.js';
import { registerTeacherInformationCardRoutes } from '../dist/teachers/information-card-routes.js';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const password = 'task084-integration-synthetic-password';
const fixedNow = new Date('2026-10-01T23:30:00.000Z');
const today = '2026-10-02';
const date = (value) => new Date(`${value}T00:00:00.000Z`);
let admin, db, server, baseUrl, inspector, cookies, teacher, otherTeacher, mainHome, tempSchema;

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('Isolated test target is required; refusing database access.');
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55432'
    || decodeURIComponent(url.username) !== 'task020_test_user' || url.pathname !== '/task020_test') throw new Error('Unapproved isolated database target.');
  return raw;
}
function runPrisma(args, url) {
  const prismaPackagePath = require.resolve('prisma/package.json');
  const prismaPackage = JSON.parse(require('node:fs').readFileSync(prismaPackagePath, 'utf8'));
  const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
  const result = require('node:child_process').spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', schemaPath], {
    cwd: rootDir, encoding: 'utf8', timeout: 120000, windowsHide: true, env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) throw new Error(`Isolated Prisma ${args[0]} failed.`);
}
const cookiesFrom = (response) => response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? ''];
const csrf = (parts) => decodeURIComponent(parts.find((item) => item.startsWith('inspector_csrf=')).split(';', 1)[0].slice('inspector_csrf='.length));
const cookieHeader = (parts) => parts.map((item) => item.split(';', 1)[0]).join('; ');
async function request(path, session = cookies) {
  return fetch(`${baseUrl}${path}`, { headers: session ? { cookie: cookieHeader(session) } : {} });
}
async function loginAs(account) {
  const preflight = cookiesFrom(await fetch(`${baseUrl}/api/v1/auth/me`));
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST',
    headers: { cookie: cookieHeader(preflight), 'x-csrf-token': csrf(preflight), 'content-type': 'application/json' },
    body: JSON.stringify({ email: account.email, password }) });
  assert.equal(response.status, 200);
  return cookiesFrom(response);
}

before(async () => {
  const base = approvedUrl();
  const { PrismaClient } = await import('@prisma/client');
  const { hashPassword } = await import('../dist/identity/password.js');
  admin = new PrismaClient({ datasources: { db: { url: base } } }); await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port`;
  assert.deepEqual(identity[0], { db: 'task020_test', role: 'task020_test_user', address: '127.0.0.1/32', port: 55432 });
  tempSchema = `task084_${process.pid}_${randomBytes(5).toString('hex')}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${tempSchema}"`);
  const scoped = new URL(base); scoped.searchParams.set('schema', tempSchema);
  runPrisma(['migrate', 'deploy'], scoped.toString());
  db = new PrismaClient({ datasources: { db: { url: scoped.toString() } } }); await db.$connect();

  const district = await db.district.create({ data: { name: 'مقاطعة الاختبار' } });
  const otherDistrict = await db.district.create({ data: { name: 'مقاطعة أخرى' } });
  inspector = await db.inspector.create({ data: { email: 'task084@example.invalid', passwordHash: await hashPassword(password), status: 'ACTIVE', name: 'مفتش', surname: 'تجريبي' } });
  await db.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: date('2026-01-01') } });
  const home = await db.institution.create({ data: { districtId: district.id, name: 'المؤسسة الأم', email: 'school@example.invalid', municipality: 'البلدية' } });
  mainHome = home;
  await db.institution.update({ where: { id: home.id }, data: { archivedAt: fixedNow } });
  const current = await db.institution.create({ data: { districtId: district.id, name: 'مؤسسة تكملة حالية' } });
  const endingToday = await db.institution.create({ data: { districtId: district.id, name: 'تنتهي اليوم' } });
  const future = await db.institution.create({ data: { districtId: district.id, name: 'مؤسسة مستقبلية' } });
  const inconsistent = await db.institution.create({ data: { districtId: district.id, name: 'موقع يحتاج مراجعة' } });
  teacher = await db.teacher.create({ data: {
    districtId: district.id, institutionId: home.id, name: 'أمينة', surname: 'تجريبية', birthDate: date('1985-03-04'),
    placeOfBirth: 'وهران', birthProvince: 'ولاية وهران', phone: '+213555123456', email: 'private@example.invalid',
    professionalStatus: 'SUBSTITUTE', professionalFramework: 'إطار تجريبي', employedAt: date('2005-09-01'), confirmedAt: date('2010-09-01'),
    firstEducationAppointmentDate: date('2005-09-01'), firstEducationAppointmentDecisionNumber: 'قرار 1', firstInstallationDate: date('2005-09-10'),
    traineeshipDate: date('2006-01-01'), institutionAppointmentDate: date('2020-01-01'), institutionAppointmentNumber: 'تعيين 2',
    financialControllerVisaNumber: 'تأشيرة 3', administrativeCategory: '12', administrativeSection: 'قسم', administrativeGrade: 'رتبة',
    administrativeClassificationEffectiveDate: date('2024-01-01'), personalAddress: 'عنوان خاص', administrativeNote: 'ملاحظة خاصة', qualifications: 'نص قديم غير مفصل',
  } });
  otherTeacher = await db.teacher.create({ data: { districtId: otherDistrict.id, name: 'خارج النطاق', surname: 'سري' } });
  await db.teacherSupplementaryWorkplace.create({ data: { teacherId: teacher.id, districtId: district.id, institutionId: current.id, validFrom: date(today) } });
  await db.teacherSupplementaryWorkplace.create({ data: { teacherId: teacher.id, districtId: district.id, institutionId: endingToday.id, validFrom: date('2026-01-01'), validTo: date(today) } });
  await db.teacherSupplementaryWorkplace.create({ data: { teacherId: teacher.id, districtId: district.id, institutionId: future.id, validFrom: date('2026-10-03') } });
  await db.teacherQualification.createMany({ data: [
    { teacherId: teacher.id, name: 'مؤهل أقدم', qualificationDate: date('2020-01-01') },
    { teacherId: teacher.id, name: 'مؤهل أحدث', qualificationDate: date('2025-01-01'), issuingBody: 'جهة' },
  ] });
  const schedule = await db.weeklySchedule.create({ data: { teacherId: teacher.id, academicYear: '2026-2027', slots: { create: [
    { institutionId: home.id, teacherId: teacher.id, districtId: district.id, validFrom: date('2026-10-01'), dayOfWeek: 1, startMinute: 480, endMinute: 540, workplaceBasis: 'HOME' },
    { institutionId: current.id, teacherId: teacher.id, districtId: district.id, validFrom: date(today), dayOfWeek: 2, startMinute: 540, endMinute: 600, workplaceBasis: 'SUPPLEMENTARY' },
    { institutionId: inconsistent.id, teacherId: teacher.id, districtId: district.id, validFrom: date(today), dayOfWeek: 3, startMinute: 600, endMinute: 660, workplaceBasis: 'SUPPLEMENTARY' },
    { dayOfWeek: 4, startMinute: 660, endMinute: 720 },
    { institutionId: current.id, teacherId: teacher.id, districtId: district.id, validFrom: date('2026-10-03'), dayOfWeek: 5, startMinute: 720, endMinute: 780, workplaceBasis: 'SUPPLEMENTARY' },
    { institutionId: current.id, teacherId: teacher.id, districtId: district.id, validFrom: date('2026-09-01'), validTo: date(today), dayOfWeek: 6, startMinute: 780, endMinute: 840, workplaceBasis: 'SUPPLEMENTARY' },
  ] } } });
  assert.ok(schedule.id);
  const olderPromotion = await db.pedagogicalVisit.create({ data: {
    districtId: district.id, inspectorId: inspector.id, teacherId: teacher.id, institutionId: home.id,
    institutionNameSnapshot: home.name, academicYear: '2025-2026', visitType: 'PROMOTION_EVALUATION',
    scheduledStartAt: new Date('2026-03-01T08:00:00Z'), scheduledEndAt: new Date('2026-03-01T09:00:00Z'),
    occurredAt: new Date('2026-03-01T09:00:00Z'), status: 'COMPLETED',
  } });
  await db.inspectionReport.create({ data: {
    visitId: olderPromotion.id, reportType: 'INSPECTOR_VISIT', templateSource: 'PRODUCT_OWNER_ADOPTED', templateVersion: 1,
    status: 'FINAL', levelClass: 'الأولى', lessonTopic: 'موضوع', inspectorConclusion: 'خلاصة', finalizedAt: new Date('2026-03-02T10:00:00Z'),
    finalizedByInspectorId: inspector.id, finalizedInspectorNameSnapshot: 'مفتش', finalizedInspectorSurnameSnapshot: 'تجريبي',
    finalizedTeacherNameSnapshot: teacher.name, finalizedTeacherSurnameSnapshot: teacher.surname, pedagogicalMark: '15.50',
  } });
  await db.pedagogicalVisit.create({ data: {
    districtId: district.id, inspectorId: inspector.id, teacherId: teacher.id, institutionId: home.id,
    institutionNameSnapshot: home.name, academicYear: '2026-2027', visitType: 'MONITORING_FOLLOW_UP',
    scheduledStartAt: new Date('2026-10-01T22:00:00Z'), scheduledEndAt: new Date('2026-10-01T23:00:00Z'),
    occurredAt: new Date('2026-10-01T23:15:00Z'), status: 'COMPLETED',
  } });
  const app = createApp((instance) => {
    registerAuthRoutes(instance, db);
    registerTeacherInformationCardRoutes(instance, db, requireAuthenticatedInspector(db), () => fixedNow);
  });
  server = app.listen(0, '127.0.0.1'); await new Promise((resolveListen, reject) => { server.once('listening', resolveListen); server.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  cookies = await loginAs(inspector);
});

after(async () => {
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  await db?.$disconnect();
  if (admin && tempSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${tempSchema}" CASCADE`);
  await admin?.$disconnect();
});

test('TASK-084 authorization, strict academicYear, no-store and safe 404', async () => {
  const path = `/api/v1/teachers/${teacher.id}/information-card`;
  assert.equal((await request(`${path}?academicYear=2026-2027`, null)).status, 401);
  for (const suffix of ['', '?academicYear=2026-2028', '?academicYear=x', '?academicYear=2026-2027&x=1', '?academicYear=2026-2027&academicYear=2026-2027']) {
    assert.equal((await request(`${path}${suffix}`)).status, 400);
  }
  assert.equal((await request(`/api/v1/teachers/not-a-uuid/information-card?academicYear=2026-2027`)).status, 400);
  const outside = await request(`/api/v1/teachers/${otherTeacher.id}/information-card?academicYear=2026-2027`);
  const missing = await request(`/api/v1/teachers/${randomUUID()}/information-card?academicYear=2026-2027`);
  assert.equal(outside.status, 404); assert.equal(missing.status, 404);
  const [outsideBody, missingBody] = await Promise.all([outside.json(), missing.json()]);
  assert.deepEqual(outsideBody.error, { ...missingBody.error, requestId: outsideBody.error.requestId });
  assert.notEqual(outsideBody.error.requestId, missingBody.error.requestId);
  await db.inspector.update({ where: { id: inspector.id }, data: { status: 'INACTIVE' } });
  assert.equal((await request(`${path}?academicYear=2026-2027`)).status, 401);
  await db.inspector.update({ where: { id: inspector.id }, data: { status: 'ACTIVE' } });
  const response = await request(`${path}?academicYear=2026-2027`);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(response.headers.get('x-request-id'));
});

test('TASK-084 maps authoritative sources, temporal boundaries, and independent inspection/mark derivations', async () => {
  const response = await request(`/api/v1/teachers/${teacher.id}/information-card?academicYear=2026-2027`);
  const { data: { card } } = await response.json();
  assert.equal(card.asOfDate, today); assert.equal(card.academicYear, '2026-2027');
  assert.equal(card.teacher.professionalStatus, 'SUBSTITUTE'); assert.equal(card.teacher.birthProvince, 'ولاية وهران');
  assert.equal(card.teacher.administrativeNote, 'ملاحظة خاصة'); assert.equal(card.teacher.firstEducationAppointmentDate, '2005-09-01');
  assert.equal(Object.hasOwn(card.teacher, 'districtId'), false);
  assert.equal(card.homeInstitution.id, mainHome.id); assert.equal(card.homeInstitution.email, 'school@example.invalid');
  assert.ok(card.homeInstitution.archivedAt); assert.equal(card.homeInstitution.appointment.institutionAppointmentNumber, 'تعيين 2');
  assert.equal(card.currentSupplementaryWorkplaces.length, 1); assert.equal(card.currentSupplementaryWorkplaces[0].institution.name, 'مؤسسة تكملة حالية');
  assert.deepEqual(card.qualifications.items.map((item) => item.name), ['مؤهل أحدث', 'مؤهل أقدم']);
  assert.equal(card.qualifications.legacyText, 'نص قديم غير مفصل');
  assert.equal(card.inspectionSummary.lastInspectionDate, '2026-10-02');
  assert.equal(card.inspectionSummary.pedagogicalMark, '15.5');
  assert.equal(card.organizationalContext.district.name, 'مقاطعة الاختبار');
  assert.equal(card.organizationalContext.inspector.name, 'مفتش');
  assert.equal(card.weeklySchedule.currentSlots.length, 3);
  assert.deepEqual(card.weeklySchedule.currentSlots.map((slot) => slot.dayOfWeek), [1, 2, 3]);
  assert.equal(card.weeklySchedule.currentSlots[0].consistency.status, 'NEEDS_CORRECTION');
  assert.equal(card.weeklySchedule.currentSlots[0].consistency.reasonCode, 'INSTITUTION_ARCHIVED');
  assert.equal(card.weeklySchedule.currentSlots[2].consistency.status, 'NEEDS_CORRECTION');
  assert.equal(card.weeklySchedule.legacyUnknownSlots.length, 1);
  assert.equal(card.weeklySchedule.legacyUnknownSlots[0].consistency.status, 'LEGACY_UNKNOWN');
  assert.deepEqual(Object.keys(card.inspectionSummary).sort(), ['lastInspectionDate', 'pedagogicalMark']);
  assert.equal(JSON.stringify(card).includes('ملاحظة خاصة'), true);
  assert.equal(JSON.stringify(card).includes('15.50'), false);
  assert.equal(JSON.stringify(card).includes('reportId'), false);
});

test('TASK-084 returns explicit null/empty states and does not read another academic year', async () => {
  const blank = await db.teacher.create({ data: { districtId: teacher.districtId, name: 'فارغ', surname: 'البيانات' } });
  const response = await request(`/api/v1/teachers/${blank.id}/information-card?academicYear=2026-2027`);
  const { data: { card } } = await response.json();
  assert.equal(card.homeInstitution, null); assert.deepEqual(card.currentSupplementaryWorkplaces, []);
  assert.deepEqual(card.qualifications, { items: [], legacyText: null });
  assert.equal(card.weeklySchedule, null);
  assert.deepEqual(card.inspectionSummary, { lastInspectionDate: null, pedagogicalMark: null });
  await db.weeklySchedule.create({ data: { teacherId: blank.id, academicYear: '2025-2026' } });
  assert.equal((await (await request(`/api/v1/teachers/${blank.id}/information-card?academicYear=2026-2027`)).json()).data.card.weeklySchedule, null);
});
