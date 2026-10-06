import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { after, before, test } from 'node:test';
import process from 'node:process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const migrationsDir = join(apiDir, 'prisma', 'migrations');
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const migrationName = '20261001090000_task_080_teacher_administrative_master_data';
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
let admin;
let PrismaClient;
let cleanDb;
let cleanSchema;
let upgradeSchema;
let tempRoot;

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL is required; refusing database access.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid isolated test target.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
      || url.port !== '55432' || url.username !== 'task020_test_user'
      || url.pathname !== '/task020_test' || url.searchParams.get('schema') !== 'public') {
    throw new Error('Not the approved isolated database target.');
  }
  return raw;
}

function scopedUrl(baseUrl, schema) {
  const url = new URL(baseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
}

function runPrisma(args, url, selectedSchema = schemaPath) {
  const result = require('node:child_process').spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', selectedSchema], {
    cwd: rootDir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) throw new Error(`Isolated Prisma command failed (${args[0]}).`);
}

async function connectClient(url) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  await client.$connect();
  return client;
}

before(async () => {
  const baseUrl = approvedUrl();
  runPrisma(['generate'], baseUrl);
  ({ PrismaClient } = await import('@prisma/client'));
  admin = await connectClient(baseUrl);
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  assert.equal(identity[0]?.db, 'task020_test');
  assert.equal(identity[0]?.role, 'task020_test_user');
  cleanSchema = `task080_clean_${process.pid}_${randomBytes(5).toString('hex')}`;
  upgradeSchema = `task080_upgrade_${process.pid}_${randomBytes(5).toString('hex')}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${cleanSchema}"`);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${upgradeSchema}"`);
  const cleanUrl = scopedUrl(baseUrl, cleanSchema);
  runPrisma(['migrate', 'deploy'], cleanUrl);
  cleanDb = await connectClient(cleanUrl);

  tempRoot = mkdtempSync(join(tmpdir(), 'task080-prisma-upgrade-'));
  const tempMigrations = join(tempRoot, 'migrations');
  mkdirSync(tempMigrations);
  const tempSchema = join(tempRoot, 'schema.prisma');
  cpSync(join(migrationsDir, 'migration_lock.toml'), join(tempRoot, 'migration_lock.toml'));
  for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name < migrationName) cpSync(join(migrationsDir, entry.name), join(tempMigrations, entry.name), { recursive: true });
  }
  cpSync(schemaPath, tempSchema);
  const upgradeUrl = scopedUrl(baseUrl, upgradeSchema);
  runPrisma(['migrate', 'deploy'], upgradeUrl, tempSchema);
  const savedIds = Object.fromEntries(['district', 'inspector', 'institution', 'teacher', 'submission', 'schedule', 'visit', 'report', 'followUp', 'audit'].map((name) => [name, randomUUID()]));
  const s = `"${upgradeSchema}"`;
  await admin.$executeRawUnsafe(`INSERT INTO ${s}."District" ("id","name","createdAt","updatedAt") VALUES ('${savedIds.district}','TASK-080 legacy district',now(),now())`);
  await admin.$executeRawUnsafe(`INSERT INTO ${s}."Inspector" ("id","email","passwordHash","status","createdAt","updatedAt") VALUES ('${savedIds.inspector}','task080-upgrade@example.invalid','not-used-in-login','ACTIVE',now(),now())`);
  await admin.$executeRawUnsafe(`INSERT INTO ${s}."InspectorDistrictMembership" ("id","inspectorId","districtId","role","validFrom","createdAt","updatedAt") VALUES ('${randomUUID()}','${savedIds.inspector}','${savedIds.district}','INSPECTOR','2020-01-01T00:00:00Z',now(),now())`);
  await admin.$executeRawUnsafe(`INSERT INTO ${s}."Institution" ("id","districtId","name","createdAt","updatedAt") VALUES ('${savedIds.institution}','${savedIds.district}','TASK-080 legacy institution',now(),now())`);
  await admin.$executeRawUnsafe(`INSERT INTO ${s}."Teacher" ("id","districtId","institutionId","name","surname","professionalStatus","qualifications","createdAt","updatedAt") VALUES ('${savedIds.teacher}','${savedIds.district}','${savedIds.institution}','Legacy','Teacher','TEMPORARY_CONTRACT','legacy free text',now(),now())`);
  await admin.$executeRawUnsafe(`INSERT INTO ${s}."TeacherSubmission" ("id","districtId","submittedProfile","status","submittedAt","decidedAt","decidedByInspectorId","acceptedTeacherId") VALUES ('${savedIds.submission}','${savedIds.district}','{"firstName":"Legacy","professionalStatus":"TEMPORARY_CONTRACT"}'::jsonb,'ACCEPTED',now(),now(),'${savedIds.inspector}','${savedIds.teacher}')`);
  await admin.$executeRawUnsafe(`INSERT INTO ${s}."WeeklySchedule" ("id","teacherId","academicYear","createdAt","updatedAt") VALUES ('${savedIds.schedule}','${savedIds.teacher}','2025-2026',now(),now())`);
  await admin.$executeRawUnsafe(`INSERT INTO ${s}."PedagogicalVisit" ("id","districtId","inspectorId","teacherId","institutionId","institutionNameSnapshot","academicYear","visitType","scheduledStartAt","scheduledEndAt","createdAt","updatedAt") VALUES ('${savedIds.visit}','${savedIds.district}','${savedIds.inspector}','${savedIds.teacher}','${savedIds.institution}','TASK-080 legacy institution','2025-2026','GUIDANCE','2025-10-01T08:00:00Z','2025-10-01T09:00:00Z',now(),now())`);
  await admin.$executeRawUnsafe(`INSERT INTO ${s}."InspectionReport" ("id","visitId","lessonTopic","createdAt","updatedAt") VALUES ('${savedIds.report}','${savedIds.visit}','legacy report',now(),now())`);
  await admin.$executeRawUnsafe(`INSERT INTO ${s}."FollowUp" ("id","reportId","ownerInspectorId","note","dueDate","createdAt","updatedAt") VALUES ('${savedIds.followUp}','${savedIds.report}','${savedIds.inspector}','legacy follow-up','2026-01-01',now(),now())`);
  await admin.$executeRawUnsafe(`INSERT INTO ${s}."AuditLog" ("id","actorInspectorId","districtId","action","entityType","entityId","occurredAt","metadata") VALUES ('${savedIds.audit}','${savedIds.inspector}','${savedIds.district}','LEGACY_TEST','Teacher','${savedIds.teacher}',now(),'{"retained":true}'::jsonb)`);

  cpSync(join(migrationsDir, migrationName), join(tempMigrations, migrationName), { recursive: true });
  runPrisma(['migrate', 'deploy'], upgradeUrl, tempSchema);
  const upgraded = await connectClient(upgradeUrl);
  // The upgrade fixture intentionally stops at TASK-080, not the latest schema.
  const upgradedTeacher = (await upgraded.$queryRaw`SELECT * FROM "Teacher" WHERE "id"=${savedIds.teacher}::uuid`)[0];
  const upgradedInstitution = await upgraded.$queryRaw`SELECT "email" FROM "Institution" WHERE "id"=${savedIds.institution}::uuid`;
  assert.equal(upgradedTeacher.professionalStatus, 'TEMPORARY_CONTRACT');
  assert.equal(upgradedTeacher.qualifications, 'legacy free text');
  for (const field of ['professionalFramework', 'firstEducationAppointmentDate', 'firstEducationAppointmentDecisionNumber', 'firstInstallationDate', 'traineeshipDate', 'institutionAppointmentDate', 'institutionAppointmentNumber', 'financialControllerVisaNumber', 'administrativeCategory', 'administrativeSection', 'administrativeGrade', 'administrativeClassificationEffectiveDate', 'birthProvince', 'personalAddress', 'administrativeNote']) {
    assert.equal(upgradedTeacher[field], null, field);
  }
  assert.deepEqual(upgradedInstitution, [{ email: null }]);
  assert.equal(await upgraded.teacherSubmission.count({ where: { id: savedIds.submission } }), 1);
  assert.equal(await upgraded.weeklySchedule.count({ where: { id: savedIds.schedule } }), 1);
  assert.equal(await upgraded.pedagogicalVisit.count({ where: { id: savedIds.visit } }), 1);
  assert.equal(await upgraded.inspectionReport.count({ where: { id: savedIds.report } }), 1);
  assert.equal(await upgraded.followUp.count({ where: { id: savedIds.followUp } }), 1);
  assert.equal(await upgraded.auditLog.count({ where: { id: savedIds.audit } }), 1);
  await upgraded.$disconnect();
});

