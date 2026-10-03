import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { createApp } from '../dist/app.js';
import { registerAuthRoutes, requireAuthenticatedInspector } from '../dist/identity/auth-routes.js';
import { registerTeacherSubmissionRoutes } from '../dist/intake/routes.js';
import { registerInspectorSubmissionRoutes } from '../dist/intake/inspector-routes.js';
import { registerSubmissionDecisionRoute } from '../dist/intake/decision-routes.js';
import { createPublicSubmissionRateLimiter } from '../dist/intake/rate-limit.js';
import { assertLiveTestDatabase, createOwnedTestSchema, dropOwnedTestSchema, generateTestSchema } from '../../../scripts/test-schema-safety.mjs';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const migrationsDir = join(apiDir, 'prisma', 'migrations');
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const migrationName = '20261003100000_task_085_public_intake_evolution';
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(require('node:fs').readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const password = 'task085-synthetic-password';
const sensitiveMarker = 'TASK085_PRIVATE_SENTINEL';
let admin, cleanDb, upgradeDb, server, baseUrl, inspector, cookies, district, cleanSchema, upgradeSchema, tempRoot, baseDatabaseUrl;
let cleanSchemaCreated = false; let upgradeSchemaCreated = false;

const validSubmission = {
  firstName: 'أمينة', lastName: 'بن صالح', dateOfBirth: '1985-03-04', placeOfBirth: 'وهران',
  phone: '+213555123456', email: 'amina@example.dz', professionalStatus: 'SUBSTITUTE', employmentDate: '2005-09-01',
  confirmationDate: '2007-09-01', qualifications: 'نص مؤهلات قديم',
  workplace: { institutionName: 'ابتدائية النور', municipality: 'وهران', institutionAddress: 'شارع النخيل', directorPhone: '+21321234567' },
};

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('Isolated test target is required; refusing database access.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Isolated test target is malformed.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55432'
    || decodeURIComponent(url.username) !== 'task020_test_user' || url.pathname !== '/task020_test'
    || url.searchParams.get('schema') !== 'public') throw new Error('Unapproved isolated database target.');
  return raw;
}

function runPrisma(args, url, selectedSchema = schemaPath) {
  const result = require('node:child_process').spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', selectedSchema], {
    cwd: rootDir, encoding: 'utf8', timeout: 180_000, windowsHide: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) {
    const details = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/giu, '[redacted]');
    throw new Error(`Isolated Prisma ${args[0]} failed.${details.trim() ? ` ${details.trim()}` : ''}`);
  }
}

const cookiesFrom = (response) => response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? ''];
const csrf = (parts) => decodeURIComponent(parts.find((part) => part.startsWith('inspector_csrf=')).split(';', 1)[0].slice('inspector_csrf='.length));
const cookieHeader = (parts) => parts.map((part) => part.split(';', 1)[0]).join('; ');

async function login() {
  const initial = cookiesFrom(await fetch(`${baseUrl}/api/v1/auth/me`));
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST', headers: { cookie: cookieHeader(initial), 'x-csrf-token': csrf(initial), 'content-type': 'application/json' },
    body: JSON.stringify({ email: inspector.email, password }),
  });
  assert.equal(response.status, 200);
  return cookiesFrom(response);
}

const date = (value) => new Date(`${value}T00:00:00.000Z`);

