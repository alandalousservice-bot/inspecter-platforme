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
import { registerInspectorSubmissionRoutes } from '../dist/intake/inspector-routes.js';
import { registerTeacherSubmissionRoutes } from '../dist/intake/routes.js';
import { registerSubmissionDecisionRoute } from '../dist/intake/decision-routes.js';
import { registerTeacherProfileRoutes } from '../dist/teachers/routes.js';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const password = 'task035-synthetic-password';
let admin, db, server, baseUrl, schemaName, inspector, inactiveInspector, district, otherDistrict, expiredDistrict, futureDistrict;
let cookies, inactiveCookies;

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('Isolated TEST_DATABASE_URL required.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid isolated target.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || url.port !== '55432' || url.username !== 'task020_test_user'
    || url.pathname !== '/task020_test' || url.searchParams.get('schema') !== 'public') {
    throw new Error('Unapproved database target.');
  }
  return raw;
}

function runPrisma(args, url) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', join(apiDir, 'prisma/schema.prisma')], {
    cwd: rootDir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) throw new Error('Isolated migration chain failed.');
}

function cookieParts(response) { return (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).filter(Boolean); }
function csrf(parts) { return decodeURIComponent(parts.find((part) => part.startsWith('inspector_csrf=')).split(';', 1)[0].slice('inspector_csrf='.length)); }
function cookieHeader(parts) { return parts.map((part) => part.split(';', 1)[0]).join('; '); }

async function login(target) {
  const initialCookies = cookieParts(await fetch(`${baseUrl}/api/v1/auth/me`));
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST', headers: { cookie: cookieHeader(initialCookies), 'x-csrf-token': csrf(initialCookies), 'content-type': 'application/json' },
    body: JSON.stringify({ email: target.email, password }),
  });
  assert.equal(response.status, 200);
  return cookieParts(response);
}

