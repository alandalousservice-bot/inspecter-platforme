import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import process from 'node:process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const migrationsDir = join(apiDir, 'prisma', 'migrations');
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const migrationName = '20260929060000_task_047_weekly_schedule';
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

function schemaUrl(baseUrl, schema) {
  const url = new URL(baseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
}

function runPrisma(args, url, selectedSchema = schemaPath) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', selectedSchema], {
    cwd: rootDir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) throw new Error(`Isolated Prisma command failed (${args[0]}).`);
}

function migrationBundle(name, excluded) {
  const bundle = join(tempRoot, name);
  const bundleMigrations = join(bundle, 'migrations');
  mkdirSync(bundleMigrations, { recursive: true });
  cpSync(join(migrationsDir, 'migration_lock.toml'), join(bundle, 'migration_lock.toml'));
  for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !excluded.includes(entry.name)) cpSync(join(migrationsDir, entry.name), join(bundleMigrations, entry.name), { recursive: true });
  }
  const bundledSchema = join(bundle, 'schema.prisma');
  cpSync(schemaPath, bundledSchema);
  return { schema: bundledSchema, migrations: bundleMigrations };
}

async function appliedMigrations(db) {
  return db.$queryRaw`SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at`;
}

before(async () => {
  const baseUrl = approvedUrl();
  runPrisma(['generate'], baseUrl);
  ({ PrismaClient } = await import('@prisma/client'));
  admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  assert.deepEqual(identity[0], { db: 'task020_test', role: 'task020_test_user' });
  cleanSchema = `task047_clean_${process.pid}_${randomBytes(5).toString('hex')}`;
  upgradeSchema = `task047_upgrade_${process.pid}_${randomBytes(5).toString('hex')}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${cleanSchema}"`);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${upgradeSchema}"`);

  tempRoot = mkdtempSync(join(tmpdir(), 'task047-prisma-upgrade-'));
  const reportMigration = '20260930020000_task_052_inspection_report';
  const followUpMigration = '20260930030000_task_053_follow_up';
  const visitTypeMigration = '20260930120000_task_053a_visit_type';
  const task054Migration = '20260930150000_task_054_inspector_visit_report_v1';
  const task080Migration = '20261001090000_task_080_teacher_administrative_master_data';
  const task081Migration = '20261001100000_task_081_structured_teacher_qualifications';
  const task082Migration = '20261001120000_task_082_teacher_supplementary_workplaces';
  const task083Migration = '20261002120000_task_083_workplace_aware_schedule_visits';
  const task085Migration = '20261003100000_task_085_public_intake_evolution';
  const cleanBundle = migrationBundle('clean', ['20260929070000_task_050_pedagogical_visit', '20260930010000_task_052a_inspector_professional_identity', reportMigration, followUpMigration, visitTypeMigration, task054Migration, task085Migration]);
  const upgradeBundle = migrationBundle('upgrade', [migrationName, '20260929070000_task_050_pedagogical_visit', '20260930010000_task_052a_inspector_professional_identity', reportMigration, followUpMigration, visitTypeMigration, task054Migration, task083Migration, task085Migration]);
  const cleanUrl = schemaUrl(baseUrl, cleanSchema);
  runPrisma(['migrate', 'deploy'], cleanUrl, cleanBundle.schema);
  runPrisma(['migrate', 'status'], cleanUrl, cleanBundle.schema);
  cleanDb = new PrismaClient({ datasources: { db: { url: cleanUrl } } });
  await cleanDb.$connect();
  const cleanHistory = await appliedMigrations(cleanDb);
  assert.ok(cleanHistory.some((row) => row.migration_name === task083Migration));
  assert.ok(cleanHistory.every((row) => row.finished_at));

  const upgradeUrl = schemaUrl(baseUrl, upgradeSchema);
  runPrisma(['migrate', 'deploy'], upgradeUrl, upgradeBundle.schema);
  const districtId = randomUUID();
  const teacherId = randomUUID();
  const institutionId = randomUUID();
  await admin.$executeRawUnsafe(
    `INSERT INTO "${upgradeSchema}"."District" ("id","name","createdAt","updatedAt") VALUES ('${districtId}','checkpoint district',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO "${upgradeSchema}"."Institution" ("id","districtId","name","createdAt","updatedAt") VALUES ('${institutionId}','${districtId}','checkpoint institution',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO "${upgradeSchema}"."Teacher" ("id","districtId","name","surname","createdAt","updatedAt") VALUES ('${teacherId}','${districtId}','checkpoint','teacher',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
  );
  const task040Migration = readdirSync(migrationsDir, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.startsWith('20260929050000'))?.name;
  assert.equal(task040Migration, '20260929050000_task_040_current_institution');
  cpSync(join(migrationsDir, migrationName), join(upgradeBundle.migrations, migrationName), { recursive: true });
  cpSync(join(migrationsDir, task083Migration), join(upgradeBundle.migrations, task083Migration), { recursive: true });
  cpSync(join(migrationsDir, task080Migration), join(upgradeBundle.migrations, task080Migration), { recursive: true });
  runPrisma(['migrate', 'deploy'], upgradeUrl, upgradeBundle.schema);

  const legacy = new PrismaClient({ datasources: { db: { url: upgradeUrl } } });
  try {
    await legacy.$connect();
    const upgradedTeacher = await legacy.teacher.findUniqueOrThrow({ where: { id: teacherId } });
    assert.equal(upgradedTeacher.institutionId, null);
    assert.equal(await legacy.institution.count({ where: { id: institutionId, districtId } }), 1);
    const upgradeHistory = await appliedMigrations(legacy);
    assert.ok(upgradeHistory.some((row) => row.migration_name === migrationName));
    assert.ok(upgradeHistory.some((row) => row.migration_name === task081Migration));
    assert.ok(upgradeHistory.some((row) => row.migration_name === task082Migration));
    assert.ok(upgradeHistory.some((row) => row.migration_name === '20261003130000_task_076a_institution_location'));
    assert.ok(upgradeHistory.every((row) => row.finished_at));
  } finally {
    await legacy.$disconnect();
  }
});

after(async () => {
  await cleanDb?.$disconnect();
  if (admin && cleanSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${cleanSchema}" CASCADE`);
  if (admin && upgradeSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${upgradeSchema}" CASCADE`);
  await admin?.$disconnect();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('TASK-047 WeeklySchedule persistence invariants', async (t) => {
  const district = await cleanDb.district.create({ data: { name: 'TASK-047 test district' } });
  const teacherA = await cleanDb.teacher.create({ data: { districtId: district.id, name: 'Teacher', surname: 'A' } });
  const teacherB = await cleanDb.teacher.create({ data: { districtId: district.id, name: 'Teacher', surname: 'B' } });

  await t.test('schema, clean migration, FK ownership and bounded indexes match the contract', async () => {
    const columns = await cleanDb.$queryRaw`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema=${cleanSchema} AND table_name IN ('WeeklySchedule','WeeklyScheduleSlot') ORDER BY table_name, ordinal_position`;
    assert.deepEqual(columns.map(({ table_name, column_name }) => `${table_name}.${column_name}`), [
      'WeeklySchedule.id', 'WeeklySchedule.teacherId', 'WeeklySchedule.academicYear', 'WeeklySchedule.revision', 'WeeklySchedule.createdAt', 'WeeklySchedule.updatedAt',
      'WeeklyScheduleSlot.id', 'WeeklyScheduleSlot.scheduleId', 'WeeklyScheduleSlot.dayOfWeek', 'WeeklyScheduleSlot.startMinute', 'WeeklyScheduleSlot.endMinute', 'WeeklyScheduleSlot.levelLabel', 'WeeklyScheduleSlot.groupLabel', 'WeeklyScheduleSlot.notes', 'WeeklyScheduleSlot.createdAt', 'WeeklyScheduleSlot.updatedAt', 'WeeklyScheduleSlot.teacherId', 'WeeklyScheduleSlot.districtId', 'WeeklyScheduleSlot.institutionId', 'WeeklyScheduleSlot.validFrom', 'WeeklyScheduleSlot.validTo', 'WeeklyScheduleSlot.workplaceBasis',
    ]);
    assert.equal(await cleanDb.$queryRaw`SELECT to_regclass(${`${cleanSchema}.WeeklyScheduleRevision`}) IS NOT NULL AS present`.then((rows) => rows[0].present), false);
    const constraints = await cleanDb.$queryRaw`SELECT conname, contype, confdeltype, confupdtype, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace=${cleanSchema}::regnamespace`;
    const scheduleTeacherFk = constraints.find((row) => row.conname === 'WeeklySchedule_teacherId_fkey');
    const slotScheduleFk = constraints.find((row) => row.conname === 'WeeklyScheduleSlot_scheduleId_fkey');
    assert.equal(scheduleTeacherFk?.contype, 'f');
    assert.equal(scheduleTeacherFk?.confdeltype, 'r');
    assert.equal(scheduleTeacherFk?.confupdtype, 'c');
    assert.equal(slotScheduleFk?.contype, 'f');
    assert.equal(slotScheduleFk?.confdeltype, 'r');
    assert.equal(slotScheduleFk?.confupdtype, 'c');
    assert.ok(constraints.some((row) => row.conname === 'WeeklyScheduleSlot_legacy_no_overlapping_same_day' && row.contype === 'x'));
    assert.ok(constraints.some((row) => row.conname === 'WeeklyScheduleSlot_temporal_no_overlapping_teacher_slots' && row.contype === 'x'));
    const indexes = await cleanDb.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname=${cleanSchema}`;
    assert.ok(indexes.some((row) => row.indexname === 'WeeklySchedule_teacherId_academicYear_key'));
    assert.ok(indexes.some((row) => row.indexname === 'WeeklyScheduleSlot_scheduleId_dayOfWeek_startMinute_endMinute_i'));
    assert.ok(indexes.some((row) => row.indexname === 'WeeklyScheduleSlot_dayOfWeek_startMinute_idx'));
    assert.ok(indexes.some((row) => row.indexname === 'WeeklyScheduleSlot_teacherId_validFrom_validTo_dayOfWeek_idx'));
    assert.ok(columns.some((row) => row.column_name === 'institutionId'));
  });

  await t.test('one schedule per Teacher/year, different years and teachers are allowed; revision defaults to 1', async () => {
    const first = await cleanDb.weeklySchedule.create({ data: { teacherId: teacherA.id, academicYear: '2026-2027' } });
    assert.equal(first.revision, 1);
    assert.ok(first.createdAt instanceof Date);
    assert.ok(first.updatedAt instanceof Date);
    await assert.rejects(cleanDb.weeklySchedule.create({ data: { teacherId: teacherA.id, academicYear: '2026-2027' } }));
    await cleanDb.weeklySchedule.create({ data: { teacherId: teacherA.id, academicYear: '2027-2028' } });
    await cleanDb.weeklySchedule.create({ data: { teacherId: teacherB.id, academicYear: '2026-2027' } });
    await assert.rejects(cleanDb.weeklySchedule.create({ data: { teacherId: teacherA.id, academicYear: '2028-2029', revision: 0 } }));
  });

  await t.test('academicYear check accepts consecutive years and rejects malformed or nonconsecutive values', async () => {
    const acceptedTeacher = await cleanDb.teacher.create({ data: { districtId: district.id, name: 'Teacher', surname: 'Years' } });
    await cleanDb.weeklySchedule.create({ data: { teacherId: acceptedTeacher.id, academicYear: '2026-2027' } });
    await cleanDb.weeklySchedule.create({ data: { teacherId: acceptedTeacher.id, academicYear: '2027-2028' } });
    const rejected = ['2026/2027', '26-27', '2026-2026', '2026-2028', 'abcd-efgh', '2026-20270', '2026-2700', ''];
    for (const academicYear of rejected) {
      await assert.rejects(cleanDb.weeklySchedule.create({ data: { teacherId: acceptedTeacher.id, academicYear } }));
    }
  });

  await t.test('day and minute checks enforce Monday=1..Sunday=7 and inclusive 1440 boundary', async () => {
    const schedule = await cleanDb.weeklySchedule.findUniqueOrThrow({ where: { teacherId_academicYear: { teacherId: teacherA.id, academicYear: '2026-2027' } } });
    for (const [dayOfWeek, startMinute, endMinute] of [[1, 0, 1], [1, 480, 540], [1, 540, 600], [1, 1380, 1440], [7, 480, 600]]) {
      await cleanDb.weeklyScheduleSlot.create({ data: { scheduleId: schedule.id, dayOfWeek, startMinute, endMinute } });
    }
    for (const dayOfWeek of [0, 8, -1]) {
      await assert.rejects(cleanDb.weeklyScheduleSlot.create({ data: { scheduleId: schedule.id, dayOfWeek, startMinute: 10, endMinute: 20 } }));
    }
    for (const [startMinute, endMinute] of [[-1, 1], [0, 1441], [10, 10], [20, 10]]) {
      await assert.rejects(cleanDb.weeklyScheduleSlot.create({ data: { scheduleId: schedule.id, dayOfWeek: 2, startMinute, endMinute } }));
    }
  });

  await t.test('multiple daily slots and adjacent slots are valid; exclusion blocks every overlap shape', async () => {
    const schedule = await cleanDb.weeklySchedule.findUniqueOrThrow({ where: { teacherId_academicYear: { teacherId: teacherA.id, academicYear: '2026-2027' } } });
    const baselines = [
      { day: 2, start: 480, end: 600, overlap: [540, 660] },
      { day: 3, start: 480, end: 720, overlap: [540, 600] },
      { day: 4, start: 480, end: 600, overlap: [480, 600] },
      { day: 5, start: 480, end: 540, overlap: [480, 600] },
      { day: 6, start: 480, end: 600, overlap: [540, 600] },
    ];
    for (const item of baselines) {
      await cleanDb.weeklyScheduleSlot.create({ data: { scheduleId: schedule.id, dayOfWeek: item.day, startMinute: item.start, endMinute: item.end } });
      await assert.rejects(cleanDb.weeklyScheduleSlot.create({ data: { scheduleId: schedule.id, dayOfWeek: item.day, startMinute: item.overlap[0], endMinute: item.overlap[1] } }));
    }
    assert.equal(await cleanDb.weeklyScheduleSlot.count({ where: { scheduleId: schedule.id, dayOfWeek: 1 } }), 4);
    const otherSchedule = await cleanDb.weeklySchedule.findUniqueOrThrow({ where: { teacherId_academicYear: { teacherId: teacherA.id, academicYear: '2027-2028' } } });
    await cleanDb.weeklyScheduleSlot.create({ data: { scheduleId: otherSchedule.id, dayOfWeek: 1, startMinute: 480, endMinute: 600 } });
    const otherTeacherSchedule = await cleanDb.weeklySchedule.findUniqueOrThrow({ where: { teacherId_academicYear: { teacherId: teacherB.id, academicYear: '2026-2027' } } });
    await cleanDb.weeklyScheduleSlot.create({ data: { scheduleId: otherTeacherSchedule.id, dayOfWeek: 1, startMinute: 480, endMinute: 600 } });
  });

  await t.test('text limits use character length for Arabic values and accept exact maxima', async () => {
    const schedule = await cleanDb.weeklySchedule.findUniqueOrThrow({ where: { teacherId_academicYear: { teacherId: teacherA.id, academicYear: '2026-2027' } } });
    const exact = { levelLabel: 'م'.repeat(100), groupLabel: 'ف'.repeat(100), notes: 'ن'.repeat(500) };
    const saved = await cleanDb.weeklyScheduleSlot.create({ data: { scheduleId: schedule.id, dayOfWeek: 2, startMinute: 1000, endMinute: 1100, ...exact } });
    assert.equal(Array.from(saved.levelLabel).length, 100);
    assert.equal(Array.from(saved.groupLabel).length, 100);
    assert.equal(Array.from(saved.notes).length, 500);
    for (const input of [
      { levelLabel: 'م'.repeat(101) },
      { groupLabel: 'ف'.repeat(101) },
      { notes: 'ن'.repeat(501) },
    ]) {
      await assert.rejects(cleanDb.weeklyScheduleSlot.create({ data: { scheduleId: schedule.id, dayOfWeek: 2, startMinute: 1100, endMinute: 1200, ...input } }));
    }
  });

  await t.test('relations restrict parent deletion, permit owned slot deletion, and contain no workplace fields', async () => {
    const schedule = await cleanDb.weeklySchedule.findUniqueOrThrow({ where: { teacherId_academicYear: { teacherId: teacherA.id, academicYear: '2026-2027' } } });
    const slot = await cleanDb.weeklyScheduleSlot.findFirstOrThrow({ where: { scheduleId: schedule.id } });
    await assert.rejects(cleanDb.weeklySchedule.delete({ where: { id: schedule.id } }));
    await assert.rejects(cleanDb.teacher.delete({ where: { id: teacherA.id } }));
    await assert.rejects(cleanDb.weeklyScheduleSlot.create({ data: { scheduleId: randomUUID(), dayOfWeek: 1, startMinute: 1, endMinute: 2 } }));
    await cleanDb.weeklyScheduleSlot.delete({ where: { id: slot.id } });
    assert.equal(await cleanDb.weeklySchedule.count({ where: { id: schedule.id } }), 1);
    const tables = await cleanDb.$queryRaw`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname=${cleanSchema}`;
    assert.equal(tables.some(({ tablename }) => /Revision|Assignment|Holiday|Exception/i.test(tablename)), false);
  });
});
