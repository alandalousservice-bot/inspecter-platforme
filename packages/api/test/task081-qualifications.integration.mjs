import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { createApp } from '../dist/app.js';
import { registerAuthRoutes, requireAuthenticatedInspector } from '../dist/identity/auth-routes.js';
import { registerTeacherQualificationRoutes } from '../dist/teachers/qualification-routes.js';
import { registerTeacherProfileRoutes } from '../dist/teachers/routes.js';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const migrationsDir = join(apiDir, 'prisma', 'migrations');
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const migrationName = '20261001100000_task_081_structured_teacher_qualifications';
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(require('node:fs').readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const password = 'task081-integration-synthetic-password';
let admin, cleanDb, upgradeDb, server, baseUrl, inspector, otherInspector, district, otherDistrict, teacher, sameDistrictTeacher, otherTeacher;
let cookies, otherCookies, cleanSchema, upgradeSchema, tempRoot;

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('Isolated test target is required; refusing database access.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Isolated test target is invalid.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || url.port !== '55432' || decodeURIComponent(url.username) !== 'task020_test_user'
    || url.pathname !== '/task020_test') throw new Error('Unapproved isolated database target.');
  return raw;
}

function runPrisma(args, url, selectedSchema = schemaPath) {
  const result = require('node:child_process').spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', selectedSchema], {
    cwd: rootDir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) throw new Error(`Isolated Prisma ${args[0]} failed.`);
}

function scopedUrl(base, schema) { const url = new URL(base); url.searchParams.set('schema', schema); return url.toString(); }
function cookieParts(response) { return (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).filter(Boolean); }
function csrf(parts) { return decodeURIComponent(parts.find((part) => part.startsWith('inspector_csrf=')).split(';', 1)[0].slice('inspector_csrf='.length)); }
function cookieHeader(parts) { return parts.map((part) => part.split(';', 1)[0]).join('; '); }

async function login(target) {
  const initial = cookieParts(await fetch(`${baseUrl}/api/v1/auth/me`));
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST', headers: { cookie: cookieHeader(initial), 'x-csrf-token': csrf(initial), 'content-type': 'application/json' },
    body: JSON.stringify({ email: target.email, password }),
  });
  assert.equal(response.status, 200);
  return cookieParts(response);
}

