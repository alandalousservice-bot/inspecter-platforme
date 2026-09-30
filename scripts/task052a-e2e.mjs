import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const raw = readFileSync('D:\\pg-task020-temp\\task020-test-url.secret', 'utf8').trim();
const target = new URL(raw);
if (!['postgres:', 'postgresql:'].includes(target.protocol) || target.hostname !== '127.0.0.1'
  || target.port !== '55432' || target.username !== 'task020_test_user'
  || target.pathname !== '/task020_test' || target.searchParams.get('schema') !== 'public') {
  throw new Error('Refusing unapproved TASK-052A database target.');
}
const schema = `task052a_e2e_${process.pid}_${randomBytes(5).toString('hex')}`;
const isolated = new URL(raw); isolated.searchParams.set('schema', schema);
const url = isolated.toString();
const apiRequire = createRequire(resolve(root, 'packages/api/package.json'));
const prismaPackagePath = apiRequire.resolve('prisma/package.json');
const prismaPath = resolve(dirname(prismaPackagePath), JSON.parse(readFileSync(prismaPackagePath, 'utf8')).bin.prisma);
const { PrismaClient } = apiRequire('@prisma/client');
let admin; let created = false; let exitCode = 1;
function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw new Error('TASK-052A connected subprocess failed.');
  return result.status ?? 1;
}
try {
  if (!process.env.npm_execpath || run([process.env.npm_execpath, 'run', 'build', '--workspace', '@inspector/api']) !== 0) {
    throw new Error('TASK-052A API build failed.');
  }
  admin = new PrismaClient({ datasources: { db: { url: raw } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  if (identity[0]?.db !== 'task020_test' || identity[0]?.role !== 'task020_test_user') throw new Error('Isolated database identity mismatch.');
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
  if (run([prismaPath, 'migrate', 'deploy', '--schema', resolve(root, 'packages/api/prisma/schema.prisma')],
    { ...process.env, DATABASE_URL: url }) !== 0) throw new Error('TASK-052A migrations failed.');
  const db = new PrismaClient({ datasources: { db: { url } } });
  let email; let password;
  try {
    const { hashPassword } = await import('../packages/api/dist/identity/password.js');
    email = `task052a-${schema}@example.invalid`; password = `task052a-${randomUUID()}-synthetic`;
    await db.inspector.create({ data: { email, passwordHash: await hashPassword(password), status: 'ACTIVE' } });
  } finally { await db.$disconnect(); }
  process.env.G3_E2E_DATABASE_URL = url;
  process.env.G3_E2E_INSPECTOR_EMAIL = email;
  process.env.G3_E2E_INSPECTOR_PASSWORD = password;
  process.env.TASK052A_E2E = '1';
  exitCode = run([resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.config.ts']);
} finally {
  for (const key of ['G3_E2E_DATABASE_URL', 'G3_E2E_INSPECTOR_EMAIL', 'G3_E2E_INSPECTOR_PASSWORD', 'TASK052A_E2E']) delete process.env[key];
  if (admin && created) {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    const check = await admin.$queryRaw`SELECT to_regnamespace(${schema})::text AS name`;
    if (check[0]?.name) throw new Error('TASK-052A temporary schema cleanup failed.');
  }
  await admin?.$disconnect();
}
process.exitCode = exitCode;
