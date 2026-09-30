import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const secretPath = 'D:\\pg-task020-temp\\task020-test-url.secret';
const rawUrl = readFileSync(secretPath, 'utf8').trim();
let parsed;
try { parsed = new URL(rawUrl); } catch { throw new Error('Cannot validate the isolated TASK-052 database target.'); }
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.hostname !== '127.0.0.1' || parsed.port !== '55432'
  || parsed.username !== 'task020_test_user' || parsed.pathname !== '/task020_test' || parsed.searchParams.get('schema') !== 'public') throw new Error('Refusing an unapproved TASK-052 test database.');
const runId = randomBytes(6).toString('hex'); const schema = `task052_e2e_${process.pid}_${runId}`;
const isolated = new URL(rawUrl); isolated.searchParams.set('schema', schema); const databaseUrl = isolated.toString();
const apiRequire = createRequire(resolve(root, 'packages/api/package.json'));
const prismaPackagePath = apiRequire.resolve('prisma/package.json');
const prismaPath = resolve(dirname(prismaPackagePath), JSON.parse(readFileSync(prismaPackagePath, 'utf8')).bin.prisma);
const { PrismaClient } = apiRequire('@prisma/client');
let admin; let schemaCreated = false; let exitCode = 1;
function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw new Error('Could not start the TASK-052 connected verification process.');
  return result.status ?? 1;
}

try {
  if (!process.env.npm_execpath || run([process.env.npm_execpath, 'run', 'build', '--workspace', '@inspector/api']) !== 0) throw new Error('TASK-052 API build failed.');
  admin = new PrismaClient({ datasources: { db: { url: rawUrl } } }); await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  if (identity[0]?.db !== 'task020_test' || identity[0]?.role !== 'task020_test_user') throw new Error('Isolated DB identity mismatch.');
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
  const migration = spawnSync(process.execPath, [prismaPath, 'migrate', 'deploy', '--schema', resolve(root, 'packages/api/prisma/schema.prisma')], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit', windowsHide: true });
  if (migration.error || migration.status !== 0) throw new Error('TASK-052 isolated migration failed.');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let email; let password;
  try {
    const { hashPassword } = await import('../packages/api/dist/identity/password.js');
    password = `task052-${randomUUID()}-synthetic`; email = `task052-${runId}@example.invalid`;
    const inspector = await db.inspector.create({ data: { email, passwordHash: await hashPassword(password), status: 'ACTIVE', name: 'مفتش', surname: 'تجريبي' } });
    const district = await db.district.create({ data: { name: `TASK-052 ${runId}` } });
    await db.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(Date.now() - 60_000) } });
    const institution = await db.institution.create({ data: { districtId: district.id, name: 'ابتدائية الاختبار' } });
    const teacher = await db.teacher.create({ data: { districtId: district.id, institutionId: institution.id, name: 'ليلى', surname: 'علي' } });
    const ids = [];
    for (const day of [5, 6, 7]) {
      const start = new Date(`2026-10-${String(day).padStart(2, '0')}T08:00:00.000Z`);
      const visit = await db.pedagogicalVisit.create({ data: { districtId: district.id, inspectorId: inspector.id, teacherId: teacher.id, institutionId: institution.id,
        institutionNameSnapshot: institution.name, academicYear: '2026-2027', scheduledStartAt: start, scheduledEndAt: new Date(start.getTime() + 3_600_000) } });
      ids.push(visit.id);
    }
    process.env.G3_E2E_INSPECTOR_EMAIL = email; process.env.G3_E2E_INSPECTOR_PASSWORD = password;
    process.env.TASK052_PLANNED_VISIT_ID = ids[0]; process.env.TASK052_CANCEL_VISIT_ID = ids[1]; process.env.TASK052_CONFLICT_VISIT_ID = ids[2];
  } finally { await db.$disconnect(); }
  process.env.G3_E2E_DATABASE_URL = databaseUrl; process.env.TASK052_E2E = '1';
  exitCode = run([resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.config.ts']);
} finally {
  for (const name of ['G3_E2E_DATABASE_URL', 'G3_E2E_INSPECTOR_EMAIL', 'G3_E2E_INSPECTOR_PASSWORD', 'TASK052_E2E', 'TASK052_PLANNED_VISIT_ID', 'TASK052_CANCEL_VISIT_ID', 'TASK052_CONFLICT_VISIT_ID']) delete process.env[name];
  if (admin && schemaCreated) {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    const left = await admin.$queryRaw`SELECT to_regnamespace(${schema})::text AS name`;
    if (left[0]?.name) throw new Error('TASK-052 temporary schema cleanup failed.');
  }
  await admin?.$disconnect();
}
process.exitCode = exitCode;