async function request(path, method = 'GET', body, selectedCookies = cookies) {
  const headers = { 'content-type': 'application/json' };
  if (selectedCookies) headers.cookie = cookieHeader(selectedCookies);
  if (['POST', 'PATCH', 'DELETE'].includes(method) && selectedCookies) headers['x-csrf-token'] = csrf(selectedCookies);
  return fetch(`${baseUrl}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function seedUpgradeBaseline(url) {
  const client = new (await import('@prisma/client')).PrismaClient({ datasources: { db: { url } } });
  await client.$connect();
  const ids = Object.fromEntries(['district', 'inspector', 'institution', 'teacher', 'submission', 'schedule', 'visit', 'report', 'followUp', 'audit'].map((key) => [key, randomUUID()]));
  const schema = new URL(url).searchParams.get('schema');
  const q = `"${schema}"`;
  await client.$executeRawUnsafe(`INSERT INTO ${q}."District" ("id","name","createdAt","updatedAt") VALUES ('${ids.district}','TASK-081 retained district',now(),now())`);
  await client.$executeRawUnsafe(`INSERT INTO ${q}."Inspector" ("id","email","passwordHash","status","createdAt","updatedAt") VALUES ('${ids.inspector}','task081-upgrade@example.invalid','unused','ACTIVE',now(),now())`);
  await client.$executeRawUnsafe(`INSERT INTO ${q}."InspectorDistrictMembership" ("id","inspectorId","districtId","role","validFrom","createdAt","updatedAt") VALUES ('${randomUUID()}','${ids.inspector}','${ids.district}','INSPECTOR','2020-01-01T00:00:00Z',now(),now())`);
  await client.$executeRawUnsafe(`INSERT INTO ${q}."Institution" ("id","districtId","name","createdAt","updatedAt") VALUES ('${ids.institution}','${ids.district}','TASK-081 retained institution',now(),now())`);
  await client.$executeRawUnsafe(`INSERT INTO ${q}."Teacher" ("id","districtId","institutionId","name","surname","professionalStatus","qualifications","createdAt","updatedAt") VALUES ('${ids.teacher}','${ids.district}','${ids.institution}','Legacy','Teacher','TEMPORARY_CONTRACT','legacy qualifications — keep exactly',now(),now())`);
  await client.$executeRawUnsafe(`INSERT INTO ${q}."TeacherSubmission" ("id","districtId","submittedProfile","status","submittedAt","decidedAt","decidedByInspectorId","acceptedTeacherId") VALUES ('${ids.submission}','${ids.district}','{"firstName":"Legacy","professionalStatus":"TEMPORARY_CONTRACT"}'::jsonb,'ACCEPTED',now(),now(),'${ids.inspector}','${ids.teacher}')`);
  await client.$executeRawUnsafe(`INSERT INTO ${q}."WeeklySchedule" ("id","teacherId","academicYear","createdAt","updatedAt") VALUES ('${ids.schedule}','${ids.teacher}','2025-2026',now(),now())`);
  await client.$executeRawUnsafe(`INSERT INTO ${q}."PedagogicalVisit" ("id","districtId","inspectorId","teacherId","institutionId","institutionNameSnapshot","academicYear","visitType","scheduledStartAt","scheduledEndAt","createdAt","updatedAt") VALUES ('${ids.visit}','${ids.district}','${ids.inspector}','${ids.teacher}','${ids.institution}','TASK-081 retained institution','2025-2026','GUIDANCE','2025-10-01T08:00:00Z','2025-10-01T09:00:00Z',now(),now())`);
  await client.$executeRawUnsafe(`INSERT INTO ${q}."InspectionReport" ("id","visitId","lessonTopic","createdAt","updatedAt") VALUES ('${ids.report}','${ids.visit}','legacy report',now(),now())`);
  await client.$executeRawUnsafe(`INSERT INTO ${q}."FollowUp" ("id","reportId","ownerInspectorId","note","dueDate","createdAt","updatedAt") VALUES ('${ids.followUp}','${ids.report}','${ids.inspector}','legacy follow-up','2026-01-01',now(),now())`);
  await client.$executeRawUnsafe(`INSERT INTO ${q}."AuditLog" ("id","actorInspectorId","districtId","action","entityType","entityId","occurredAt","metadata") VALUES ('${ids.audit}','${ids.inspector}','${ids.district}','LEGACY_TEST','Teacher','${ids.teacher}',now(),'{}'::jsonb)`);
  await client.$disconnect();
  return ids;
}

before(async () => {
  const base = approvedUrl();
  runPrisma(['generate'], base);
  const { PrismaClient } = await import('@prisma/client');
  const { hashPassword } = await import('../dist/identity/password.js');
  admin = new PrismaClient({ datasources: { db: { url: base } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port`;
  assert.deepEqual(identity[0], { db: 'task020_test', role: 'task020_test_user', address: '127.0.0.1/32', port: 55432 });

  const tag = `${process.pid}_${randomBytes(5).toString('hex')}`;
  cleanSchema = `task081_clean_${tag}`; upgradeSchema = `task081_upgrade_${tag}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${cleanSchema}"`);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${upgradeSchema}"`);
  const cleanUrl = scopedUrl(base, cleanSchema); const upgradeUrl = scopedUrl(base, upgradeSchema);
  runPrisma(['migrate', 'deploy'], cleanUrl);
  cleanDb = new PrismaClient({ datasources: { db: { url: cleanUrl } } }); await cleanDb.$connect();

  tempRoot = mkdtempSync(join(tmpdir(), 'task081-prisma-upgrade-'));
  const tempMigrations = join(tempRoot, 'migrations'); mkdirSync(tempMigrations);
  cpSync(join(migrationsDir, 'migration_lock.toml'), join(tempRoot, 'migration_lock.toml'));
  for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name < migrationName) cpSync(join(migrationsDir, entry.name), join(tempMigrations, entry.name), { recursive: true });
  }
  const tempSchema = join(tempRoot, 'schema.prisma'); cpSync(schemaPath, tempSchema);
  runPrisma(['migrate', 'deploy'], upgradeUrl, tempSchema);
  const ids = await seedUpgradeBaseline(upgradeUrl);
  cpSync(join(migrationsDir, migrationName), join(tempMigrations, migrationName), { recursive: true });
  runPrisma(['migrate', 'deploy'], upgradeUrl, tempSchema);
  upgradeDb = new PrismaClient({ datasources: { db: { url: upgradeUrl } } }); await upgradeDb.$connect();
  const upgradedTeacher = await upgradeDb.teacher.findUniqueOrThrow({ where: { id: ids.teacher } });
  assert.equal(upgradedTeacher.qualifications, 'legacy qualifications — keep exactly');
  for (const [model, id] of [
    ['district', ids.district], ['inspector', ids.inspector], ['institution', ids.institution], ['teacher', ids.teacher],
    ['teacherSubmission', ids.submission], ['weeklySchedule', ids.schedule], ['pedagogicalVisit', ids.visit],
    ['inspectionReport', ids.report], ['followUp', ids.followUp], ['auditLog', ids.audit],
  ]) {
    assert.equal(await upgradeDb[model].count({ where: { id } }), 1, `${model} retained through additive migration`);
  }
  assert.equal(await upgradeDb.teacherQualification.count({ where: { teacherId: ids.teacher } }), 0);

  const passwordHash = await hashPassword(password);
  inspector = await cleanDb.inspector.create({ data: { email: `task081-${randomUUID()}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  otherInspector = await cleanDb.inspector.create({ data: { email: `task081-${randomUUID()}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  district = await cleanDb.district.create({ data: { name: 'TASK-081 district' } });
  otherDistrict = await cleanDb.district.create({ data: { name: 'TASK-081 other district' } });
  await cleanDb.inspectorDistrictMembership.createMany({ data: [
    { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(Date.now() - 60_000) },
    { inspectorId: otherInspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(Date.now() - 60_000) },
  ] });
  teacher = await cleanDb.teacher.create({ data: { districtId: district.id, name: 'أستاذ', surname: 'تجريبي', qualifications: 'نص قديم محفوظ' } });
  sameDistrictTeacher = await cleanDb.teacher.create({ data: { districtId: district.id, name: 'أستاذ آخر', surname: 'تجريبي' } });
  otherTeacher = await cleanDb.teacher.create({ data: { districtId: otherDistrict.id, name: 'خارج النطاق', surname: 'تجريبي' } });
  const app = createApp((instance) => {
    registerAuthRoutes(instance, cleanDb);
    const requireInspector = requireAuthenticatedInspector(cleanDb);
    registerTeacherProfileRoutes(instance, cleanDb, requireInspector);
    registerTeacherQualificationRoutes(instance, cleanDb, requireInspector);
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((yes, no) => { server.once('listening', yes); server.once('error', no); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  cookies = await login(inspector); otherCookies = await login(otherInspector);
});

after(async () => {
  if (server) await new Promise((yes) => server.close(yes));
  await cleanDb?.$disconnect(); await upgradeDb?.$disconnect();
  if (admin && cleanSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${cleanSchema}" CASCADE`);
  if (admin && upgradeSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${upgradeSchema}" CASCADE`);
  await admin?.$disconnect();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

const collection = (id) => `/api/v1/teachers/${id}/qualifications`;
const itemPath = (teacherId, qualificationId) => `${collection(teacherId)}/${qualificationId}`;

test('clean and TASK-080 upgrade migrations preserve all legacy records without fabricated qualifications', async () => {
  const cleanMigration = await cleanDb.$queryRaw`SELECT migration_name,finished_at FROM "_prisma_migrations" WHERE migration_name=${migrationName}`;
  assert.equal(cleanMigration.length, 1); assert.ok(cleanMigration[0].finished_at);
  const index = await cleanDb.$queryRaw`SELECT indexdef FROM pg_indexes WHERE schemaname=${cleanSchema} AND indexname='TeacherQualification_teacherId_qualificationDate_createdAt_id_idx'`;
  assert.match(index[0]?.indexdef ?? '', /qualificationDate.*DESC NULLS LAST.*createdAt.*DESC.*id.*DESC/u);
  assert.equal(await cleanDb.teacherQualification.count(), 0);
});

test('authentication, current district scope and generic not-found prevent cross-district and cross-Teacher access', async () => {
  const anonymous = await request(collection(teacher.id), 'GET', undefined, null);
  assert.equal(anonymous.status, 401); assert.ok(anonymous.headers.get('x-request-id'));
  assert.equal((await request(collection(otherTeacher.id))).status, 404);
  const created = await request(collection(teacher.id), 'POST', { name: 'شهادة' });
  assert.equal(created.status, 201);
  const row = (await created.json()).data;
  assert.equal((await request(itemPath(sameDistrictTeacher.id, row.id), 'PATCH', { name: 'تغيير' })).status, 404);
  assert.equal((await request(collection(otherTeacher.id), 'GET', undefined, otherCookies)).status, 404);
  assert.equal((await request('/api/v1/qualifications')).status, 404);
});

test('strict create validation, Unicode normalization, nullable fields and safe errors', async () => {
  const path = collection(teacher.id);
  for (const body of [{}, { name: null }, { name: '' }, { name: ' \t ' }, { name: 'x'.repeat(201) }, { name: 'س\u0000' }, { name: 'شهادة', extra: 'value' }, { name: 'شهادة', qualificationDate: '2025-02-29' }, { name: 'شهادة', qualificationDate: '2025-1-01' }, { name: 'شهادة', issuingBody: ' ' }]) {
    const response = await request(path, 'POST', body);
    assert.equal(response.status, 400);
    const payload = await response.text();
    assert.equal(payload.includes(JSON.stringify(body)), false);
    assert.equal(payload.includes('task081'), false);
  }
  const normalized = await request(path, 'POST', { name: '  e\u0301cole  primaire ', issuingBody: '  جهة   مانحة ', qualificationDate: '2024-02-29' });
  assert.equal(normalized.status, 201);
  const { data } = await normalized.json();
  assert.equal(data.name, 'école primaire'); assert.equal(data.issuingBody, 'جهة مانحة'); assert.equal(data.qualificationDate, '2024-02-29');
  assert.equal(Object.hasOwn(data, 'teacherId'), false);
  const boundary = await request(path, 'POST', { name: 'ش'.repeat(200), issuingBody: null, qualificationDate: null });
  assert.equal(boundary.status, 201);
  const tooLongIssuer = await request(path, 'POST', { name: 'صحيح', issuingBody: 'م'.repeat(201) });
  assert.equal(tooLongIssuer.status, 400);
});

test('read is Teacher-scoped and has deterministic date DESC NULLS LAST ordering', async () => {
  await cleanDb.teacherQualification.deleteMany({ where: { teacherId: teacher.id } });
  const sameTime = new Date('2026-01-01T00:00:00.000Z');
  const records = await Promise.all([
    cleanDb.teacherQualification.create({ data: { teacherId: teacher.id, name: 'أقدم بتاريخ', qualificationDate: new Date('2020-01-01T00:00:00Z'), createdAt: sameTime } }),
    cleanDb.teacherQualification.create({ data: { teacherId: teacher.id, name: 'الأحدث بتاريخ', qualificationDate: new Date('2022-01-01T00:00:00Z'), createdAt: sameTime } }),
    cleanDb.teacherQualification.create({ data: { teacherId: teacher.id, name: 'بلا تاريخ أ', qualificationDate: null, createdAt: new Date('2025-01-01T00:00:00Z') } }),
    cleanDb.teacherQualification.create({ data: { teacherId: teacher.id, name: 'بلا تاريخ ب', qualificationDate: null, createdAt: new Date('2024-01-01T00:00:00Z') } }),
    cleanDb.teacherQualification.create({ data: { teacherId: teacher.id, name: 'الأحدث بتاريخ', qualificationDate: new Date('2022-01-01T00:00:00Z'), createdAt: sameTime } }),
    cleanDb.teacherQualification.create({ data: { teacherId: sameDistrictTeacher.id, name: 'خاص بأستاذ آخر' } }),
  ]);
  const response = await request(collection(teacher.id)); assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { items } = await response.json();
  const expected = records.filter((row) => row.teacherId === teacher.id).sort((a, b) => {
    if (a.qualificationDate === null && b.qualificationDate !== null) return 1;
    if (a.qualificationDate !== null && b.qualificationDate === null) return -1;
    const dateOrder = b.qualificationDate?.getTime() - a.qualificationDate?.getTime();
    if (dateOrder) return dateOrder;
    return b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id);
  });
  assert.deepEqual(items.map((item) => item.id), expected.slice(0, 5).map((item) => item.id));
  assert.equal(JSON.stringify(items).includes('خاص بأستاذ آخر'), false);
  const empty = await request(collection(otherTeacher.id), 'GET', undefined, otherCookies);
  assert.equal(empty.status, 404);
});

test('PATCH is strict, partial, nullable and normalized no-op does not update or audit', async () => {
  const created = await request(collection(teacher.id), 'POST', { name: 'شهادة قديمة', issuingBody: 'مصدر', qualificationDate: '2020-01-01' });
  const row = (await created.json()).data;
  await cleanDb.teacherQualification.update({ where: { id: row.id }, data: { updatedAt: new Date('2020-01-01T00:00:00Z') } });
  const noOpAuditBefore = await cleanDb.auditLog.count({ where: { action: 'TEACHER_QUALIFICATION_UPDATED', entityId: row.id } });
  const noOp = await request(itemPath(teacher.id, row.id), 'PATCH', { name: '  شهادة   قديمة ' });
  assert.equal(noOp.status, 200);
  const noOpData = (await noOp.json()).data;
  assert.equal(noOpData.updatedAt, '2020-01-01T00:00:00.000Z');
  assert.equal(await cleanDb.auditLog.count({ where: { action: 'TEACHER_QUALIFICATION_UPDATED', entityId: row.id } }), noOpAuditBefore);
  for (const body of [{}, { name: null }, { name: ' ' }, { name: 'valid', changedFields: [] }, { qualificationDate: '2023-02-29' }]) {
    assert.equal((await request(itemPath(teacher.id, row.id), 'PATCH', body)).status, 400);
  }
  const updated = await request(itemPath(teacher.id, row.id), 'PATCH', { issuingBody: null, qualificationDate: null });
  assert.equal(updated.status, 200);
  const value = (await updated.json()).data;
  assert.equal(value.name, 'شهادة قديمة'); assert.equal(value.issuingBody, null); assert.equal(value.qualificationDate, null);
  const event = await cleanDb.auditLog.findFirstOrThrow({ where: { action: 'TEACHER_QUALIFICATION_UPDATED', entityId: row.id } });
  assert.deepEqual(event.metadata, { teacherId: teacher.id, changedFields: ['issuingBody', 'qualificationDate'] });
  for (const valueText of ['شهادة قديمة', 'مصدر', '2020-01-01']) assert.equal(JSON.stringify(event.metadata).includes(valueText), false);
  assert.equal((await request(itemPath(teacher.id, row.id), 'PATCH', { teacherId: sameDistrictTeacher.id })).status, 400);
});

test('create, update and delete audit atomically and DELETE preserves legacy Teacher text', async () => {
  const beforeTeacher = await cleanDb.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
  const schema = cleanSchema;
  await cleanDb.$executeRawUnsafe(`CREATE FUNCTION "${schema}".task081_reject_selected_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action=TG_ARGV[0] THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await cleanDb.$executeRawUnsafe(`CREATE TRIGGER task081_reject_selected_audit BEFORE INSERT ON "${schema}"."AuditLog" FOR EACH ROW EXECUTE FUNCTION "${schema}".task081_reject_selected_audit('TEACHER_QUALIFICATION_CREATED')`);
  const failedCreate = await request(collection(teacher.id), 'POST', { name: 'إنشاء غير ذري' }); assert.equal(failedCreate.status, 500);
  assert.equal(await cleanDb.teacherQualification.count({ where: { teacherId: teacher.id, name: 'إنشاء غير ذري' } }), 0);
  await cleanDb.$executeRawUnsafe(`DROP TRIGGER task081_reject_selected_audit ON "${schema}"."AuditLog"`);
  const created = await request(collection(teacher.id), 'POST', { name: 'خصوصية الشهادة', issuingBody: 'جهة حساسة', qualificationDate: '2018-05-06' });
  assert.equal(created.status, 201); const row = (await created.json()).data;
  const createAudit = await cleanDb.auditLog.findFirstOrThrow({ where: { action: 'TEACHER_QUALIFICATION_CREATED', entityId: row.id } });
  assert.deepEqual(createAudit.metadata, { teacherId: teacher.id });
  for (const secretText of ['خصوصية الشهادة', 'جهة حساسة', '2018-05-06']) assert.equal(JSON.stringify(createAudit.metadata).includes(secretText), false);

  await cleanDb.$executeRawUnsafe(`CREATE TRIGGER task081_reject_selected_audit BEFORE INSERT ON "${schema}"."AuditLog" FOR EACH ROW EXECUTE FUNCTION "${schema}".task081_reject_selected_audit('TEACHER_QUALIFICATION_UPDATED')`);
  const failedUpdate = await request(itemPath(teacher.id, row.id), 'PATCH', { name: 'تغيير غير ذري' }); assert.equal(failedUpdate.status, 500);
  assert.equal((await cleanDb.teacherQualification.findUniqueOrThrow({ where: { id: row.id } })).name, 'خصوصية الشهادة');
  await cleanDb.$executeRawUnsafe(`DROP TRIGGER task081_reject_selected_audit ON "${schema}"."AuditLog"`);
  await cleanDb.$executeRawUnsafe(`CREATE FUNCTION "${schema}".task081_reject_qualification_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='TEACHER_QUALIFICATION_DELETED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await cleanDb.$executeRawUnsafe(`CREATE TRIGGER task081_reject_qualification_delete BEFORE INSERT ON "${schema}"."AuditLog" FOR EACH ROW EXECUTE FUNCTION "${schema}".task081_reject_qualification_delete()`);
  const failedDelete = await request(itemPath(teacher.id, row.id), 'DELETE'); assert.equal(failedDelete.status, 500);
  assert.ok(await cleanDb.teacherQualification.findUnique({ where: { id: row.id } }));
  await cleanDb.$executeRawUnsafe(`DROP TRIGGER task081_reject_qualification_delete ON "${schema}"."AuditLog"`);
  await cleanDb.$executeRawUnsafe(`DROP FUNCTION "${schema}".task081_reject_qualification_delete()`);
  await cleanDb.$executeRawUnsafe(`DROP FUNCTION "${schema}".task081_reject_selected_audit()`);
  const deleted = await request(itemPath(teacher.id, row.id), 'DELETE'); assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), '');
  assert.equal((await request(itemPath(teacher.id, row.id), 'DELETE')).status, 404);
  const afterTeacher = await cleanDb.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
  assert.equal(afterTeacher.qualifications, beforeTeacher.qualifications);
  assert.equal(afterTeacher.updatedAt.toISOString(), beforeTeacher.updatedAt.toISOString());
  assert.deepEqual((await cleanDb.auditLog.findFirstOrThrow({ where: { action: 'TEACHER_QUALIFICATION_DELETED', entityId: row.id } })).metadata, { teacherId: teacher.id });
});

test('FK restrict/cascade, required constraints, duplicate names and profile projection privacy hold', async () => {
  const first = await cleanDb.teacherQualification.create({ data: { teacherId: sameDistrictTeacher.id, name: 'اسم مكرر' } });
  const second = await cleanDb.teacherQualification.create({ data: { teacherId: sameDistrictTeacher.id, name: 'اسم مكرر' } });
  assert.notEqual(first.id, second.id);
  await assert.rejects(cleanDb.teacherQualification.create({ data: { teacherId: sameDistrictTeacher.id, name: '' } }));
  await assert.rejects(cleanDb.teacher.delete({ where: { id: sameDistrictTeacher.id } }));
  const newTeacherId = randomUUID();
  await cleanDb.teacher.update({ where: { id: sameDistrictTeacher.id }, data: { id: newTeacherId } });
  assert.equal((await cleanDb.teacherQualification.findUniqueOrThrow({ where: { id: first.id } })).teacherId, newTeacherId);
  const profile = await request(`/api/v1/teachers/${teacher.id}`);
  assert.equal(profile.status, 200);
  const body = await profile.text();
  assert.equal(body.includes('qualificationsStructured'), false);
  assert.equal(body.includes('خصوصية الشهادة'), false);
  const profileData = JSON.parse(body).data;
  assert.equal(profileData.qualifications, 'نص قديم محفوظ');
});