before(async () => {
  const base = approvedUrl(); baseDatabaseUrl = base;
  runPrisma(['generate'], base);
  const { PrismaClient } = await import('@prisma/client');
  const { hashPassword } = await import('../dist/identity/password.js');
  admin = new PrismaClient({ datasources: { db: { url: base } } }); await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port`;
  assert.deepEqual(identity[0], { db: 'task020_test', role: 'task020_test_user', address: '127.0.0.1/32', port: 55432 });
  cleanSchema = generateTestSchema('task085_clean'); upgradeSchema = generateTestSchema('task085_upgrade');
  const cleanUrl = await createOwnedTestSchema(admin, base, cleanSchema);
  cleanSchemaCreated = true;
  const upgradeUrl = await createOwnedTestSchema(admin, base, upgradeSchema);
  upgradeSchemaCreated = true;
  await assertLiveTestDatabase(admin);
  runPrisma(['migrate', 'deploy'], cleanUrl);
  cleanDb = new PrismaClient({ datasources: { db: { url: cleanUrl } } }); await cleanDb.$connect();

  tempRoot = mkdtempSync(join(tmpdir(), 'task085-prisma-upgrade-'));
  const tempMigrations = join(tempRoot, 'migrations'); mkdirSync(tempMigrations);
  cpSync(join(migrationsDir, 'migration_lock.toml'), join(tempRoot, 'migration_lock.toml'));
  for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name < migrationName) cpSync(join(migrationsDir, entry.name), join(tempMigrations, entry.name), { recursive: true });
  }
  const tempSchema = join(tempRoot, 'schema.prisma'); cpSync(schemaPath, tempSchema);
  await assertLiveTestDatabase(admin);
  runPrisma(['migrate', 'deploy'], upgradeUrl, tempSchema);
  const beforeIds = { districtId: randomUUID(), submissionId: randomUUID() };
  const beforeProfile = { firstName: 'Legacy', lastName: 'Teacher', workplace: { institutionName: 'قديم' } };
  const oldClient = new PrismaClient({ datasources: { db: { url: upgradeUrl } } }); await oldClient.$connect();
  const oldSchemaName = new URL(upgradeUrl).searchParams.get('schema');
  await oldClient.$executeRawUnsafe(`INSERT INTO "${oldSchemaName}"."District" ("id","name","createdAt","updatedAt") VALUES ('${beforeIds.districtId}','District before TASK-085',now(),now())`);
  const oldProfileJson = JSON.stringify(beforeProfile).replaceAll("'", "''");
  await oldClient.$executeRawUnsafe(`INSERT INTO "${oldSchemaName}"."TeacherSubmission" ("id","districtId","submittedProfile","status","submittedAt") VALUES ('${beforeIds.submissionId}','${beforeIds.districtId}','${oldProfileJson}'::jsonb,'PENDING',now())`);
  await oldClient.$disconnect();
  cpSync(join(migrationsDir, migrationName), join(tempMigrations, migrationName), { recursive: true });
  runPrisma(['migrate', 'deploy'], upgradeUrl, tempSchema);
  upgradeDb = new PrismaClient({ datasources: { db: { url: upgradeUrl } } }); await upgradeDb.$connect();
  const [retained] = await upgradeDb.$queryRaw`SELECT "submittedProfile", "birthProvince", "professionalFramework", "firstEducationAppointmentDate", "firstEducationAppointmentDecisionNumber", "firstInstallationDate", "traineeshipDate", "institutionAppointmentDate", "institutionAppointmentNumber", "administrativeCategory", "administrativeSection", "administrativeGrade", "administrativeClassificationEffectiveDate", "personalAddress", "declaredHomeInstitutionEmail" FROM "TeacherSubmission" WHERE "id"=${beforeIds.submissionId}::uuid`;
  assert.deepEqual(retained.submittedProfile, beforeProfile);
  for (const field of ['birthProvince', 'professionalFramework', 'firstEducationAppointmentDate', 'firstEducationAppointmentDecisionNumber', 'firstInstallationDate', 'traineeshipDate', 'institutionAppointmentDate', 'institutionAppointmentNumber', 'administrativeCategory', 'administrativeSection', 'administrativeGrade', 'administrativeClassificationEffectiveDate', 'personalAddress', 'declaredHomeInstitutionEmail']) assert.equal(retained[field], null);
  assert.equal(await upgradeDb.teacherSubmissionQualificationDeclaration.count(), 0);
  assert.equal(await upgradeDb.teacherSubmissionSupplementaryWorkplaceDeclaration.count(), 0);

  inspector = await cleanDb.inspector.create({ data: { email: `task085-${randomUUID()}@example.invalid`, passwordHash: await hashPassword(password), status: 'ACTIVE' } });
  district = await cleanDb.district.create({ data: { name: 'TASK-085 district' } });
  await cleanDb.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: date('2020-01-01') } });
  const app = createApp((instance) => {
    registerAuthRoutes(instance, cleanDb);
    const requireInspector = requireAuthenticatedInspector(cleanDb);
    registerTeacherSubmissionRoutes(instance, cleanDb);
    registerInspectorSubmissionRoutes(instance, cleanDb, requireInspector);
    registerSubmissionDecisionRoute(instance, cleanDb, requireInspector);
  }, { publicSubmissionRateLimiter: createPublicSubmissionRateLimiter({ limit: 1000, resolveClientIp: (incoming) => incoming.socket.remoteAddress }) });
  server = app.listen(0, '127.0.0.1'); await new Promise((yes, no) => { server.once('listening', yes); server.once('error', no); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  cookies = await login();
});

after(async () => {
  if (server) await new Promise((yes) => server.close(yes));
  await cleanDb?.$disconnect(); await upgradeDb?.$disconnect();
  if (admin && cleanSchemaCreated) await dropOwnedTestSchema(admin, baseDatabaseUrl, cleanSchema);
  if (admin && upgradeSchemaCreated) await dropOwnedTestSchema(admin, baseDatabaseUrl, upgradeSchema);
  await admin?.$disconnect();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('one additive migration supports clean deploy and preserves pre-existing submission JSON on upgrade', async () => {
  const folders = readdirSync(migrationsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  assert.equal(folders.filter((entry) => entry.name === migrationName).length, 1);
  const history = await cleanDb.$queryRaw`SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name=${migrationName}`;
  assert.equal(history.length, 1); assert.ok(history[0].finished_at);
  const columns = await cleanDb.$queryRaw`SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_schema=${cleanSchema} AND table_name='TeacherSubmission'`;
  for (const field of ['birthProvince', 'professionalFramework', 'firstEducationAppointmentDate', 'firstEducationAppointmentDecisionNumber', 'firstInstallationDate', 'traineeshipDate', 'institutionAppointmentDate', 'institutionAppointmentNumber', 'administrativeCategory', 'administrativeSection', 'administrativeGrade', 'administrativeClassificationEffectiveDate', 'personalAddress', 'declaredHomeInstitutionEmail']) assert.equal(columns.find((row) => row.column_name === field)?.is_nullable, 'YES');
  const fks = await cleanDb.$queryRaw`SELECT conname,confdeltype,confupdtype FROM pg_constraint WHERE connamespace=${cleanSchema}::regnamespace AND contype='f'`;
  for (const name of ['tsq_submission_fk', 'tsw_submission_fk']) {
    const fk = fks.find((row) => row.conname === name); assert.equal(fk?.confdeltype, 'r'); assert.equal(fk?.confupdtype, 'c');
  }
  assert.equal((await cleanDb.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`).length, folders.length);
});

