import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const apiRequire = createRequire(resolve(root, 'packages/api/package.json'));
let PrismaClient;
const secretPath = 'D:\\pg-task020-temp\\task020-test-url.secret';
const rawUrl = readFileSync(secretPath, 'utf8').trim();
let approved;
try { approved = new URL(rawUrl); } catch { throw new Error('Unable to validate the isolated database target.'); }
if (!['postgres:', 'postgresql:'].includes(approved.protocol)
  || approved.hostname !== '127.0.0.1'
  || approved.port !== '55432'
  || approved.username !== 'task020_test_user'
  || approved.pathname !== '/task020_test'
  || approved.searchParams.get('schema') !== 'public') {
  throw new Error('Refusing to run G3 E2E against an unapproved database target.');
}

const runId = randomBytes(6).toString('hex');
const schema = `g3_e2e_${process.pid}_${runId}`;
const schemaUrl = new URL(rawUrl);
schemaUrl.searchParams.set('schema', schema);
const databaseUrl = schemaUrl.toString();
const prismaPackagePath = apiRequire.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const webUrl = new URL(rawUrl);
webUrl.searchParams.set('schema', 'public');
let admin;
let exitCode = 1;
let schemaCreated = false;

function runNode(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw new Error('Could not run the connected G3 test command.');
  return result.status ?? 1;
}

try {
  const npmCli = process.env.npm_execpath;
  if (!npmCli || runNode([npmCli, 'run', 'build', '--workspace', '@inspector/api']) !== 0) {
    throw new Error('API build failed before connected G3 E2E.');
  }
  ({ PrismaClient } = apiRequire('@prisma/client'));

  admin = new PrismaClient({ datasources: { db: { url: webUrl.toString() } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS database, current_user AS role`;
  if (identity[0]?.database !== 'task020_test' || identity[0]?.role !== 'task020_test_user') {
    throw new Error('Connected database identity did not match the isolated test target.');
  }
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;

  const migration = spawnSync(process.execPath, [prismaPath, 'migrate', 'deploy', '--schema', resolve(root, 'packages/api/prisma/schema.prisma')], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit', windowsHide: true,
  });
  if (migration.error || migration.status !== 0) throw new Error('Could not prepare the isolated G3 schema migrations.');

  const { hashPassword } = await import('../packages/api/dist/identity/password.js');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const inspectorPassword = `G3-E2E-${randomUUID()}-synthetic`;
    const inspector = await db.inspector.create({
      data: {
        email: `g3-e2e-${runId}@example.invalid`,
        passwordHash: await hashPassword(inspectorPassword),
        status: 'ACTIVE',
      },
    });
    const district = await db.district.create({ data: { name: `G3 E2E ${runId}` } });
    await db.inspectorDistrictMembership.create({
      data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(Date.now() - 60_000) },
    });
    await db.teacherSubmission.create({
      data: {
        districtId: district.id,
        status: 'PENDING',
        submittedProfile: {
          firstName: 'مرشح', lastName: 'مشابه', dateOfBirth: '1985-03-04', placeOfBirth: 'الجزائر',
          phone: '+213555123456', email: 'candidate@example.invalid', professionalStatus: 'PERMANENT',
          employmentDate: '2005-09-01', primaryInstitutionName: 'ابتدائية تجريبية', additionalInstitutionNames: ['ملحقة تاريخية'],
        },
      },
    });
    process.env.G3_E2E_DISTRICT_ID = district.id;
    process.env.G3_E2E_INSPECTOR_EMAIL = inspector.email;
    process.env.G3_E2E_INSPECTOR_PASSWORD = inspectorPassword;
  } finally {
    await db.$disconnect();
  }

  process.env.G3_E2E_DATABASE_URL = databaseUrl;
  exitCode = runNode([resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.config.ts']);
} finally {
  delete process.env.G3_E2E_DATABASE_URL;
  delete process.env.G3_E2E_DISTRICT_ID;
  delete process.env.G3_E2E_INSPECTOR_EMAIL;
  delete process.env.G3_E2E_INSPECTOR_PASSWORD;
  if (admin && schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin?.$disconnect();
}

process.exitCode = exitCode;
