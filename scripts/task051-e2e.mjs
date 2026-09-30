import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const secretPath = 'D:\\pg-task020-temp\\task020-test-url.secret';
const rawUrl = readFileSync(secretPath, 'utf8').trim();
let target;
try { target = new URL(rawUrl); } catch { throw new Error('Unable to validate the isolated TASK-051 database target.'); }
if (!['postgres:', 'postgresql:'].includes(target.protocol) || target.hostname !== '127.0.0.1'
  || target.port !== '55432' || target.username !== 'task020_test_user' || target.pathname !== '/task020_test'
  || target.searchParams.get('schema') !== 'public') throw new Error('Refusing an unapproved TASK-051 database target.');
if (process.env.DATABASE_URL) {
  const configured = new URL(process.env.DATABASE_URL);
  if (configured.hostname === target.hostname && configured.port === target.port && configured.pathname === target.pathname) throw new Error('Connected test schema must differ from the default database schema.');
}

const runId = randomBytes(6).toString('hex');
const schema = `task051_${process.pid}_${runId}`;
const isolatedUrl = new URL(rawUrl); isolatedUrl.searchParams.set('schema', schema);
const databaseUrl = isolatedUrl.toString();
const apiRequire = createRequire(resolve(root, 'packages/api/package.json'));
const prismaPackagePath = apiRequire.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const { PrismaClient } = apiRequire('@prisma/client');
let admin; let schemaCreated = false; let exitCode = 1;

function runNode(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw new Error('Could not run the isolated TASK-051 connected tests.');
  return result.status ?? 1;
}

try {
  const npmCli = process.env.npm_execpath;
  if (!npmCli || runNode([npmCli, 'run', 'build', '--workspace', '@inspector/api']) !== 0) throw new Error('API build failed before TASK-051 E2E.');
  const publicUrl = new URL(rawUrl); publicUrl.searchParams.set('schema', 'public');
  admin = new PrismaClient({ datasources: { db: { url: publicUrl.toString() } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS database, current_user AS role`;
  if (identity[0]?.database !== 'task020_test' || identity[0]?.role !== 'task020_test_user') throw new Error('Database identity did not match the isolated test target.');
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
  const migration = spawnSync(process.execPath, [prismaPath, 'migrate', 'deploy', '--schema', resolve(root, 'packages/api/prisma/schema.prisma')], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit', windowsHide: true,
  });
  if (migration.error || migration.status !== 0) throw new Error('Could not prepare TASK-051 isolated migrations.');

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let email; let password;
  try {
    const { hashPassword } = await import('../packages/api/dist/identity/password.js');
    password = `TASK051-${randomUUID()}-synthetic`;
    email = `task051-${runId}@example.invalid`;
    const inspector = await db.inspector.create({ data: { email, passwordHash: await hashPassword(password), status: 'ACTIVE' } });
    const district = await db.district.create({ data: { name: `TASK-051 ${runId}` } });
    await db.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(Date.now() - 60_000) } });
    const institution = await db.institution.create({ data: { districtId: district.id, name: 'ابتدائية TASK-051 الأصلية', municipality: 'الجزائر' } });
    const teacherInside = await db.teacher.create({ data: { districtId: district.id, institutionId: institution.id, name: 'محمد', surname: 'زيارة داخل الجدول', recordStatus: 'ACTIVE' } });
    const teacherOutside = await db.teacher.create({ data: { districtId: district.id, institutionId: institution.id, name: 'ليلى', surname: 'زيارة خارج الجدول', recordStatus: 'ACTIVE' } });
    await db.weeklySchedule.create({ data: { teacherId: teacherInside.id, academicYear: '2026-2027', slots: { create: [{ dayOfWeek: 2, startMinute: 480, endMinute: 600 }] } } });
    await db.weeklySchedule.create({ data: { teacherId: teacherOutside.id, academicYear: '2026-2027', slots: { create: [{ dayOfWeek: 2, startMinute: 480, endMinute: 600 }] } } });
    process.env.G3_E2E_DISTRICT_ID = district.id;
    process.env.TASK051_TEACHER_INSIDE_ID = teacherInside.id;
    process.env.TASK051_TEACHER_OUTSIDE_ID = teacherOutside.id;
    process.env.TASK051_INSTITUTION_ID = institution.id;
  } finally { await db.$disconnect(); }

  process.env.G3_E2E_DATABASE_URL = databaseUrl;
  process.env.G3_E2E_INSPECTOR_EMAIL = email;
  process.env.G3_E2E_INSPECTOR_PASSWORD = password;
  process.env.TASK051_E2E = '1';
  process.env.TASK053A_E2E = '1';
  exitCode = runNode([resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.config.ts']);
} finally {
  for (const key of ['G3_E2E_DATABASE_URL', 'G3_E2E_DISTRICT_ID', 'G3_E2E_INSPECTOR_EMAIL', 'G3_E2E_INSPECTOR_PASSWORD', 'TASK051_E2E', 'TASK053A_E2E', 'TASK051_TEACHER_INSIDE_ID', 'TASK051_TEACHER_OUTSIDE_ID', 'TASK051_INSTITUTION_ID']) delete process.env[key];
  if (admin && schemaCreated) {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    const remaining = await admin.$queryRaw`SELECT to_regnamespace(${schema})::text AS name`;
    if (remaining[0]?.name) throw new Error('TASK-051 temporary schema cleanup failed.');
  }
  await admin?.$disconnect();
}
process.exitCode = exitCode;