test('public POST persists declarations atomically, returns receipt only, and scoped Inspector detail displays declarations', async () => {
  const submissionBody = {
    ...validSubmission,
    birthProvince: '  ولاية   وهران ', professionalFramework: ' إطار رياضي ',
    firstEducationAppointmentDate: '2006-09-01', firstEducationAppointmentDecisionNumber: 'قرار سري ١',
    firstInstallationDate: '2007-09-01', traineeshipDate: '2005-10-01', institutionAppointmentDate: '2015-09-01',
    institutionAppointmentNumber: 'رقم تعيين سري', administrativeCategory: 'صنف 12', administrativeSection: 'قسم 1',
    administrativeGrade: 'درجة 2', administrativeClassificationEffectiveDate: '2020-01-01', personalAddress: `${sensitiveMarker} عنوان خاص`,
    workplace: { ...validSubmission.workplace, institutionEmail: 'School@EXAMPLE.DZ' },
    structuredQualifications: [
      { name: 'شهادة أولى', issuingBody: 'جامعة أ', qualificationDate: '2010-01-01' },
      { name: 'شهادة ثانية', qualificationDate: '2012-02-02' },
    ],
    supplementaryWorkplaces: [
      { institutionName: 'ابتدائية إضافية أ', municipality: 'بلدية أ', institutionAddress: 'عنوان أ', directorPhone: '0555123456' },
      { institutionName: 'ابتدائية إضافية ب' },
    ],
  };
  const response = await fetch(`${baseUrl}/api/v1/public/districts/${district.id}/submissions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(submissionBody) });
  assert.equal(response.status, 202); assert.equal(response.headers.get('cache-control'), 'no-store');
  const receipt = await response.json(); assert.deepEqual(Object.keys(receipt.data), ['receiptId']);
  assert.equal(JSON.stringify(receipt).includes(sensitiveMarker), false);
  const row = await cleanDb.teacherSubmission.findUniqueOrThrow({ where: { id: receipt.data.receiptId }, include: { qualificationDeclarations: { orderBy: { position: 'asc' } }, supplementaryWorkplaceDeclarations: { orderBy: { position: 'asc' } } } });
  assert.equal(row.birthProvince, 'ولاية وهران'); assert.equal(row.professionalFramework, 'إطار رياضي');
  assert.equal(row.firstEducationAppointmentDecisionNumber, 'قرار سري ١'); assert.equal(row.institutionAppointmentNumber, 'رقم تعيين سري');
  assert.equal(row.declaredHomeInstitutionEmail, 'School@example.dz');
  assert.equal(Object.hasOwn(row.submittedProfile, 'personalAddress'), false);
  assert.equal(Object.hasOwn(row.submittedProfile, 'structuredQualifications'), false);
  assert.equal(Object.hasOwn(row.submittedProfile.workplace, 'institutionEmail'), false);
  assert.deepEqual(row.qualificationDeclarations.map((item) => item.position), [0, 1]);
  assert.deepEqual(row.supplementaryWorkplaceDeclarations.map((item) => item.institutionName), ['ابتدائية إضافية أ', 'ابتدائية إضافية ب']);

  const anonymousDetail = await fetch(`${baseUrl}/api/v1/submissions/${row.id}`);
  assert.equal(anonymousDetail.status, 401);
  const detailResponse = await fetch(`${baseUrl}/api/v1/submissions/${row.id}`, { headers: { cookie: cookieHeader(cookies) } });
  assert.equal(detailResponse.status, 200);
  const detail = (await detailResponse.json()).data;
  assert.equal(detail.declaredAdministrative.personalAddress, `${sensitiveMarker} عنوان خاص`);
  assert.equal(detail.declaredWorkplace.institutionEmail, 'School@example.dz');
  assert.deepEqual(detail.structuredQualifications.map((item) => item.name), ['شهادة أولى', 'شهادة ثانية']);
  assert.deepEqual(detail.supplementaryWorkplaces.map((item) => item.institutionName), ['ابتدائية إضافية أ', 'ابتدائية إضافية ب']);
  const listResponse = await fetch(`${baseUrl}/api/v1/submissions?status=PENDING`, { headers: { cookie: cookieHeader(cookies) } });
  assert.equal(listResponse.status, 200); assert.equal(JSON.stringify(await listResponse.json()).includes(sensitiveMarker), false);
});

test('ACCEPT seeds only approved fields, preserves legacy mappings, and creates no authoritative declaration records', async () => {
  const target = await cleanDb.teacherSubmission.findFirstOrThrow({ where: { districtId: district.id, status: 'PENDING' }, orderBy: { submittedAt: 'desc' } });
  const csrfToken = csrf(cookies);
  const response = await fetch(`${baseUrl}/api/v1/submissions/${target.id}/decision`, { method: 'POST', headers: { cookie: cookieHeader(cookies), 'x-csrf-token': csrfToken, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'ACCEPT', expectedStatus: 'PENDING' }) });
  assert.equal(response.status, 200);
  const accepted = await cleanDb.teacherSubmission.findUniqueOrThrow({ where: { id: target.id }, include: { qualificationDeclarations: true, supplementaryWorkplaceDeclarations: true } });
  const teacher = await cleanDb.teacher.findUniqueOrThrow({ where: { id: accepted.acceptedTeacherId } });
  assert.equal(teacher.birthProvince, 'ولاية وهران'); assert.equal(teacher.professionalFramework, 'إطار رياضي');
  assert.equal(teacher.firstEducationAppointmentDate.toISOString().slice(0, 10), '2006-09-01');
  assert.equal(teacher.firstInstallationDate.toISOString().slice(0, 10), '2007-09-01');
  assert.equal(teacher.traineeshipDate.toISOString().slice(0, 10), '2005-10-01');
  assert.equal(teacher.administrativeClassificationEffectiveDate.toISOString().slice(0, 10), '2020-01-01');
  assert.equal(teacher.personalAddress, `${sensitiveMarker} عنوان خاص`);
  assert.equal(teacher.confirmedAt.toISOString().slice(0, 10), '2007-09-01'); assert.equal(teacher.qualifications, 'نص مؤهلات قديم');
  assert.equal(teacher.firstEducationAppointmentDecisionNumber, null); assert.equal(teacher.institutionAppointmentDate, null); assert.equal(teacher.institutionAppointmentNumber, null);
  assert.equal(teacher.institutionId, null); assert.equal(await cleanDb.teacherQualification.count({ where: { teacherId: teacher.id } }), 0);
  assert.equal(await cleanDb.teacherSupplementaryWorkplace.count({ where: { teacherId: teacher.id } }), 0);
  assert.equal(await cleanDb.institution.count(), 0);
  const audit = await cleanDb.auditLog.findFirstOrThrow({ where: { entityId: target.id } });
  assert.equal(audit.action, 'TEACHER_SUBMISSION_ACCEPTED');
  assert.equal(JSON.stringify(audit.metadata).includes(sensitiveMarker), false);
  assert.equal(JSON.stringify(audit.metadata).includes('قرار سري'), false);
});

test('strict public validation rejects nulls, unknown nested keys, bad dates and over-limit arrays without value leakage', async () => {
  const path = `/api/v1/public/districts/${district.id}/submissions`;
  const badBodies = [
    { ...validSubmission, personalAddress: null },
    { ...validSubmission, structuredQualifications: [{ name: 'شهادة', unexpected: 'private' }] },
    { ...validSubmission, supplementaryWorkplaces: [{ institutionName: 'مؤسسة', institutionId: randomUUID() }] },
    { ...validSubmission, workplace: { ...validSubmission.workplace, institutionEmail: 'not-email' } },
    { ...validSubmission, administrativeClassificationEffectiveDate: '2020-02-30' },
    { ...validSubmission, structuredQualifications: Array(6).fill({ name: 'شهادة' }) },
    { ...validSubmission, supplementaryWorkplaces: Array(4).fill({ institutionName: 'مؤسسة' }) },
  ];
  for (const body of badBodies) {
    const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
    const text = await response.text(); assert.equal(text.includes('private'), false); assert.equal(text.includes('أمينة'), false);
  }
});
