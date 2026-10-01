import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const source = readFileSync('D:\\pg-task020-temp\\task020-test-url.secret', 'utf8').trim();
const rawUrl = source.match(/^(?:TEST_DATABASE_URL|DATABASE_URL)=(.*)$/u)?.[1]?.trim() ?? source;
const parsed = new URL(rawUrl);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.hostname !== '127.0.0.1' || parsed.port !== '55432'
  || decodeURIComponent(parsed.username) !== 'task020_test_user' || parsed.pathname !== '/task020_test') throw new Error('Refusing an unapproved TASK-082 test database.');

const runId = randomBytes(6).toString('hex'); const schema = `task082_e2e_${process.pid}_${runId}`;
const isolated = new URL(rawUrl); isolated.searchParams.set('schema', schema); const databaseUrl = isolated.toString();
const apiRequire = createRequire(resolve(root, 'packages/api/package.json'));
const prismaPackage = apiRequire.resolve('prisma/package.json');
const prismaPath = resolve(dirname(prismaPackage), JSON.parse(readFileSync(prismaPackage, 'utf8')).bin.prisma);
const { PrismaClient } = apiRequire('@prisma/client');
let admin; let schemaCreated = false; let exitCode = 1;
function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw new Error('Could not start TASK-082 connected verification.');
  return result.status ?? 1;
}

try {
  if (!process.env.npm_execpath || run([process.env.npm_execpath, 'run', 'build', '--workspace', '@inspector/api']) !== 0) throw new Error('TASK-082 API build failed.');
  admin = new PrismaClient({ datasources: { db: { url: rawUrl } } }); await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port`;
  const actual = identity[0];
  if (actual?.database !== 'task020_test' || actual?.role !== 'task020_test_user'
    || !/^127\.0\.0\.1(?:\/\d+)?$/u.test(actual?.address ?? '') || actual?.port !== 55432) throw new Error('Isolated DB identity mismatch.');
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
  const migration = spawnSync(process.execPath, [prismaPath, 'migrate', 'deploy', '--schema', resolve(root, 'packages/api/prisma/schema.prisma')], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit', windowsHide: true,
  });
  if (migration.error || migration.status !== 0) throw new Error('TASK-082 isolated migration failed.');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let password; let inspector; let teacher; let home; let supplementary; let schedule; let visit;
  try {
    const { hashPassword } = await import('../packages/api/dist/identity/password.js');
    password = `task082-${randomUUID()}-synthetic`;
    const district = await db.district.create({ data: { name: `TASK-082 ${runId}` } });
    inspector = await db.inspector.create({ data: { email: `task082-${runId}@example.invalid`, passwordHash: await hashPassword(password), status: 'ACTIVE', name: 'مفتش تجريبي', surname: 'للاختبار' } });
    await db.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(Date.now() - 60_000) } });
    home = await db.institution.create({ data: { districtId: district.id, name: `الأم ${runId}` } });
    supplementary = await db.institution.create({ data: { districtId: district.id, name: `مؤسسة تكملة ${runId}` } });
    teacher = await db.teacher.create({ data: { districtId: district.id, institutionId: home.id, name: 'أستاذ', surname: 'للاختبار', institutionAppointmentDate: new Date('2020-01-01T00:00:00Z'), institutionAppointmentNumber: 'E2E-1' } });
    schedule = await db.weeklySchedule.create({ data: { teacherId: teacher.id, academicYear: '2026-2027', slots: { create: [{ dayOfWeek: 1, startMinute: 480, endMinute: 540 }] } } });
    visit = await db.pedagogicalVisit.create({ data: { districtId: district.id, inspectorId: inspector.id, teacherId: teacher.id, institutionId: home.id, institutionNameSnapshot: home.name, academicYear: '2026-2027', visitType: 'GUIDANCE', scheduledStartAt: new Date('2027-01-01T08:00:00Z'), scheduledEndAt: new Date('2027-01-01T09:00:00Z') } });
  } finally { await db.$disconnect(); }
  process.env.G3_E2E_DATABASE_URL = databaseUrl;
  process.env.G3_E2E_INSPECTOR_EMAIL = inspector.email;
  process.env.G3_E2E_INSPECTOR_PASSWORD = password;
  process.env.TASK082_E2E_TEACHER_ID = teacher.id;
  process.env.TASK082_E2E_HOME_NAME = home.name;
  process.env.TASK082_E2E_SUPPLEMENTARY_NAME = supplementary.name;
  process.env.TASK082_E2E_HOME_ID = home.id;
  process.env.TASK082_E2E_SUPPLEMENTARY_ID = supplementary.id;
  process.env.TASK082_E2E_SCHEDULE_ID = schedule.id;
  process.env.TASK082_E2E_VISIT_ID = visit.id;
  process.env.TASK082_E2E = '1';
  exitCode = run([resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.config.ts']);
} finally {
  for (const name of ['G3_E2E_DATABASE_URL', 'G3_E2E_INSPECTOR_EMAIL', 'G3_E2E_INSPECTOR_PASSWORD', 'TASK082_E2E_TEACHER_ID', 'TASK082_E2E_HOME_NAME', 'TASK082_E2E_SUPPLEMENTARY_NAME', 'TASK082_E2E_HOME_ID', 'TASK082_E2E_SUPPLEMENTARY_ID', 'TASK082_E2E_SCHEDULE_ID', 'TASK082_E2E_VISIT_ID', 'TASK082_E2E']) delete process.env[name];
  if (admin && schemaCreated) {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    const left = await admin.$queryRaw`SELECT to_regnamespace(${schema})::text AS name`;
    if (left[0]?.name) throw new Error('TASK-082 temporary schema cleanup failed.');
  }
  await admin?.$disconnect();
  process.env.PGPASSWORD = '';
  delete process.env.PGPASSWORD;
}
process.exitCode = exitCode;
