import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createApp } from '../dist/app.js';
import { registerAuthRoutes, requireAuthenticatedInspector } from '../dist/identity/auth-routes.js';
import { registerInspectorSubmissionRoutes } from '../dist/intake/inspector-routes.js';
import { registerSubmissionDecisionRoute } from '../dist/intake/decision-routes.js';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const password = 'task034-synthetic-password';
let admin;
let db;
let server;
let baseUrl;
let schemaName;
let schemaCreated = false;
let inspector;
let otherInspector;
let inactiveInspector;
let district;
let otherDistrict;
let expiredDistrict;
let futureDistrict;
let cookies;
let otherCookies;
let inactiveCookies;

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL is required; refusing database access.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid test target.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
      || url.port !== '55432' || url.username !== 'task020_test_user'
      || url.pathname !== '/task020_test' || url.searchParams.get('schema') !== 'public') {
    throw new Error('Not the approved isolated database target.');
  }
  return raw;
}

function runPrisma(args, url) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', schemaPath], {
    cwd: rootDir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) throw new Error('Clean isolated Prisma migration check failed.');
}

function cookieParts(response) {
  return (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).filter(Boolean);
}

function csrf(cookiesIn) {
  const entry = cookiesIn.find((cookie) => cookie.startsWith('inspector_csrf='));
  assert.ok(entry);
  return decodeURIComponent(entry.split(';', 1)[0].slice('inspector_csrf='.length));
}

function cookieHeader(cookiesIn) {
  return cookiesIn.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

async function login(target) {
  const initial = await fetch(`${baseUrl}/api/v1/auth/me`);
  const initialCookies = cookieParts(initial);
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST', headers: {
      cookie: cookieHeader(initialCookies), 'x-csrf-token': csrf(initialCookies), 'content-type': 'application/json',
    }, body: JSON.stringify({ email: target.email, password }),
  });
  assert.equal(response.status, 200);
  return cookieParts(response);
}

function profile(changes = {}) {
  return {
    firstName: 'أمينة', lastName: 'بن صالح', dateOfBirth: '1985-03-04', placeOfBirth: 'وهران',
    phone: '+213555123456', email: 'Amina@example.dz', professionalStatus: 'PERMANENT',
    employmentDate: '2005-09-01', confirmationDate: '2007-09-01', qualifications: 'شهادة تجريبية',
    notes: 'ملاحظة المرسل', workplace: { institutionName: 'ابتدائية النور', municipality: 'وهران', institutionAddress: 'شارع النخيل', directorPhone: '+21321234567' },
    ...changes,
  };
}

async function submission(districtId = district.id, submittedProfile = profile(), status = 'PENDING') {
  return db.teacherSubmission.create({ data: { districtId, submittedProfile, status } });
}

async function decision(id, action, expectedStatus = 'PENDING', options = {}) {
  const selectedCookies = options.cookies === undefined ? cookies : options.cookies;
  const headers = { 'content-type': 'application/json' };
  if (selectedCookies) headers.cookie = cookieHeader(selectedCookies);
  if (selectedCookies && !options.noCsrf) headers['x-csrf-token'] = csrf(selectedCookies);
  return fetch(`${baseUrl}/api/v1/submissions/${id}/decision`, {
    method: 'POST', headers, body: JSON.stringify(options.body ?? { action, expectedStatus }),
  });
}

