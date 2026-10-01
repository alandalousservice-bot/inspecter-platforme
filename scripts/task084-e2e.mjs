import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const credentialText = readFileSync('D:\\pg-task020-temp\\task020-test-url.secret', 'utf8').trim();
const rawUrl = credentialText.match(/^(?:TEST_DATABASE_URL|DATABASE_URL)=(.*)$/u)?.[1]?.trim() ?? credentialText;
const parsed = new URL(rawUrl);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.hostname !== '127.0.0.1' || parsed.port !== '55432'
  || decodeURIComponent(parsed.username) !== 'task020_test_user' || parsed.pathname !== '/task020_test') throw new Error('Refusing an unapproved TASK-084 test database.');

const tag = randomBytes(6).toString('hex');
const schema = `task084_e2e_${process.pid}_${tag}`;
const isolated = new URL(rawUrl); isolated.searchParams.set('schema', schema);
const databaseUrl = isolated.toString();
const apiRequire = createRequire(resolve(root, 'packages/api/package.json'));
const prismaPackagePath = apiRequire.resolve('prisma/package.json');
const prismaPath = resolve(dirname(prismaPackagePath), JSON.parse(readFileSync(prismaPackagePath, 'utf8')).bin.prisma);
const { PrismaClient } = apiRequire('@prisma/client');
let admin; let schemaCreated = false; let exitCode = 1;
function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw new Error('Could not start TASK-084 verification.');
  return result.status ?? 1;
}
function localDate(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function addDays(value, amount) {
  const result = new Date(`${value}T00:00:00.000Z`); result.setUTCDate(result.getUTCDate() + amount);
  return result.toISOString().slice(0, 10);
}

try {
  if (!process.env.npm_execpath || run([process.env.npm_execpath, 'run', 'build']) !== 0) throw new Error('Repository build failed before TASK-084 E2E.');
  admin = new PrismaClient({ datasources: { db: { url: rawUrl } } }); await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port`;
  const actual = identity[0];
  if (actual?.database !== 'task020_test' || actual?.role !== 'task020_test_user'
    || !/^127\.0\.0\.1(?:\/\d+)?$/u.test(actual?.address ?? '') || actual?.port !== 55432) throw new Error('Isolated DB identity mismatch.');
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
  const migrated = spawnSync(process.execPath, [prismaPath, 'migrate', 'deploy', '--schema', resolve(root, 'packages/api/prisma/schema.prisma')], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit', windowsHide: true,
  });
  if (migrated.error || migrated.status !== 0) throw new Error('TASK-084 isolated E2E schema migration failed.');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const password = `task084-${randomUUID()}-synthetic`;
  let teacher; let supplementary; let inspector; let district;
  const today = localDate(new Date()); const started = addDays(today, -1);
  const academicStart = Number(today.slice(5, 7)) >= 9 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const academicYear = `${academicStart}-${academicStart + 1}`;
  const { hashPassword } = await import('../packages/api/dist/identity/password.js');
  try {
    district = await db.district.create({ data: { name: `مقاطعة البطاقة ${tag}` } });
    inspector = await db.inspector.create({ data: { email: `task084-${tag}@example.invalid`, passwordHash: await hashPassword(password), status: 'ACTIVE', name: 'مفتش تجريبي', surname: 'للبطاقة' } });
    await db.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(`${addDays(today, -30)}T00:00:00.000Z`) } });
    const home = await db.institution.create({ data: { districtId: district.id, name: `المؤسسة الأم ${tag}`, municipality: 'بلدية الاختبار', email: 'home@example.invalid' } });
    supplementary = await db.institution.create({ data: { districtId: district.id, name: `مؤسسة تكملة ${tag}` } });
    teacher = await db.teacher.create({ data: {
      districtId: district.id, institutionId: home.id, name: `أستاذ البطاقة ${tag}`, surname: 'اختبار',
      professionalStatus: 'SUBSTITUTE', qualifications: 'مؤهل قديم غير مفصل', administrativeNote: 'ملاحظة إدارية اصطناعية',
    } });
    await db.teacherSupplementaryWorkplace.create({ data: { teacherId: teacher.id, districtId: district.id, institutionId: supplementary.id, validFrom: new Date(`${started}T00:00:00.000Z`) } });
    await db.teacherQualification.create({ data: { teacherId: teacher.id, name: 'شهادة منظمة', issuingBody: 'جهة اصطناعية', qualificationDate: new Date(`${started}T00:00:00.000Z`) } });
    await db.weeklySchedule.create({ data: { teacherId: teacher.id, academicYear, slots: { create: [{
      institutionId: supplementary.id, teacherId: teacher.id, districtId: district.id,
      validFrom: new Date(`${started}T00:00:00.000Z`), dayOfWeek: 1, startMinute: 480, endMinute: 540, workplaceBasis: 'SUPPLEMENTARY',
    }] } } });
    const promotion = await db.pedagogicalVisit.create({ data: {
      districtId: district.id, inspectorId: inspector.id, teacherId: teacher.id, institutionId: home.id,
      institutionNameSnapshot: home.name, academicYear, visitType: 'PROMOTION_EVALUATION', status: 'COMPLETED',
      scheduledStartAt: new Date(`${started}T08:00:00.000Z`), scheduledEndAt: new Date(`${started}T09:00:00.000Z`), occurredAt: new Date(`${started}T09:00:00.000Z`),
    } });
    await db.inspectionReport.create({ data: {
      visitId: promotion.id, reportType: 'INSPECTOR_VISIT', templateSource: 'PRODUCT_OWNER_ADOPTED', templateVersion: 1,
      status: 'FINAL', levelClass: 'قسم اصطناعي', lessonTopic: 'موضوع', inspectorConclusion: 'خلاصة',
      finalizedAt: new Date(`${started}T10:00:00.000Z`), finalizedByInspectorId: inspector.id,
      finalizedInspectorNameSnapshot: inspector.name, finalizedInspectorSurnameSnapshot: inspector.surname,
      finalizedTeacherNameSnapshot: teacher.name, finalizedTeacherSurnameSnapshot: teacher.surname, pedagogicalMark: '15.50',
    } });
    const currentVisit = addDays(today, -0);
    await db.pedagogicalVisit.create({ data: {
      districtId: district.id, inspectorId: inspector.id, teacherId: teacher.id, institutionId: home.id,
      institutionNameSnapshot: home.name, academicYear, visitType: 'MONITORING_FOLLOW_UP', status: 'COMPLETED',
      scheduledStartAt: new Date(`${currentVisit}T08:00:00.000Z`), scheduledEndAt: new Date(`${currentVisit}T09:00:00.000Z`), occurredAt: new Date(`${currentVisit}T09:00:00.000Z`),
    } });
  } finally { await db.$disconnect(); }

  process.env.G3_E2E_DATABASE_URL = databaseUrl;
  process.env.G3_E2E_INSPECTOR_EMAIL = inspector.email;
  process.env.G3_E2E_INSPECTOR_PASSWORD = password;
  process.env.TASK084_E2E_TEACHER_ID = teacher.id;
  process.env.TASK084_E2E_ACADEMIC_YEAR = academicYear;
  process.env.TASK084_E2E_SUPPLEMENTARY_NAME = supplementary.name;
  process.env.TASK084_E2E = '1';
  exitCode = run([resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.config.ts']);
} finally {
  for (const name of ['G3_E2E_DATABASE_URL', 'G3_E2E_INSPECTOR_EMAIL', 'G3_E2E_INSPECTOR_PASSWORD', 'TASK084_E2E_TEACHER_ID', 'TASK084_E2E_ACADEMIC_YEAR', 'TASK084_E2E_SUPPLEMENTARY_NAME', 'TASK084_E2E']) delete process.env[name];
  process.env.PGPASSWORD = '';
  delete process.env.PGPASSWORD;
  if (admin && schemaCreated) {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    const left = await admin.$queryRaw`SELECT to_regnamespace(${schema})::text AS name`;
    if (left[0]?.name) throw new Error('TASK-084 temporary schema cleanup failed.');
  }
  await admin?.$disconnect();
}
process.exitCode = exitCode;
