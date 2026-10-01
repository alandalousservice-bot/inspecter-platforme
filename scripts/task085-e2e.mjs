import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { assertLiveTestDatabase, createOwnedTestSchema, dropOwnedTestSchema, generateTestSchema } from './test-schema-safety.mjs';

const root = process.cwd();
const credentialText = readFileSync('D:\\pg-task020-temp\\task020-test-url.secret', 'utf8').trim();
const rawUrl = credentialText.match(/^(?:TEST_DATABASE_URL|DATABASE_URL)=(.*)$/u)?.[1]?.trim() ?? credentialText;
const parsed = new URL(rawUrl);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.hostname !== '127.0.0.1' || parsed.port !== '55432'
  || decodeURIComponent(parsed.username) !== 'task020_test_user' || parsed.pathname !== '/task020_test') throw new Error('Refusing an unapproved TASK-085 test database.');

const tag = randomBytes(6).toString('hex');
const schema = generateTestSchema('task085_e2e');
let databaseUrl;
const apiRequire = createRequire(resolve(root, 'packages/api/package.json'));
const prismaPackagePath = apiRequire.resolve('prisma/package.json');
const prismaPath = resolve(dirname(prismaPackagePath), JSON.parse(readFileSync(prismaPackagePath, 'utf8')).bin.prisma);
const { PrismaClient } = apiRequire('@prisma/client');
let admin; let schemaCreated = false; let exitCode = 1; let inspectorEmail; let password; let districtId;
function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw new Error('Could not start TASK-085 verification.');
  return result.status ?? 1;
}

try {
  if (!process.env.npm_execpath || run([process.env.npm_execpath, 'run', 'build']) !== 0) throw new Error('Repository build failed before TASK-085 E2E.');
  admin = new PrismaClient({ datasources: { db: { url: rawUrl } } }); await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port`;
  const actual = identity[0];
  if (actual?.database !== 'task020_test' || actual?.role !== 'task020_test_user'
    || !/^127\.0\.0\.1(?:\/\d+)?$/u.test(actual?.address ?? '') || actual?.port !== 55432) throw new Error('Isolated DB identity mismatch.');
  databaseUrl = await createOwnedTestSchema(admin, rawUrl, schema); schemaCreated = true;
  await assertLiveTestDatabase(admin);
  const migrated = spawnSync(process.execPath, [prismaPath, 'migrate', 'deploy', '--schema', resolve(root, 'packages/api/prisma/schema.prisma')], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit', windowsHide: true,
  });
  if (migrated.error || migrated.status !== 0) throw new Error('TASK-085 isolated E2E schema migration failed.');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  password = `task085-${randomUUID()}-synthetic`;
  const { hashPassword } = await import('../packages/api/dist/identity/password.js');
  try {
    const district = await db.district.create({ data: { name: `مقاطعة TASK-085 ${tag}` } }); districtId = district.id;
    inspectorEmail = `task085-${tag}@example.invalid`;
    const inspector = await db.inspector.create({ data: { email: inspectorEmail, passwordHash: await hashPassword(password), status: 'ACTIVE', name: 'مفتش', surname: 'اختبار' } });
    await db.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId, role: 'INSPECTOR', validFrom: new Date('2020-01-01T00:00:00.000Z') } });
  } finally { await db.$disconnect(); }

  process.env.G3_E2E_DATABASE_URL = databaseUrl;
  process.env.G3_E2E_INSPECTOR_EMAIL = inspectorEmail;
  process.env.G3_E2E_INSPECTOR_PASSWORD = password;
  process.env.TASK085_E2E_DISTRICT_ID = districtId;
  process.env.TASK085_E2E_TAG = tag;
  process.env.TASK085_E2E = '1';
  exitCode = run([resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.config.ts']);
} finally {
  for (const name of ['G3_E2E_DATABASE_URL', 'G3_E2E_INSPECTOR_EMAIL', 'G3_E2E_INSPECTOR_PASSWORD', 'TASK085_E2E_DISTRICT_ID', 'TASK085_E2E_TAG', 'TASK085_E2E']) delete process.env[name];
  if (admin && schemaCreated) {
    await dropOwnedTestSchema(admin, rawUrl, schema);
  }
  await admin?.$disconnect();
  password = undefined;
}
process.exitCode = exitCode;