before(async () => {
  const databaseUrl = approvedUrl();
  runPrisma(['generate'], databaseUrl);
  const { PrismaClient } = await import('@prisma/client');
  const { hashPassword } = await import('../dist/identity/password.js');
  admin = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  assert.equal(identity[0]?.db, 'task020_test');
  assert.equal(identity[0]?.role, 'task020_test_user');
  const existing = await admin.$queryRaw`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename !~ '^pg_'`;
  const migrationTable = await admin.$queryRaw`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
  assert.equal(existing.length, 0);
  assert.equal(migrationTable[0]?.present, false);

  schemaName = `task034_${process.pid}_${randomBytes(6).toString('hex')}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  schemaCreated = true;
  const scoped = new URL(databaseUrl);
  scoped.searchParams.set('schema', schemaName);
  runPrisma(['migrate', 'deploy'], scoped.toString());
  runPrisma(['migrate', 'status'], scoped.toString());
  db = new PrismaClient({ datasources: { db: { url: scoped.toString() } } });
  await db.$connect();

  const passwordHash = await hashPassword(password);
  inspector = await db.inspector.create({ data: { email: `task034-${randomUUID()}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  otherInspector = await db.inspector.create({ data: { email: `task034-${randomUUID()}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  inactiveInspector = await db.inspector.create({ data: { email: `task034-${randomUUID()}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  district = await db.district.create({ data: { name: 'TASK-034 synthetic district' } });
  otherDistrict = await db.district.create({ data: { name: 'TASK-034 other district' } });
  expiredDistrict = await db.district.create({ data: { name: 'TASK-034 expired district' } });
  futureDistrict = await db.district.create({ data: { name: 'TASK-034 future district' } });
  const now = Date.now();
  await db.inspectorDistrictMembership.createMany({ data: [
    { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(now - 60_000) },
    { inspectorId: otherInspector.id, districtId: otherDistrict.id, role: 'INSPECTOR', validFrom: new Date(now - 60_000) },
    { inspectorId: inactiveInspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(now - 60_000) },
    { inspectorId: inspector.id, districtId: expiredDistrict.id, role: 'INSPECTOR', validFrom: new Date(now - 120_000), validTo: new Date(now - 60_000) },
    { inspectorId: inspector.id, districtId: futureDistrict.id, role: 'INSPECTOR', validFrom: new Date(now + 86_400_000) },
  ] });
  const app = createApp((instance) => {
    registerAuthRoutes(instance, db);
    const requireInspector = requireAuthenticatedInspector(db);
    registerInspectorSubmissionRoutes(instance, db, requireInspector);
    registerSubmissionDecisionRoute(instance, db, requireInspector);
  });
  const listener = app.listen(0, '127.0.0.1');
  await new Promise((yes, no) => { listener.once('listening', yes); listener.once('error', no); });
  server = listener;
  baseUrl = `http://127.0.0.1:${listener.address().port}`;
  cookies = await login(inspector);
  otherCookies = await login(otherInspector);
  inactiveCookies = await login(inactiveInspector);
  await db.inspector.update({ where: { id: inactiveInspector.id }, data: { status: 'INACTIVE' } });
});

after(async () => {
  if (server) await new Promise((yes) => server.close(yes));
  await db?.$disconnect();
  if (admin && schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin?.$disconnect();
});

test('clean chain creates Teacher columns, indexes, and restricted FKs', async () => {
  const columns = await db.$queryRaw`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema=${schemaName} AND table_name='Teacher'`;
  assert.deepEqual(columns.map((row) => row.column_name).sort(), [
    'id', 'districtId', 'institutionId', 'name', 'surname', 'birthDate', 'placeOfBirth', 'phone', 'email', 'professionalStatus',
    'employedAt', 'confirmedAt', 'qualifications', 'professionalFramework', 'firstEducationAppointmentDate',
    'firstEducationAppointmentDecisionNumber', 'firstInstallationDate', 'traineeshipDate', 'institutionAppointmentDate',
    'institutionAppointmentNumber', 'financialControllerVisaNumber', 'administrativeCategory', 'administrativeSection',
    'administrativeGrade', 'administrativeClassificationEffectiveDate', 'birthProvince', 'personalAddress', 'administrativeNote',
    'recordStatus', 'archivedAt', 'createdAt', 'updatedAt',
  ].sort());
  for (const field of ['id', 'districtId', 'name', 'surname', 'recordStatus', 'createdAt', 'updatedAt']) {
    assert.equal(columns.find((row) => row.column_name === field)?.is_nullable, 'NO');
  }
  for (const field of ['birthDate', 'employedAt', 'confirmedAt']) {
    assert.equal(columns.find((row) => row.column_name === field)?.data_type, 'date');
  }
  const constraints = await db.$queryRaw`SELECT conname, confdeltype, confupdtype FROM pg_constraint WHERE connamespace=${schemaName}::regnamespace`;
  for (const name of ['Teacher_districtId_fkey', 'TeacherSubmission_acceptedTeacherId_fkey']) {
    const fk = constraints.find((row) => row.conname === name);
    assert.equal(fk?.confdeltype, 'r');
    assert.equal(fk?.confupdtype, 'c');
  }
  const indexes = await db.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname=${schemaName}`;
  assert.ok(indexes.some((row) => row.indexname === 'Teacher_districtId_surname_name_recordStatus_idx'));
  assert.ok(indexes.some((row) => row.indexname === 'TeacherSubmission_acceptedTeacherId_key'));
  await assert.rejects(db.teacher.create({ data: {
    districtId: district.id, name: 'synthetic', surname: 'synthetic', recordStatus: 'UNKNOWN',
  } }));
  await assert.rejects(db.teacher.create({ data: {
    districtId: district.id, name: 'synthetic', surname: 'synthetic', recordStatus: 'ACTIVE', professionalStatus: 'UNKNOWN',
  } }));
});

test('ACCEPT maps the exact current profile and creates one linked Teacher and one minimal audit', async () => {
  const target = await submission();
  const institutionCount = await db.institution.count();
  const response = await decision(target.id, 'ACCEPT');
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('x-request-id'));
  assert.deepEqual(await response.json(), { data: { id: target.id, status: 'ACCEPTED' } });
  const persisted = await db.teacherSubmission.findUniqueOrThrow({ where: { id: target.id } });
  const teacher = await db.teacher.findUniqueOrThrow({ where: { id: persisted.acceptedTeacherId } });
  assert.equal(teacher.districtId, target.districtId);
  assert.equal(teacher.name, 'أمينة');
  assert.equal(teacher.surname, 'بن صالح');
  assert.equal(teacher.birthDate.toISOString().slice(0, 10), '1985-03-04');
  assert.equal(teacher.placeOfBirth, 'وهران');
  assert.equal(teacher.phone, '+213555123456');
  assert.equal(teacher.email, 'Amina@example.dz');
  assert.equal(teacher.professionalStatus, 'PERMANENT');
  assert.equal(teacher.employedAt.toISOString().slice(0, 10), '2005-09-01');
  assert.equal(teacher.confirmedAt.toISOString().slice(0, 10), '2007-09-01');
  assert.equal(teacher.qualifications, 'شهادة تجريبية');
  assert.equal(teacher.recordStatus, 'ACTIVE');
  assert.equal(teacher.archivedAt, null);
  assert.equal(teacher.institutionId, null);
  assert.ok(teacher.createdAt && teacher.updatedAt && persisted.decidedAt);
  assert.equal(persisted.decidedByInspectorId, inspector.id);
  assert.deepEqual(persisted.submittedProfile.workplace, { institutionName: 'ابتدائية النور', municipality: 'وهران', institutionAddress: 'شارع النخيل', directorPhone: '+21321234567' });
  assert.equal(await db.institution.count(), institutionCount);
  assert.equal(await db.teacher.count({ where: { id: teacher.id } }), 1);
  const audit = await db.auditLog.findMany({ where: { entityId: target.id } });
  assert.equal(audit.length, 1);
  assert.deepEqual(audit[0].metadata, { resultingTeacherId: teacher.id });
  assert.equal(audit[0].action, 'TEACHER_SUBMISSION_ACCEPTED');
  assert.equal(audit[0].actorInspectorId, inspector.id);
  assert.equal(audit[0].districtId, target.districtId);
  assert.equal(audit[0].requestId, response.headers.get('x-request-id'));
  assert.equal(JSON.stringify(teacher).includes('ملاحظة المرسل'), false);
  assert.equal(JSON.stringify(teacher).includes('ابتدائية النور'), false);
  const repeat = await decision(target.id, 'ACCEPT');
  assert.equal(repeat.status, 409);
  assert.equal(await db.teacher.count({ where: { id: teacher.id } }), 1);
  assert.equal(await db.auditLog.count({ where: { entityId: target.id } }), 1);
});

test('optional fields become NULL and distinct submissions may share advisory PII', async () => {
  const submittedProfile = profile();
  delete submittedProfile.confirmationDate;
  delete submittedProfile.qualifications;
  const targets = await Promise.all([submission(district.id, submittedProfile), submission(district.id, submittedProfile)]);
  for (const target of targets) assert.equal((await decision(target.id, 'ACCEPT')).status, 200);
  const teachers = await db.teacher.findMany({ where: { id: { in: (await db.teacherSubmission.findMany({ where: { id: { in: targets.map((row) => row.id) } } })).map((row) => row.acceptedTeacherId) } } });
  assert.equal(teachers.length, 2);
  assert.ok(teachers.every((teacher) => teacher.confirmedAt === null && teacher.qualifications === null));
  assert.ok(teachers.every((teacher) => teacher.phone === '+213555123456'));
});

test('database enforces accepted Teacher FK, unique source link and restricted deletion', async () => {
  await assert.rejects(submission().then((row) =>
    db.teacherSubmission.update({ where: { id: row.id }, data: { acceptedTeacherId: randomUUID() } })));
  const linked = await db.teacherSubmission.findFirstOrThrow({ where: { acceptedTeacherId: { not: null } } });
  const another = await submission();
  await assert.rejects(db.teacherSubmission.update({ where: { id: another.id }, data: { acceptedTeacherId: linked.acceptedTeacherId } }));
  await assert.rejects(db.teacher.delete({ where: { id: linked.acceptedTeacherId } }));
  await assert.rejects(db.teacher.create({ data: {
    districtId: randomUUID(), name: 'synthetic', surname: 'synthetic', recordStatus: 'ACTIVE',
  } }));
});

test('REJECT and INTERNAL_REVIEW transitions audit without Teacher; review can then accept or reject', async () => {
  const teacherCountBefore = await db.teacher.count();
  const institutionCountBefore = await db.institution.count();
  const rejected = await submission();
  assert.equal((await decision(rejected.id, 'REJECT')).status, 200);
  const rejectedRow = await db.teacherSubmission.findUniqueOrThrow({ where: { id: rejected.id } });
  assert.equal(rejectedRow.status, 'REJECTED');
  assert.equal(rejectedRow.acceptedTeacherId, null);
  assert.equal(await db.teacher.count(), teacherCountBefore);
  assert.equal(await db.institution.count(), institutionCountBefore);
  assert.ok(rejectedRow.decidedAt);
  assert.equal(rejectedRow.decidedByInspectorId, inspector.id);
  assert.equal((await decision(rejected.id, 'ACCEPT')).status, 409);
  const review = await submission();
  assert.equal((await decision(review.id, 'INTERNAL_REVIEW')).status, 200);
  const reviewRow = await db.teacherSubmission.findUniqueOrThrow({ where: { id: review.id } });
  assert.equal(reviewRow.status, 'INTERNAL_REVIEW');
  assert.ok(reviewRow.decidedAt);
  assert.equal(reviewRow.decidedByInspectorId, inspector.id);
  assert.equal(reviewRow.acceptedTeacherId, null);
  assert.equal(await db.teacher.count(), teacherCountBefore);
  assert.equal(await db.institution.count(), institutionCountBefore);
  assert.equal((await decision(review.id, 'INTERNAL_REVIEW', 'INTERNAL_REVIEW')).status, 409);
  assert.equal((await decision(review.id, 'ACCEPT', 'INTERNAL_REVIEW')).status, 200);
  assert.equal((await db.teacherSubmission.findUniqueOrThrow({ where: { id: review.id } })).status, 'ACCEPTED');
  assert.equal(await db.teacher.count(), teacherCountBefore + 1);
  assert.equal(await db.institution.count(), institutionCountBefore);
  const reviewReject = await submission();
  assert.equal((await decision(reviewReject.id, 'INTERNAL_REVIEW')).status, 200);
  assert.equal((await decision(reviewReject.id, 'REJECT', 'INTERNAL_REVIEW')).status, 200);
  assert.equal((await db.teacherSubmission.findUniqueOrThrow({ where: { id: reviewReject.id } })).status, 'REJECTED');
  for (const id of [rejected.id, review.id, reviewReject.id]) {
    const events = await db.auditLog.findMany({ where: { entityId: id }, orderBy: { occurredAt: 'asc' } });
    assert.equal(events.length, id === rejected.id ? 1 : 2);
    assert.deepEqual(events[0].metadata, {});
  }
});

test('strict validation, auth, CSRF and district scope fail safely without decisions', async () => {
  const target = await submission();
  assert.equal((await decision(target.id, 'ACCEPT', 'PENDING', { cookies: null })).status, 401);
  assert.equal((await decision(target.id, 'ACCEPT', 'PENDING', { cookies: inactiveCookies })).status, 401);
  assert.equal((await decision(target.id, 'ACCEPT', 'PENDING', { noCsrf: true })).status, 403);
  assert.equal((await decision(target.id, 'ACCEPT', 'PENDING', { cookies: otherCookies })).status, 404);
  assert.equal((await decision(target.id, 'ACCEPT', 'INTERNAL_REVIEW')).status, 409);
  for (const body of [
    { action: 'ACCEPT', expectedStatus: 'PENDING', districtId: district.id },
    { action: 'ACCEPT', expectedStatus: 'PENDING', note: 'private' },
    { action: 'ACCEPT', expectedStatus: 'PENDING', reason: 'private' },
    { action: 'ACCEPT', expectedStatus: 'PENDING', teacher: {} },
    { action: 'ACCEPT', expectedStatus: 'PENDING', metadata: {} },
    { action: 'ACCEPT' }, { action: null, expectedStatus: 'PENDING' },
  ]) {
    const response = await decision(target.id, 'ACCEPT', 'PENDING', { body });
    assert.equal(response.status, 400);
    assert.equal(JSON.stringify(await response.json()).includes('private'), false);
  }
  assert.equal((await decision('not-a-uuid', 'ACCEPT')).status, 400);
  for (const inaccessible of [otherDistrict, expiredDistrict, futureDistrict]) {
    const row = await submission(inaccessible.id);
    assert.equal((await decision(row.id, 'ACCEPT')).status, 404);
  }
  assert.equal((await db.teacherSubmission.findUniqueOrThrow({ where: { id: target.id } })).status, 'PENDING');
  assert.equal(await db.auditLog.count({ where: { entityId: target.id } }), 0);
});

test('two concurrent ACCEPT requests yield one Teacher and one audit event', async () => {
  const target = await submission();
  const results = await Promise.all([decision(target.id, 'ACCEPT'), decision(target.id, 'ACCEPT')]);
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
  const accepted = await db.teacherSubmission.findUniqueOrThrow({ where: { id: target.id } });
  assert.equal(accepted.status, 'ACCEPTED');
  assert.ok(accepted.acceptedTeacherId);
  assert.equal(await db.teacher.count({ where: { id: accepted.acceptedTeacherId } }), 1);
  assert.equal(await db.auditLog.count({ where: { entityId: target.id } }), 1);
});

test('competing ACCEPT and REJECT cannot both win', async () => {
  const target = await submission();
  const results = await Promise.all([decision(target.id, 'ACCEPT'), decision(target.id, 'REJECT')]);
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
  const row = await db.teacherSubmission.findUniqueOrThrow({ where: { id: target.id } });
  assert.equal(await db.auditLog.count({ where: { entityId: target.id } }), 1);
  assert.equal(row.status === 'ACCEPTED' ? await db.teacher.count({ where: { id: row.acceptedTeacherId } }) : 0,
    row.status === 'ACCEPTED' ? 1 : 0);
  assert.equal(row.status === 'REJECTED', row.acceptedTeacherId === null);
});

test('audit append failure rolls back ACCEPT, REJECT and INTERNAL_REVIEW', async () => {
  await db.$executeRawUnsafe(`CREATE FUNCTION "${schemaName}".reject_task034_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_task034_audit BEFORE INSERT ON "${schemaName}"."AuditLog" FOR EACH ROW EXECUTE FUNCTION "${schemaName}".reject_task034_audit()`);
  try {
    for (const action of ['ACCEPT', 'REJECT', 'INTERNAL_REVIEW']) {
      const target = await submission();
      const teacherCount = await db.teacher.count();
      const response = await decision(target.id, action);
      assert.equal(response.status, 500);
      assert.equal(JSON.stringify(await response.json()).includes('synthetic audit failure'), false);
      const row = await db.teacherSubmission.findUniqueOrThrow({ where: { id: target.id } });
      assert.equal(row.status, 'PENDING');
      assert.equal(row.acceptedTeacherId, null);
      assert.equal(row.decidedAt, null);
      assert.equal(row.decidedByInspectorId, null);
      assert.equal(await db.teacher.count(), teacherCount);
      assert.equal(await db.auditLog.count({ where: { entityId: target.id } }), 0);
    }
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER reject_task034_audit ON "${schemaName}"."AuditLog"`);
    await db.$executeRawUnsafe(`DROP FUNCTION "${schemaName}".reject_task034_audit()`);
  }
});
