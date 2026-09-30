import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const rawUrl = readFileSync('D:\\pg-task020-temp\\task020-test-url.secret', 'utf8').trim();
const target = new URL(rawUrl);
if (!['postgres:', 'postgresql:'].includes(target.protocol) || target.hostname !== '127.0.0.1'
  || target.port !== '55432' || target.username !== 'task020_test_user'
  || target.pathname !== '/task020_test' || target.searchParams.get('schema') !== 'public') {
  throw new Error('Refusing to run TASK-045 connected tests outside the approved isolated database.');
}
if (process.env.DATABASE_URL) {
  const ambient = new URL(process.env.DATABASE_URL);
  if (ambient.hostname === target.hostname && ambient.port === target.port && ambient.pathname === target.pathname) {
    throw new Error('Isolated test target must differ from DATABASE_URL.');
  }
}

const runId = randomBytes(6).toString('hex');
const schema = `task045_${process.pid}_${runId}`;
const schemaUrl = new URL(rawUrl); schemaUrl.searchParams.set('schema', schema);
const databaseUrl = schemaUrl.toString();
const apiRequire = createRequire(resolve(root, 'packages/api/package.json'));
const prismaPackagePath = apiRequire.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const { PrismaClient } = apiRequire('@prisma/client');
let admin; let schemaCreated = false; let status = 1;

function runNode(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw new Error('Could not run the isolated TASK-045 E2E command.');
  return result.status ?? 1;
}

try {
  const npmCli = process.env.npm_execpath;
  if (!npmCli || runNode([npmCli, 'run', 'build', '--workspace', '@inspector/api']) !== 0) throw new Error('API build failed before TASK-045 E2E.');
  const publicUrl = new URL(rawUrl); publicUrl.searchParams.set('schema', 'public');
  admin = new PrismaClient({ datasources: { db: { url: publicUrl.toString() } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS database, current_user AS role`;
  if (identity[0]?.database !== 'task020_test' || identity[0]?.role !== 'task020_test_user') throw new Error('Database identity did not match the isolated test target.');
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
  const migration = spawnSync(process.execPath, [prismaPath, 'migrate', 'deploy', '--schema', resolve(root, 'packages/api/prisma/schema.prisma')], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit', windowsHide: true,
  });
  if (migration.error || migration.status !== 0) throw new Error('Could not prepare TASK-045 isolated migrations.');

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const inspectorPassword = `TASK045-${randomUUID()}-synthetic`;
    const { hashPassword } = await import('../packages/api/dist/identity/password.js');
    const inspector = await db.inspector.create({ data: {
      email: `task045-${runId}@example.invalid`, passwordHash: await hashPassword(inspectorPassword), status: 'ACTIVE',
    } });
    const district = await db.district.create({ data: { name: `TASK-045 ${runId}` } });
    await db.inspectorDistrictMembership.create({ data: {
      inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(Date.now() - 60_000),
    } });
    const institution = await db.institution.create({ data: { districtId: district.id, name: `ابتدائية الدليل ${runId}`, municipality: 'الجزائر' } });
    const teachers = [];
    for (let index = 0; index < 32; index += 1) {
      teachers.push(await db.teacher.create({ data: {
        districtId: district.id, institutionId: index % 2 === 0 ? institution.id : null,
        name: index === 0 ? 'أمينة' : `أستاذ ${String(index).padStart(2, '0')}`,
        surname: index === 0 ? `دليل ${runId}` : `لقب ${String(index).padStart(2, '0')}`,
        professionalStatus: ['PERMANENT', 'TRAINEE', 'CONTRACT', 'TEMPORARY_CONTRACT'][index % 4],
        phone: `+213555${String(index).padStart(6, '0')}`, email: `teacher-${index}-${runId}@example.invalid`, recordStatus: 'ACTIVE',
      } }));
    }
    await db.teacher.create({ data: {
      districtId: district.id, name: 'غير نشط', surname: `سجل ${runId}`, recordStatus: 'INACTIVE',
    } });
    await db.weeklySchedule.create({ data: {
      teacherId: teachers[0].id, academicYear: '2026-2027',
      slots: { create: [{ dayOfWeek: 2, startMinute: 480, endMinute: 540 }] },
    } });
    process.env.G3_E2E_DATABASE_URL = databaseUrl;
    process.env.G3_E2E_DISTRICT_ID = district.id;
    process.env.G3_E2E_INSPECTOR_EMAIL = inspector.email;
    process.env.G3_E2E_INSPECTOR_PASSWORD = inspectorPassword;
  } finally { await db.$disconnect(); }

  process.env.TASK045_E2E = '1';
  status = runNode([resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.config.ts']);
} finally {
  delete process.env.G3_E2E_DATABASE_URL; delete process.env.G3_E2E_DISTRICT_ID;
  delete process.env.G3_E2E_INSPECTOR_EMAIL; delete process.env.G3_E2E_INSPECTOR_PASSWORD;
  delete process.env.TASK045_E2E;
  if (admin && schemaCreated) {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    const remaining = await admin.$queryRaw`SELECT to_regnamespace(${schema})::text AS name`;
    if (remaining[0]?.name) throw new Error('TASK-045 temporary database schema cleanup failed.');
  }
  await admin?.$disconnect();
}
process.exitCode = status;