async function request(id, method = 'GET', body, options = {}) {
  const selectedCookies = options.cookies === undefined ? cookies : options.cookies;
  const headers = { 'content-type': 'application/json' };
  if (selectedCookies) headers.cookie = cookieHeader(selectedCookies);
  if (method === 'PATCH' && selectedCookies && !options.noCsrf) headers['x-csrf-token'] = options.invalidCsrf ? 'invalid' : csrf(selectedCookies);
  return fetch(`${baseUrl}/api/v1/teachers/${id}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function currentInstitutionRequest(id, body, options = {}) {
  const selectedCookies = options.cookies === undefined ? cookies : options.cookies;
  const headers = { 'content-type': 'application/json' };
  if (selectedCookies) headers.cookie = cookieHeader(selectedCookies);
  if (selectedCookies && !options.noCsrf) headers['x-csrf-token'] = options.invalidCsrf ? 'invalid' : csrf(selectedCookies);
  return fetch(`${baseUrl}/api/v1/teachers/${id}/current-institution`, {
    method: 'PUT', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function fixture(districtId = district.id) {
  const snapshot = {
    firstName: 'أمينة', lastName: 'بن صالح', dateOfBirth: '1985-03-04', placeOfBirth: 'وهران',
    phone: '+213555123456', email: 'Amina@example.dz', professionalStatus: 'PERMANENT',
    employmentDate: '2005-09-01', confirmationDate: '2007-09-01', qualifications: 'شهادة',
    notes: 'private intake note', primaryInstitutionName: 'ابتدائية النور', additionalInstitutionNames: ['ابتدائية الفجر'],
  };
  const teacher = await db.teacher.create({ data: {
    districtId, name: snapshot.firstName, surname: snapshot.lastName, birthDate: new Date('1985-03-04T00:00:00Z'),
    placeOfBirth: snapshot.placeOfBirth, phone: snapshot.phone, email: snapshot.email,
    professionalStatus: snapshot.professionalStatus, employedAt: new Date('2005-09-01T00:00:00Z'),
    confirmedAt: new Date('2007-09-01T00:00:00Z'), qualifications: snapshot.qualifications,
  } });
  const submission = await db.teacherSubmission.create({ data: {
    districtId, submittedProfile: snapshot, status: 'ACCEPTED', decidedAt: new Date(),
    decidedByInspectorId: inspector.id, acceptedTeacherId: teacher.id,
  } });
  return { teacher, submission, snapshot };
}

before(async () => {
  const databaseUrl = approvedUrl();
  const { PrismaClient } = await import('@prisma/client');
  const { hashPassword } = await import('../dist/identity/password.js');
  admin = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  assert.equal(identity[0]?.db, 'task020_test');
  assert.equal(identity[0]?.role, 'task020_test_user');
  schemaName = `task035_${process.pid}_${randomBytes(6).toString('hex')}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  const scoped = new URL(databaseUrl);
  scoped.searchParams.set('schema', schemaName);
  runPrisma(['migrate', 'deploy'], scoped.toString());
  db = new PrismaClient({ datasources: { db: { url: scoped.toString() } } });
  await db.$connect();
  const passwordHash = await hashPassword(password);
  inspector = await db.inspector.create({ data: { email: `task035-${randomUUID()}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  inactiveInspector = await db.inspector.create({ data: { email: `task035-${randomUUID()}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  district = await db.district.create({ data: { name: 'TASK-035 district' } });
  otherDistrict = await db.district.create({ data: { name: 'TASK-035 other' } });
  expiredDistrict = await db.district.create({ data: { name: 'TASK-035 expired' } });
  futureDistrict = await db.district.create({ data: { name: 'TASK-035 future' } });
  const now = Date.now();
  await db.inspectorDistrictMembership.createMany({ data: [
    { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(now - 120000) },
    { inspectorId: inactiveInspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(now - 120000) },
    { inspectorId: inspector.id, districtId: expiredDistrict.id, role: 'INSPECTOR', validFrom: new Date(now - 120000), validTo: new Date(now - 60000) },
    { inspectorId: inspector.id, districtId: futureDistrict.id, role: 'INSPECTOR', validFrom: new Date(now + 86400000) },
  ] });
  const app = createApp((instance) => {
    registerAuthRoutes(instance, db);
    const requireInspector = requireAuthenticatedInspector(db);
    registerInspectorSubmissionRoutes(instance, db, requireInspector);
    registerTeacherSubmissionRoutes(instance, db);
    registerSubmissionDecisionRoute(instance, db, requireInspector);
    registerTeacherProfileRoutes(instance, db, requireInspector);
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((yes, no) => { server.once('listening', yes); server.once('error', no); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  cookies = await login(inspector);
  inactiveCookies = await login(inactiveInspector);
  await db.inspector.update({ where: { id: inactiveInspector.id }, data: { status: 'INACTIVE' } });
});

after(async () => {
  if (server) await new Promise((yes) => server.close(yes));
  await db?.$disconnect();
  if (admin && schemaName) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin?.$disconnect();
});

test('GET returns scoped current profile and minimal accepted declarations without audit', async () => {
  const { teacher, submission } = await fixture();
  const response = await request(teacher.id);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { data } = await response.json();
  assert.deepEqual(Object.keys(data).sort(), [
    'id', 'districtId', 'name', 'surname', 'birthDate', 'placeOfBirth', 'phone', 'email', 'professionalStatus',
    'employedAt', 'confirmedAt', 'qualifications', 'professionalFramework', 'firstEducationAppointmentDate',
    'firstEducationAppointmentDecisionNumber', 'firstInstallationDate', 'traineeshipDate', 'institutionAppointmentDate',
    'institutionAppointmentNumber', 'financialControllerVisaNumber', 'administrativeCategory', 'administrativeSection',
    'administrativeGrade', 'administrativeClassificationEffectiveDate', 'birthProvince', 'personalAddress', 'administrativeNote',
    'recordStatus', 'archivedAt', 'createdAt', 'updatedAt', 'declaredInstitutions', 'declaredWorkplace', 'currentInstitution', 'trainingStatus', 'trainingVerifiedAt',
  ].sort());
  assert.equal(data.birthDate, '1985-03-04');
  assert.equal(data.recordStatus, 'ACTIVE');
  assert.equal(data.trainingStatus, null);
  assert.equal(data.trainingVerifiedAt, null);
  assert.deepEqual(data.declaredInstitutions, { primaryInstitutionName: 'ابتدائية النور', additionalInstitutionNames: ['ابتدائية الفجر'] });
  assert.deepEqual(data.declaredWorkplace, { institutionName: 'ابتدائية النور', municipality: null, institutionAddress: null, directorPhone: null, legacyAdditionalInstitutionNames: ['ابتدائية الفجر'] });
  assert.equal(data.currentInstitution, null);
  assert.equal(Object.hasOwn(data, 'institutionId'), false);
  assert.equal(JSON.stringify(data).includes('private intake note'), false);
  assert.equal(await db.auditLog.count({ where: { entityId: teacher.id } }), 0);
  const detail = await fetch(`${baseUrl}/api/v1/submissions/${submission.id}`, { headers: { cookie: cookieHeader(cookies) } });
  assert.equal((await detail.json()).data.acceptedTeacherId, teacher.id);
});

test('GET and PATCH reject unauthenticated, inactive, invalid and out-of-scope cases', async () => {
  const { teacher } = await fixture();
  const out = await fixture(otherDistrict.id);
  const expired = await fixture(expiredDistrict.id);
  const future = await fixture(futureDistrict.id);
  for (const method of ['GET', 'PATCH']) {
    const body = method === 'PATCH' ? { name: 'حديث' } : undefined;
    assert.equal((await request(teacher.id, method, body, { cookies: null })).status, 401);
    assert.equal((await request(teacher.id, method, body, { cookies: inactiveCookies })).status, 401);
    assert.equal((await request('invalid', method, body)).status, 400);
    const missing = await request(randomUUID(), method, body);
    const outside = await request(out.teacher.id, method, body);
    assert.equal(missing.status, 404);
    assert.equal(outside.status, 404);
    const outsideError = (await outside.json()).error;
    const missingError = (await missing.json()).error;
    assert.equal(outsideError.code, missingError.code);
    assert.equal(outsideError.message, missingError.message);
    assert.equal((await request(expired.teacher.id, method, body)).status, 404);
    assert.equal((await request(future.teacher.id, method, body)).status, 404);
  }
  assert.equal((await request(teacher.id, 'PATCH', { name: 'حديث' }, { noCsrf: true })).status, 403);
  assert.equal((await request(teacher.id, 'PATCH', { name: 'حديث' }, { invalidCsrf: true })).status, 403);
});

test('PATCH edits each field, clears nullable fields, audits changed names and keeps source snapshot', async () => {
  const { teacher, submission, snapshot } = await fixture();
  const updates = [
    ['name', 'سلمى'], ['surname', 'عماري'], ['birthDate', '1984-03-04'], ['placeOfBirth', 'الجزائر'],
    ['phone', '0555123457'], ['email', 'New@EXAMPLE.DZ'], ['professionalStatus', 'TRAINEE'],
    ['employedAt', '2006-09-01'], ['confirmedAt', '2008-09-01'], ['qualifications', 'شهادة ثانية'],
    ['professionalFramework', '  cafe\u0301   إطار '], ['firstEducationAppointmentDate', '2001-09-01'],
    ['firstEducationAppointmentDecisionNumber', ' قرار/١٢ '], ['firstInstallationDate', '2002-09-01'],
    ['traineeshipDate', '2003-09-01'], ['administrativeCategory', '  صنف   أ '],
    ['administrativeSection', 'شعبة'], ['administrativeGrade', 'درجة'],
    ['administrativeClassificationEffectiveDate', '2004-09-01'], ['birthProvince', 'الجزائر'],
    ['personalAddress', 'عنوان شخصي'], ['administrativeNote', 'سطر أول\r\nسطر  ثان'],
  ];
  for (const [field, value] of updates) {
    const response = await request(teacher.id, 'PATCH', { [field]: value });
    assert.equal(response.status, 200, field);
  }
  const profile = (await (await request(teacher.id)).json()).data;
  assert.equal(profile.phone, '+213555123457');
  assert.equal(profile.email, 'New@example.dz');
  assert.equal(profile.professionalFramework, 'café إطار');
  assert.equal(profile.administrativeCategory, 'صنف أ');
  assert.equal(profile.administrativeNote, 'سطر أول\nسطر  ثان');
  const profileEvents = await db.auditLog.findMany({ where: { entityId: teacher.id, action: 'TEACHER_PROFILE_UPDATED' }, select: { metadata: true } });
  assert.ok(profileEvents.every(({ metadata }) => !JSON.stringify(metadata).match(/عنوان شخصي|سطر أول|قرار\/١٢|تأشيرة/u)));
  assert.equal(await db.auditLog.count({ where: { entityId: teacher.id, action: 'TEACHER_PROFILE_UPDATED' } }), updates.length);
  for (const [field] of updates.slice(2)) {
    assert.equal((await request(teacher.id, 'PATCH', { [field]: null })).status, 200, field);
    assert.equal((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } }))[field], null);
  }
  const source = await db.teacherSubmission.findUniqueOrThrow({ where: { id: submission.id } });
  assert.deepEqual(source.submittedProfile, snapshot);
  assert.equal(source.status, 'ACCEPTED');
  assert.equal(source.acceptedTeacherId, teacher.id);
  assert.equal(await db.teacher.count({ where: { id: teacher.id } }), 1);
  assert.equal(await db.institution.count(), 0);
});

test('PATCH validates strict keys, empty values, dates and resulting chronology', async () => {
  const { teacher } = await fixture();
  for (const body of [{}, { name: null }, { surname: null }, { name: '' }, { name: '  ' },
    { placeOfBirth: '' }, { qualifications: '' }, { phone: '' }, { email: '' },
    { districtId: district.id }, { institutionId: randomUUID() }, { recordStatus: 'INACTIVE' }, { archivedAt: null },
    { acceptedTeacherId: randomUUID() }, { declaredInstitutions: {} }, { notes: 'secret' },
    { name: 'x'.repeat(101) }, { name: 'bad\u0001name' }, { professionalStatus: 'OTHER' },
    { professionalFramework: ' ' }, { professionalFramework: 'x'.repeat(121) },
    { professionalFramework: `e\u0301${'x'.repeat(120)}` }, { firstEducationAppointmentDecisionNumber: 'x'.repeat(121) },
    { institutionAppointmentNumber: 'x'.repeat(121) }, { financialControllerVisaNumber: 'x'.repeat(121) },
    { administrativeCategory: 'x'.repeat(101) }, { administrativeSection: 'bad\u0001text' },
    { administrativeSection: 'x'.repeat(101) }, { administrativeGrade: 'x'.repeat(101) }, { birthProvince: 'x'.repeat(101) },
    { personalAddress: 'x'.repeat(301) }, { administrativeNote: ' \n ' }, { administrativeNote: `x${'😀'.repeat(1000)}` },
    { administrativeNote: 'bad\u0001text' },
    { birthDate: '2026-02-30' }, { birthDate: '9999-01-01' },
    { birthDate: '2010-01-01' }, { employedAt: '1980-01-01' }, { employedAt: '2010-01-01' },
    { confirmedAt: '2000-01-01' }]) {
    const response = await request(teacher.id, 'PATCH', body);
    assert.equal(response.status, 400, JSON.stringify(body));
    const error = JSON.stringify(await response.json());
    assert.equal(error.includes('secret'), false);
  }
  for (const field of ['firstEducationAppointmentDate', 'firstInstallationDate', 'traineeshipDate', 'institutionAppointmentDate', 'administrativeClassificationEffectiveDate']) {
    assert.equal((await request(teacher.id, 'PATCH', { [field]: '2026-02-30' })).status, 400, field);
  }
  for (const field of ['institutionAppointmentDate', 'institutionAppointmentNumber', 'financialControllerVisaNumber']) {
    const response = await request(teacher.id, 'PATCH', { [field]: field.endsWith('Date') ? '2020-01-01' : 'REF-1' });
    assert.equal(response.status, 409, field);
  }
});

test('normalized-equivalent PATCH is no-op; changed audit is allowlisted and rollback is atomic', async () => {
  const { teacher } = await fixture();
  const original = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
  const noOp = await request(teacher.id, 'PATCH', { name: '  أمينة  ', phone: '0555123456', email: 'Amina@EXAMPLE.DZ' });
  assert.equal(noOp.status, 200);
  assert.equal((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).updatedAt.getTime(), original.updatedAt.getTime());
  assert.equal(await db.auditLog.count({ where: { entityId: teacher.id } }), 0);
  const changed = await request(teacher.id, 'PATCH', { name: 'أمينة', surname: 'اسم جديد' });
  assert.equal(changed.status, 200);
  const event = await db.auditLog.findFirstOrThrow({ where: { entityId: teacher.id } });
  assert.equal(event.action, 'TEACHER_PROFILE_UPDATED');
  assert.equal(event.entityType, 'Teacher');
  assert.equal(event.actorInspectorId, inspector.id);
  assert.equal(event.districtId, district.id);
  assert.ok(event.requestId);
  assert.deepEqual(event.metadata, { changedFields: ['surname'] });
  assert.equal(JSON.stringify(event.metadata).includes('اسم جديد'), false);
  const multi = await request(teacher.id, 'PATCH', { surname: 'اسم ثالث', name: 'اسم أول' });
  assert.equal(multi.status, 200);
  const latest = await db.auditLog.findFirstOrThrow({ where: { entityId: teacher.id }, orderBy: { occurredAt: 'desc' } });
  assert.deepEqual(latest.metadata, { changedFields: ['name', 'surname'] });

  await db.$executeRawUnsafe(`CREATE FUNCTION "${schemaName}".reject_task035_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_task035_audit BEFORE INSERT ON "${schemaName}"."AuditLog" FOR EACH ROW EXECUTE FUNCTION "${schemaName}".reject_task035_audit()`);
  try {
    const response = await request(teacher.id, 'PATCH', { surname: 'تغيير مرتد' });
    assert.equal(response.status, 500);
    assert.equal(JSON.stringify(await response.json()).includes('synthetic audit failure'), false);
    assert.equal((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).surname, 'اسم ثالث');
    assert.equal(await db.auditLog.count({ where: { entityId: teacher.id } }), 2);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER reject_task035_audit ON "${schemaName}"."AuditLog"`);
    await db.$executeRawUnsafe(`DROP FUNCTION "${schemaName}".reject_task035_audit()`);
  }
});

test('home-institution appointment facts are scoped to the current link, cleared atomically, and rollback on audit failure', async () => {
  const { teacher } = await fixture();
  const first = await db.institution.create({ data: { districtId: district.id, name: 'Current Home A' } });
  const second = await db.institution.create({ data: { districtId: district.id, name: 'Current Home B' } });
  await db.teacher.update({ where: { id: teacher.id }, data: {
    institutionId: first.id, institutionAppointmentDate: new Date('2020-02-03T00:00:00Z'),
    institutionAppointmentNumber: 'REF-20', financialControllerVisaNumber: 'VISA-20',
  } });
  await db.institution.update({ where: { id: first.id }, data: { email: 'home@example.invalid' } });
  const same = await currentInstitutionRequest(teacher.id, { institutionId: first.id, expectedInstitutionId: first.id });
  assert.equal(same.status, 200);
  let saved = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
  assert.equal(saved.institutionAppointmentDate.toISOString().slice(0, 10), '2020-02-03');
  assert.equal(saved.institutionAppointmentNumber, 'REF-20');
  assert.equal(saved.financialControllerVisaNumber, 'VISA-20');
  assert.equal(await db.auditLog.count({ where: { entityId: teacher.id } }), 0);
  const sameProfile = (await (await request(teacher.id)).json()).data;
  assert.equal(sameProfile.currentInstitution.email, undefined);
  assert.equal((await request(teacher.id, 'PATCH', { institutionAppointmentDate: '2021-02-03', institutionAppointmentNumber: 'REF-21', financialControllerVisaNumber: 'VISA-21' })).status, 200);
  const noOpBefore = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
  const noOpAuditBefore = await db.auditLog.count({ where: { entityId: teacher.id } });
  assert.equal((await currentInstitutionRequest(teacher.id, { institutionId: first.id, expectedInstitutionId: first.id })).status, 200);
  saved = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
  assert.equal(saved.institutionAppointmentNumber, 'REF-21');
  assert.equal(saved.updatedAt.getTime(), noOpBefore.updatedAt.getTime());
  assert.equal(await db.auditLog.count({ where: { entityId: teacher.id } }), noOpAuditBefore);

  await db.$executeRawUnsafe(`CREATE FUNCTION "${schemaName}".reject_task080_profile_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='TEACHER_PROFILE_UPDATED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_task080_profile_audit BEFORE INSERT ON "${schemaName}"."AuditLog" FOR EACH ROW EXECUTE FUNCTION "${schemaName}".reject_task080_profile_audit()`);
  try {
    const failed = await currentInstitutionRequest(teacher.id, { institutionId: second.id, expectedInstitutionId: first.id });
    assert.equal(failed.status, 500);
    saved = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
    assert.equal(saved.institutionId, first.id);
    assert.equal(saved.institutionAppointmentNumber, 'REF-21');
    assert.equal(saved.financialControllerVisaNumber, 'VISA-21');
    assert.equal(await db.auditLog.count({ where: { entityId: teacher.id } }), noOpAuditBefore);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER reject_task080_profile_audit ON "${schemaName}"."AuditLog"`);
    await db.$executeRawUnsafe(`DROP FUNCTION "${schemaName}".reject_task080_profile_audit()`);
  }
  const changed = await currentInstitutionRequest(teacher.id, { institutionId: second.id, expectedInstitutionId: first.id });
  assert.equal(changed.status, 200);
  saved = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
  assert.equal(saved.institutionId, second.id);
  assert.deepEqual([saved.institutionAppointmentDate, saved.institutionAppointmentNumber, saved.financialControllerVisaNumber], [null, null, null]);
  const clearAudit = await db.auditLog.findFirstOrThrow({ where: { entityId: teacher.id, action: 'TEACHER_PROFILE_UPDATED' } });
  assert.deepEqual(clearAudit.metadata, { changedFields: ['financialControllerVisaNumber', 'institutionAppointmentDate', 'institutionAppointmentNumber'] });
  assert.equal(JSON.stringify(clearAudit.metadata).includes('VISA-21'), false);
});

test('G3 public intake to inspector review, accept, linked GET/PATCH and immutable source', async () => {
  const teacherCountBefore = await db.teacher.count();
  const submittedProfile = {
    firstName: 'سلمى', lastName: 'بوخاري', dateOfBirth: '1986-03-04', placeOfBirth: 'وهران',
    phone: '0555123456', email: 'Salma@EXAMPLE.DZ', professionalStatus: 'SUBSTITUTE',
    employmentDate: '2006-09-01', workplace: { institutionName: 'ابتدائية النور', municipality: 'وهران', institutionAddress: 'شارع النخيل', directorPhone: '+21321234567' },
  };
  const publicResponse = await fetch(`${baseUrl}/api/v1/public/districts/${district.id}/submissions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(submittedProfile),
  });
  assert.equal(publicResponse.status, 202);
  const { data: receipt } = await publicResponse.json();
  assert.deepEqual(Object.keys(receipt), ['receiptId']);
  const pending = await db.teacherSubmission.findUniqueOrThrow({ where: { id: receipt.receiptId } });
  assert.equal(pending.status, 'PENDING');
  assert.equal(await db.teacher.count(), teacherCountBefore);
  const list = await fetch(`${baseUrl}/api/v1/submissions?status=PENDING`, { headers: { cookie: cookieHeader(cookies) } });
  assert.equal(list.status, 200);
  assert.ok((await list.json()).data.some((item) => item.id === pending.id));
  const before = await fetch(`${baseUrl}/api/v1/submissions/${pending.id}`, { headers: { cookie: cookieHeader(cookies) } });
  assert.equal((await before.json()).data.acceptedTeacherId, null);
  const decide = async (id, action, expectedStatus = 'PENDING') => fetch(`${baseUrl}/api/v1/submissions/${id}/decision`, {
    method: 'POST', headers: { cookie: cookieHeader(cookies), 'x-csrf-token': csrf(cookies), 'content-type': 'application/json' },
    body: JSON.stringify({ action, expectedStatus }),
  });
  const accept = await decide(pending.id, 'ACCEPT');
  assert.equal(accept.status, 200, JSON.stringify(await accept.clone().json()));
  const accepted = await db.teacherSubmission.findUniqueOrThrow({ where: { id: pending.id } });
  assert.ok(accepted.acceptedTeacherId);
  assert.equal(await db.teacher.count({ where: { id: accepted.acceptedTeacherId } }), 1);
  const acceptedTeacher = await db.teacher.findUniqueOrThrow({ where: { id: accepted.acceptedTeacherId } });
  assert.equal(acceptedTeacher.institutionId, null);
  assert.equal(acceptedTeacher.professionalStatus, 'SUBSTITUTE');
  assert.deepEqual(accepted.submittedProfile.workplace, submittedProfile.workplace);
  const detail = await fetch(`${baseUrl}/api/v1/submissions/${pending.id}`, { headers: { cookie: cookieHeader(cookies) } });
  assert.equal((await detail.json()).data.acceptedTeacherId, accepted.acceptedTeacherId);
  assert.equal((await request(accepted.acceptedTeacherId)).status, 200);
  const teacherContext = (await (await request(accepted.acceptedTeacherId)).json()).data.declaredWorkplace;
  assert.deepEqual(teacherContext, { institutionName: 'ابتدائية النور', municipality: 'وهران', institutionAddress: 'شارع النخيل', directorPhone: '+21321234567', legacyAdditionalInstitutionNames: [] });
  assert.equal((await request(accepted.acceptedTeacherId, 'PATCH', { surname: 'قاسمي' })).status, 200);
  assert.equal((await db.teacher.findUniqueOrThrow({ where: { id: accepted.acceptedTeacherId } })).surname, 'قاسمي');
  assert.deepEqual((await db.teacherSubmission.findUniqueOrThrow({ where: { id: pending.id } })).submittedProfile, pending.submittedProfile);
  assert.equal(await db.auditLog.count({ where: { entityId: accepted.acceptedTeacherId, action: 'TEACHER_PROFILE_UPDATED' } }), 1);

  const rejected = await db.teacherSubmission.create({ data: { districtId: district.id, submittedProfile: pending.submittedProfile } });
  assert.equal((await decide(rejected.id, 'REJECT')).status, 200);
  assert.equal((await db.teacherSubmission.findUniqueOrThrow({ where: { id: rejected.id } })).acceptedTeacherId, null);
  const reviewed = await db.teacherSubmission.create({ data: { districtId: district.id, submittedProfile: pending.submittedProfile } });
  assert.equal((await decide(reviewed.id, 'INTERNAL_REVIEW')).status, 200);
  assert.equal((await db.teacherSubmission.findUniqueOrThrow({ where: { id: reviewed.id } })).acceptedTeacherId, null);
  assert.equal((await decide(reviewed.id, 'REJECT', 'INTERNAL_REVIEW')).status, 200);
  const racing = await db.teacherSubmission.create({ data: { districtId: district.id, submittedProfile: pending.submittedProfile } });
  const outcomes = await Promise.all([decide(racing.id, 'ACCEPT'), decide(racing.id, 'ACCEPT')]);
  assert.deepEqual(outcomes.map((response) => response.status).sort(), [200, 409]);
  assert.equal(await db.teacher.count({ where: { id: (await db.teacherSubmission.findUniqueOrThrow({ where: { id: racing.id } })).acceptedTeacherId } }), 1);
  assert.equal((await request(accepted.acceptedTeacherId, 'GET', undefined, { cookies: null })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/v1/public/teachers/${accepted.acceptedTeacherId}`)).status, 404);
});

test('TASK-043 read model separates declared workplace from the authoritative current Institution', async () => {
  const { teacher, submission, snapshot } = await fixture();
  const institution = await db.institution.create({ data: {
    districtId: district.id, name: 'Authoritative School', municipality: 'بلدية موثقة',
    address: 'عنوان موثق', directorPhone: '+21321234567',
  } });
  await db.teacher.update({ where: { id: teacher.id }, data: { institutionId: institution.id } });

  const response = await request(teacher.id);
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.deepEqual(data.currentInstitution, {
    id: institution.id, name: 'Authoritative School', municipality: 'بلدية موثقة',
    address: 'عنوان موثق', directorPhone: '+21321234567',
  });
  assert.deepEqual(data.declaredWorkplace, {
    institutionName: 'ابتدائية النور', municipality: null, institutionAddress: null,
    directorPhone: null, legacyAdditionalInstitutionNames: ['ابتدائية الفجر'],
  });
  assert.notEqual(data.currentInstitution.name, data.declaredWorkplace.institutionName);
  assert.equal(Object.hasOwn(data, 'institutionId'), false);
  assert.deepEqual((await db.teacherSubmission.findUniqueOrThrow({ where: { id: submission.id } })).submittedProfile, snapshot);
});

test('TASK-043 links and changes only the Teacher relation with scoped ID-only audits', async () => {
  const { teacher, submission, snapshot } = await fixture();
  const first = await db.institution.create({ data: {
    districtId: district.id, name: 'First Trusted School', municipality: 'First town',
    address: 'First address', directorPhone: '+21321234567',
  } });
  const firstBefore = await db.institution.findUniqueOrThrow({ where: { id: first.id } });
  const link = await currentInstitutionRequest(teacher.id, { expectedInstitutionId: null, institutionId: first.id });
  assert.equal(link.status, 200);
  assert.deepEqual((await link.json()).data, {
    teacherId: teacher.id,
    currentInstitution: { id: first.id, name: first.name, municipality: first.municipality, address: first.address, directorPhone: first.directorPhone },
  });
  assert.equal((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).institutionId, first.id);
  assert.deepEqual(await db.institution.findUniqueOrThrow({ where: { id: first.id } }), firstBefore);
  assert.deepEqual((await db.teacherSubmission.findUniqueOrThrow({ where: { id: submission.id } })).submittedProfile, snapshot);
  const linkedAudit = await db.auditLog.findFirstOrThrow({ where: { entityId: teacher.id, action: 'TEACHER_INSTITUTION_LINKED' } });
  assert.equal(linkedAudit.entityType, 'Teacher');
  assert.equal(linkedAudit.actorInspectorId, inspector.id);
  assert.equal(linkedAudit.districtId, district.id);
  assert.equal(linkedAudit.requestId, link.headers.get('x-request-id'));
  assert.deepEqual(linkedAudit.metadata, { institutionId: first.id });
  assert.equal(JSON.stringify(linkedAudit.metadata).includes('First Trusted School'), false);
  assert.equal(JSON.stringify(linkedAudit.metadata).includes('First address'), false);

  const genericPatch = await request(teacher.id, 'PATCH', { institutionId: null });
  assert.equal(genericPatch.status, 400);
  assert.equal((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).institutionId, first.id);

  const second = await db.institution.create({ data: { districtId: district.id, name: 'Second Trusted School' } });
  const secondBefore = await db.institution.findUniqueOrThrow({ where: { id: second.id } });
  const change = await currentInstitutionRequest(teacher.id, { expectedInstitutionId: first.id, institutionId: second.id });
  assert.equal(change.status, 200);
  assert.equal((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).institutionId, second.id);
  assert.deepEqual(await db.institution.findUniqueOrThrow({ where: { id: first.id } }), firstBefore);
  assert.deepEqual(await db.institution.findUniqueOrThrow({ where: { id: second.id } }), secondBefore);
  const changedAudit = await db.auditLog.findFirstOrThrow({ where: { entityId: teacher.id, action: 'TEACHER_INSTITUTION_CHANGED' } });
  assert.deepEqual(changedAudit.metadata, { previousInstitutionId: first.id, institutionId: second.id });
  assert.equal(await db.$queryRaw`SELECT to_regclass('"TeacherInstitutionAssignment"')::text AS name`.then((rows) => rows[0]?.name ?? null), null);

  const countBeforeNoop = await db.auditLog.count({ where: { entityId: teacher.id } });
  const teacherBeforeNoop = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
  const noOp = await currentInstitutionRequest(teacher.id, { expectedInstitutionId: second.id, institutionId: second.id });
  assert.equal(noOp.status, 200);
  assert.equal((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).updatedAt.getTime(), teacherBeforeNoop.updatedAt.getTime());
  assert.equal(await db.auditLog.count({ where: { entityId: teacher.id } }), countBeforeNoop);
});

test('TASK-043 enforces authentication, CSRF, scope, strict target shape and archive eligibility', async () => {
  const { teacher } = await fixture();
  const local = await db.institution.create({ data: { districtId: district.id, name: 'Local eligible' } });
  const outside = await db.institution.create({ data: { districtId: otherDistrict.id, name: 'Secret outside' } });
  const archived = await db.institution.create({ data: { districtId: district.id, name: 'Archived target', archivedAt: new Date() } });

  assert.equal((await currentInstitutionRequest(teacher.id, { expectedInstitutionId: null, institutionId: local.id }, { cookies: null })).status, 401);
  assert.equal((await currentInstitutionRequest(teacher.id, { expectedInstitutionId: null, institutionId: local.id }, { cookies: inactiveCookies })).status, 401);
  assert.equal((await currentInstitutionRequest(teacher.id, { expectedInstitutionId: null, institutionId: local.id }, { noCsrf: true })).status, 403);
  assert.equal((await currentInstitutionRequest(teacher.id, { expectedInstitutionId: null, institutionId: local.id }, { invalidCsrf: true })).status, 403);
  assert.equal((await currentInstitutionRequest('not-a-uuid', { expectedInstitutionId: null, institutionId: local.id })).status, 400);
  assert.equal((await currentInstitutionRequest(randomUUID(), { expectedInstitutionId: null, institutionId: local.id })).status, 404);

  for (const body of [
    { institutionId: local.id },
    { expectedInstitutionId: null },
    { expectedInstitutionId: null, institutionId: null },
    { expectedInstitutionId: null, institutionId: local.id, createInstitution: { name: 'extra' } },
    { expectedInstitutionId: null, createInstitution: { name: 'new', districtId: district.id } },
    { expectedInstitutionId: null, createInstitution: { name: 'new', directorPhone: 'invalid' } },
  ]) assert.equal((await currentInstitutionRequest(teacher.id, body)).status, 400, JSON.stringify(body));

  const outsideResponse = await currentInstitutionRequest(teacher.id, { expectedInstitutionId: null, institutionId: outside.id });
  assert.equal(outsideResponse.status, 404);
  assert.equal((await outsideResponse.json()).error.message, 'المورد غير موجود ضمن نطاق الوصول.');
  assert.equal((await currentInstitutionRequest(teacher.id, { expectedInstitutionId: null, institutionId: archived.id })).status, 409);
  assert.equal((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).institutionId, null);
  assert.equal(await db.auditLog.count({ where: { entityId: teacher.id } }), 0);

  const expired = await fixture(expiredDistrict.id);
  const expiredInstitution = await db.institution.create({ data: { districtId: expiredDistrict.id, name: 'Expired scope' } });
  assert.equal((await currentInstitutionRequest(expired.teacher.id, { expectedInstitutionId: null, institutionId: expiredInstitution.id })).status, 404);
});

test('TASK-043 expected current state serializes concurrent links and rejects stale replacement', async () => {
  const { teacher } = await fixture();
  const first = await db.institution.create({ data: { districtId: district.id, name: 'Concurrent A' } });
  const second = await db.institution.create({ data: { districtId: district.id, name: 'Concurrent B' } });
  const outcomes = await Promise.all([
    currentInstitutionRequest(teacher.id, { expectedInstitutionId: null, institutionId: first.id }),
    currentInstitutionRequest(teacher.id, { expectedInstitutionId: null, institutionId: second.id }),
  ]);
  assert.deepEqual(outcomes.map(({ status }) => status).sort(), [200, 409]);
  const winnerId = (await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).institutionId;
  assert.ok([first.id, second.id].includes(winnerId));
  const staleTargetId = winnerId === first.id ? second.id : first.id;
  const stale = await currentInstitutionRequest(teacher.id, { expectedInstitutionId: staleTargetId, institutionId: staleTargetId });
  assert.equal(stale.status, 409);
  assert.equal((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).institutionId, winnerId);
  assert.equal(await db.auditLog.count({ where: { entityId: teacher.id, action: 'TEACHER_INSTITUTION_LINKED' } }), 1);
  assert.equal(await db.auditLog.count({ where: { entityId: teacher.id, action: 'TEACHER_INSTITUTION_CHANGED' } }), 0);
});

test('TASK-043 create-and-link normalizes reviewed values and rolls back all writes if audit fails', async () => {
  const { teacher, submission, snapshot } = await fixture();
  const initialInstitutionCount = await db.institution.count();
  const body = {
    expectedInstitutionId: null,
    createInstitution: { name: '  Reviewed   School ', municipality: ' بلدية   جديدة ', address: ' شارع   جديد ', directorPhone: '021234567' },
  };
  const response = await currentInstitutionRequest(teacher.id, body);
  assert.equal(response.status, 200);
  const result = (await response.json()).data;
  const created = await db.institution.findUniqueOrThrow({ where: { id: result.currentInstitution.id } });
  assert.equal(created.districtId, teacher.districtId);
  assert.deepEqual([created.name, created.municipality, created.address, created.directorPhone], ['Reviewed School', 'بلدية جديدة', 'شارع جديد', '+21321234567']);
  assert.equal((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).institutionId, created.id);
  assert.equal(await db.institution.count(), initialInstitutionCount + 1);
  assert.deepEqual((await db.teacherSubmission.findUniqueOrThrow({ where: { id: submission.id } })).submittedProfile, snapshot);
  const creationAudit = await db.auditLog.findFirstOrThrow({ where: { action: 'INSTITUTION_CREATED', entityId: created.id } });
  const linkAudit = await db.auditLog.findFirstOrThrow({ where: { action: 'TEACHER_INSTITUTION_LINKED', entityId: teacher.id } });
  assert.deepEqual(creationAudit.metadata, {});
  assert.deepEqual(linkAudit.metadata, { institutionId: created.id });
  assert.equal(creationAudit.actorInspectorId, inspector.id);
  assert.equal(creationAudit.districtId, teacher.districtId);
  assert.equal(linkAudit.actorInspectorId, inspector.id);
  assert.equal(linkAudit.districtId, teacher.districtId);
  for (const sensitive of ['Reviewed School', 'بلدية جديدة', 'شارع جديد', '+21321234567']) {
    assert.equal(JSON.stringify([creationAudit.metadata, linkAudit.metadata]).includes(sensitive), false);
  }

  const rollbackTeacher = (await fixture()).teacher;
  const beforeRollbackCount = await db.institution.count();
  await db.$executeRawUnsafe(`CREATE FUNCTION "${schemaName}".reject_task043_link_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='TEACHER_INSTITUTION_LINKED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_task043_link_audit BEFORE INSERT ON "${schemaName}"."AuditLog" FOR EACH ROW EXECUTE FUNCTION "${schemaName}".reject_task043_link_audit()`);
  try {
    const failed = await currentInstitutionRequest(rollbackTeacher.id, {
      expectedInstitutionId: null,
      createInstitution: { name: 'Will Roll Back', municipality: 'Rollback Town' },
    });
    assert.equal(failed.status, 500);
    assert.equal(JSON.stringify(await failed.json()).includes('synthetic audit failure'), false);
    assert.equal(await db.institution.count(), beforeRollbackCount);
    assert.equal((await db.teacher.findUniqueOrThrow({ where: { id: rollbackTeacher.id } })).institutionId, null);
    assert.equal(await db.auditLog.count({ where: { entityId: rollbackTeacher.id } }), 0);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER reject_task043_link_audit ON "${schemaName}"."AuditLog"`);
    await db.$executeRawUnsafe(`DROP FUNCTION "${schemaName}".reject_task043_link_audit()`);
  }
});
