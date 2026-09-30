import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
const migrationName = '20260929050000_task_040_current_institution';
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
let admin;
let PrismaClient;
let cleanDb;
let cleanSchema;
let upgradeSchema;
let tempMigrations;
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
  const result = spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', selectedSchema], {
    cwd: rootDir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Isolated Prisma command failed (${args[0]}).`);
  }
}

async function migrationState(db) {
  return db.$queryRaw`SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at`;
}

before(async () => {
  const baseUrl = approvedUrl();
  runPrisma(['generate'], baseUrl);
  ({ PrismaClient } = await import('@prisma/client'));
  admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  assert.equal(identity[0]?.db, 'task020_test');
  assert.equal(identity[0]?.role, 'task020_test_user');
  const publicTables = await admin.$queryRaw`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename !~ '^pg_'`;
  const publicMigrations = await admin.$queryRaw`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
  assert.deepEqual(publicTables, []);
  assert.equal(publicMigrations[0]?.present, false);

  cleanSchema = `task040_clean_${process.pid}_${randomBytes(5).toString('hex')}`;
  upgradeSchema = `task040_upgrade_${process.pid}_${randomBytes(5).toString('hex')}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${cleanSchema}"`);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${upgradeSchema}"`);
  const cleanUrl = scopedUrl(baseUrl, cleanSchema);
  runPrisma(['migrate', 'deploy'], cleanUrl);
  runPrisma(['migrate', 'status'], cleanUrl);
  cleanDb = new PrismaClient({ datasources: { db: { url: cleanUrl } } });
  await cleanDb.$connect();

  const cleanHistory = await migrationState(cleanDb);
  assert.ok(cleanHistory.some((row) => row.migration_name === migrationName));
  assert.ok(cleanHistory.every((row) => row.finished_at));

  tempRoot = mkdtempSync(join(tmpdir(), 'task040-prisma-upgrade-'));
  tempMigrations = join(tempRoot, 'migrations');
  const tempSchema = join(tempRoot, 'schema.prisma');
  const tempMigrationLock = join(migrationsDir, 'migration_lock.toml');
  cpSync(tempMigrationLock, join(tempRoot, 'migration_lock.toml'));
  for (const directory of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (directory.isDirectory() && directory.name < migrationName) {
      cpSync(join(migrationsDir, directory.name), join(tempMigrations, directory.name), { recursive: true });
    }
  }
  cpSync(schemaPath, tempSchema);
  const upgradeUrl = scopedUrl(baseUrl, upgradeSchema);
  runPrisma(['migrate', 'deploy'], upgradeUrl, tempSchema);
  const legacyState = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  assert.equal(legacyState[0]?.db, 'task020_test');

  const districtA = randomUUID();
  const districtB = randomUUID();
  const institutionA = randomUUID();
  const submissionId = randomUUID();
  const teacherId = randomUUID();
  await admin.$executeRawUnsafe(`INSERT INTO "${upgradeSchema}"."District" ("id","name","createdAt","updatedAt") VALUES ('${districtA}','legacy A',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),('${districtB}','legacy B',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
  await admin.$executeRawUnsafe(`INSERT INTO "${upgradeSchema}"."Institution" ("id","districtId","name","createdAt","updatedAt") VALUES ('${institutionA}','${districtA}','legacy school',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
  await admin.$executeRawUnsafe(`INSERT INTO "${upgradeSchema}"."Teacher" ("id","districtId","name","surname","createdAt","updatedAt") VALUES ('${teacherId}','${districtA}','Legacy','Teacher',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
  await admin.$executeRawUnsafe(`INSERT INTO "${upgradeSchema}"."TeacherSubmission" ("id","districtId","submittedProfile") VALUES ('${submissionId}','${districtA}','{"primaryInstitutionName":"legacy school","additionalInstitutionNames":["older school"]}'::jsonb)`);
  await admin.$executeRawUnsafe(`UPDATE "${upgradeSchema}"."TeacherSubmission" SET "status"='ACCEPTED', "acceptedTeacherId"='${teacherId}' WHERE "id"='${submissionId}'`);
  const initialRows = await admin.$queryRawUnsafe(`SELECT (SELECT count(*) FROM "${upgradeSchema}"."District") AS districts, (SELECT count(*) FROM "${upgradeSchema}"."Institution") AS institutions, (SELECT count(*) FROM "${upgradeSchema}"."Teacher") AS teachers, (SELECT count(*) FROM "${upgradeSchema}"."TeacherSubmission") AS submissions`);
  assert.deepEqual(Object.values(initialRows[0]).map(Number), [2, 1, 1, 1]);

  cpSync(join(migrationsDir, migrationName), join(tempMigrations, migrationName), { recursive: true });
  runPrisma(['migrate', 'deploy'], upgradeUrl, tempSchema);
  const afterUpgrade = await admin.$queryRawUnsafe(`SELECT i."municipality", i."address", i."directorPhone", t."institutionId", s."submittedProfile" FROM "${upgradeSchema}"."Institution" i CROSS JOIN "${upgradeSchema}"."Teacher" t CROSS JOIN "${upgradeSchema}"."TeacherSubmission" s WHERE i."id"='${institutionA}' AND t."id"='${teacherId}' AND s."id"='${submissionId}'`);
  assert.equal(afterUpgrade[0]?.municipality, null);
  assert.equal(afterUpgrade[0]?.address, null);
  assert.equal(afterUpgrade[0]?.directorPhone, null);
  assert.equal(afterUpgrade[0]?.institutionId, null);
  assert.deepEqual(afterUpgrade[0]?.submittedProfile, { primaryInstitutionName: 'legacy school', additionalInstitutionNames: ['older school'] });
  const finalRows = await admin.$queryRawUnsafe(`SELECT (SELECT count(*) FROM "${upgradeSchema}"."District") AS districts, (SELECT count(*) FROM "${upgradeSchema}"."Institution") AS institutions, (SELECT count(*) FROM "${upgradeSchema}"."Teacher") AS teachers, (SELECT count(*) FROM "${upgradeSchema}"."TeacherSubmission") AS submissions`);
  assert.deepEqual(Object.values(finalRows[0]).map(Number), [2, 1, 1, 1]);
});

after(async () => {
  await cleanDb?.$disconnect();
  if (admin && cleanSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${cleanSchema}" CASCADE`);
  if (admin && upgradeSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${upgradeSchema}" CASCADE`);
  await admin?.$disconnect();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('clean migration chain creates nullable workplace fields and composite same-district relation', async () => {
  const columns = await cleanDb.$queryRaw`SELECT table_name, column_name, is_nullable, data_type FROM information_schema.columns WHERE table_schema=${cleanSchema} AND ((table_name='Institution' AND column_name IN ('municipality','address','directorPhone')) OR (table_name='Teacher' AND column_name='institutionId')) ORDER BY table_name,column_name`;
  assert.deepEqual(columns.map((row) => `${row.table_name}.${row.column_name}:${row.is_nullable}`).sort(), [
    'Institution.address:YES', 'Institution.directorPhone:YES', 'Institution.municipality:YES', 'Teacher.institutionId:YES',
  ]);
  assert.equal(columns.find((row) => row.column_name === 'institutionId')?.data_type, 'uuid');
  const constraints = await cleanDb.$queryRaw`SELECT conname, confdeltype, confupdtype, convalidated, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace=${cleanSchema}::regnamespace AND conname IN ('Institution_id_districtId_key','Teacher_institutionId_districtId_fkey')`;
  const fk = constraints.find((row) => row.conname === 'Teacher_institutionId_districtId_fkey');
  assert.equal(fk?.confdeltype, 'r');
  assert.equal(fk?.confupdtype, 'c');
  assert.equal(fk?.convalidated, true);
  assert.match(fk?.definition ?? '', /FOREIGN KEY \("institutionId", "districtId"\) REFERENCES "Institution"\(id, "districtId"\)/);
  const indexes = await cleanDb.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname=${cleanSchema}`;
  assert.ok(indexes.some((row) => row.indexname === 'Teacher_institutionId_idx'));
  assert.ok(indexes.some((row) => row.indexname === 'Institution_id_districtId_key'));
});

test('database accepts NULL, same-district links and shared Institutions, while rejecting cross-district and missing targets', async () => {
  const districtA = await cleanDb.district.create({ data: { name: 'TASK-040 A' } });
  const districtB = await cleanDb.district.create({ data: { name: 'TASK-040 B' } });
  const institutionA = await cleanDb.institution.create({ data: {
    districtId: districtA.id, name: 'School A', municipality: 'بلدية تجريبية',
    address: 'عنوان تجريبي', directorPhone: '+213555123456',
  } });
  assert.equal(institutionA.municipality, 'بلدية تجريبية');
  assert.equal(institutionA.address, 'عنوان تجريبي');
  assert.equal(institutionA.directorPhone, '+213555123456');
  const institutionB = await cleanDb.institution.create({ data: { districtId: districtB.id, name: 'School B' } });
  const teacherData = { districtId: districtA.id, name: 'Teacher', surname: 'One' };
  const unassigned = await cleanDb.teacher.create({ data: teacherData });
  assert.equal(unassigned.institutionId, null);
  const linked = await cleanDb.teacher.create({ data: { ...teacherData, name: 'Teacher', surname: 'Two', institutionId: institutionA.id } });
  assert.equal(linked.institutionId, institutionA.id);
  const shared = await cleanDb.teacher.create({ data: { ...teacherData, name: 'Teacher', surname: 'Three', institutionId: institutionA.id } });
  assert.equal(shared.institutionId, institutionA.id);
  await assert.rejects(cleanDb.teacher.create({ data: { ...teacherData, name: 'Teacher', surname: 'Cross', institutionId: institutionB.id } }));
  await assert.rejects(cleanDb.teacher.create({ data: { ...teacherData, name: 'Teacher', surname: 'Missing', institutionId: randomUUID() } }));
  await assert.rejects(cleanDb.institution.delete({ where: { id: institutionA.id } }));
  assert.equal(await cleanDb.teacher.count({ where: { institutionId: institutionA.id } }), 2);
  await cleanDb.teacher.deleteMany({ where: { id: { in: [unassigned.id, linked.id, shared.id] } } });
  await cleanDb.institution.delete({ where: { id: institutionA.id } });
  await cleanDb.institution.delete({ where: { id: institutionB.id } });
  await cleanDb.district.deleteMany({ where: { id: { in: [districtA.id, districtB.id] } } });
});
