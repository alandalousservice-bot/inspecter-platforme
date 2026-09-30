import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd(); const secretPath = 'D:\\pg-task020-temp\\task020-test-url.secret';
const source = readFileSync(secretPath, 'utf8').trim();
const rawUrl = source.match(/^(?:TEST_DATABASE_URL|DATABASE_URL)=(.*)$/u)?.[1]?.trim() ?? source;
const parsed = new URL(rawUrl);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.hostname !== '127.0.0.1' || parsed.port !== '55432'
  || parsed.username !== 'task020_test_user' || parsed.pathname !== '/task020_test' || parsed.searchParams.get('schema') !== 'public') throw new Error('Refusing an unapproved TASK-054 test database.');
const runId = randomBytes(6).toString('hex'); const schema = `task054_e2e_${process.pid}_${runId}`;
const isolated = new URL(rawUrl); isolated.searchParams.set('schema', schema); const databaseUrl = isolated.toString();
const apiRequire = createRequire(resolve(root, 'packages/api/package.json'));
const prismaPackage = apiRequire.resolve('prisma/package.json');
const prismaPath = resolve(dirname(prismaPackage), JSON.parse(readFileSync(prismaPackage, 'utf8')).bin.prisma);
const { PrismaClient } = apiRequire('@prisma/client');
let admin; let schemaCreated = false; let exitCode = 1;
function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw new Error('Could not start TASK-054 connected verification.');
  return result.status ?? 1;
}

try {
  if (!process.env.npm_execpath || run([process.env.npm_execpath, 'run', 'build', '--workspace', '@inspector/api']) !== 0) throw new Error('TASK-054 API build failed.');
  admin = new PrismaClient({ datasources: { db: { url: rawUrl } } }); await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS database,current_user AS role`;
  if (identity[0]?.database !== 'task020_test' || identity[0]?.role !== 'task020_test_user') throw new Error('Isolated DB identity mismatch.');
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
  const migration = spawnSync(process.execPath, [prismaPath, 'migrate', 'deploy', '--schema', resolve(root, 'packages/api/prisma/schema.prisma')], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit', windowsHide: true,
  });
  if (migration.error || migration.status !== 0) throw new Error('TASK-054 isolated migration failed.');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } }); let password; let visit;
  try {
    const { hashPassword } = await import('../packages/api/dist/identity/password.js');
    password = `task054-${randomUUID()}-synthetic`;
    const inspector = await db.inspector.create({ data: { email: `task054-${runId}@example.invalid`, passwordHash: await hashPassword(password), status: 'ACTIVE', name: 'مفتش TASK-054', surname: 'تجريبي' } });
    const district = await db.district.create({ data: { name: `TASK-054 ${runId}` } });
    await db.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(Date.now() - 60_000) } });
    const institution = await db.institution.create({ data: { districtId: district.id, name: 'ابتدائية الاختبار' } });
    const teacher = await db.teacher.create({ data: { districtId: district.id, institutionId: institution.id, name: 'ليلى', surname: 'تجريبية' } });
    const start = new Date('2028-03-12T08:00:00.000Z');
    visit = await db.pedagogicalVisit.create({ data: { districtId: district.id, inspectorId: inspector.id, teacherId: teacher.id, institutionId: institution.id,
      institutionNameSnapshot: institution.name, academicYear: '2027-2028', visitType: 'PROMOTION_EVALUATION', status: 'COMPLETED', occurredAt: new Date(),
      scheduledStartAt: start, scheduledEndAt: new Date(start.getTime() + 3_600_000) } });
    process.env.G3_E2E_INSPECTOR_EMAIL = inspector.email; process.env.G3_E2E_INSPECTOR_PASSWORD = password;
    process.env.TASK054_E2E_VISIT_ID = visit.id;
  } finally { await db.$disconnect(); }
  process.env.G3_E2E_DATABASE_URL = databaseUrl; process.env.TASK054_E2E = '1';
  exitCode = run([resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.config.ts']);
  if (exitCode === 0) {
    const verify = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const report = await verify.inspectionReport.findUniqueOrThrow({ where: { visitId: visit.id } });
      if (report.status !== 'FINAL' || report.reportType !== 'INSPECTOR_VISIT' || report.pedagogicalMark?.toFixed(2) !== '14.25') throw new Error('TASK-054 connected report verification failed.');
    } finally { await verify.$disconnect(); }
  }
} finally {
  for (const name of ['G3_E2E_DATABASE_URL', 'G3_E2E_INSPECTOR_EMAIL', 'G3_E2E_INSPECTOR_PASSWORD', 'TASK054_E2E', 'TASK054_E2E_VISIT_ID']) delete process.env[name];
  if (admin && schemaCreated) {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    const left = await admin.$queryRaw`SELECT to_regnamespace(${schema})::text AS name`;
    if (left[0]?.name) throw new Error('TASK-054 temporary schema cleanup failed.');
  }
  await admin?.$disconnect();
}
process.exitCode = exitCode;