after(async () => {
  await cleanDb?.$disconnect();
  if (admin && cleanSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${cleanSchema}" CASCADE`);
  if (admin && upgradeSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${upgradeSchema}" CASCADE`);
  await admin?.$disconnect();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('TASK-080 migration applies cleanly with nullable DATE/VARCHAR columns and preserves upgrade data', async () => {
  const migrations = await cleanDb.$queryRaw`SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name=${migrationName}`;
  assert.equal(migrations.length, 1);
  assert.ok(migrations[0].finished_at);
  const columns = await cleanDb.$queryRaw`SELECT table_name, column_name, is_nullable, data_type, character_maximum_length FROM information_schema.columns WHERE table_schema=${cleanSchema} AND ((table_name='Institution' AND column_name='email') OR (table_name='Teacher' AND column_name IN ('professionalFramework','firstEducationAppointmentDate','firstEducationAppointmentDecisionNumber','firstInstallationDate','traineeshipDate','institutionAppointmentDate','institutionAppointmentNumber','financialControllerVisaNumber','administrativeCategory','administrativeSection','administrativeGrade','administrativeClassificationEffectiveDate','birthProvince','personalAddress','administrativeNote'))) ORDER BY table_name,column_name`;
  assert.equal(columns.length, 16);
  assert.ok(columns.every(({ is_nullable }) => is_nullable === 'YES'));
  assert.ok(columns.filter(({ data_type }) => data_type === 'date').length === 5);
  assert.deepEqual(await cleanDb.teacher.count(), 0);
  assert.deepEqual(await cleanDb.institution.count(), 0);
  const statusConstraint = await cleanDb.$queryRaw`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=to_regclass(${`${cleanSchema}."Teacher"`}) AND conname='Teacher_professionalStatus_check'`;
  assert.match(statusConstraint[0]?.definition ?? '', /'SUBSTITUTE'/u);
  const district = await cleanDb.district.create({ data: { name: 'TASK-080 status constraint' } });
  const substitute = await cleanDb.teacher.create({ data: { districtId: district.id, name: 'Substitute', surname: 'Allowed', professionalStatus: 'SUBSTITUTE' } });
  assert.equal(substitute.professionalStatus, 'SUBSTITUTE');
  await assert.rejects(cleanDb.teacher.create({ data: { districtId: district.id, name: 'Invalid', surname: 'Status', professionalStatus: 'OTHER' } }));
});
