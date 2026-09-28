import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const require = createRequire(import.meta.url);
const testDirectory = dirname(fileURLToPath(import.meta.url));
const apiDirectory = resolve(testDirectory, '..');
const rootDirectory = resolve(apiDirectory, '../..');
const schemaPath = join(apiDirectory, 'prisma', 'schema.prisma');
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const TEST_PASSWORD = 'task021-only-test-password';

let baseUrl;
let databaseUrl;
let schemaName;
let adminClient;
let prismaClient;
let server;
let activeInspector;
let inactiveInspector;
let appModule;
let previousNodeEnv;
let schemaCreated = false;

function approvedTestUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL is required; refusing database access.');
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('TEST_DATABASE_URL is malformed; refusing database access.'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
      || parsed.hostname !== '127.0.0.1'
      || parsed.port !== '55432'
      || parsed.username !== 'task020_test_user'
      || parsed.pathname.replace(/^\//, '') !== 'task020_test') {
    throw new Error('TEST_DATABASE_URL is not the approved isolated test target.');
  }
  const ambient = process.env.DATABASE_URL;
  if (ambient) {
    let other;
    try { other = new URL(ambient); } catch { throw new Error('DATABASE_URL is malformed; refusing database access.'); }
    if (parsed.hostname === other.hostname && parsed.port === other.port && parsed.pathname === other.pathname) {
      throw new Error('Test target must be distinct from DATABASE_URL.');
    }
  }
  return raw;
}

function redact(value) {
  return value.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[redacted database URL]');
}

function runPrisma(args, url, label) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', schemaPath], {
    cwd: rootDirectory,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) {
    const output = redact(`${result.stdout ?? ''}\n${result.stderr ?? ''}`).trim();
    throw new Error(`${label} failed.${output ? ` ${output}` : ''}`);
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function cookieParts(response) {
  const values = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? ''];
  return values.filter(Boolean);
}

function cookieValue(cookies, name) {
  const entry = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  assert.ok(entry, `Expected ${name} cookie.`);
  return decodeURIComponent(entry.slice(name.length + 1).split(';', 1)[0]);
}

function sessionCookie(cookies) {
  return cookies.find((cookie) => cookie.startsWith('inspector_session='));
}

function csrfCookie(cookies) {
  return cookies.find((cookie) => cookie.startsWith('inspector_csrf='));
}

async function request(path, { method = 'GET', cookies = [], csrf, body } = {}) {
  const headers = {};
  if (cookies.length) headers.cookie = cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
  if (csrf) headers['x-csrf-token'] = csrf;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
}

async function loginWith(inspector, password = TEST_PASSWORD) {
  const bootstrap = await request('/api/v1/auth/me');
  assert.equal(bootstrap.status, 401);
  const bootstrapCookies = cookieParts(bootstrap);
  const csrf = cookieValue(bootstrapCookies, 'inspector_csrf');
  const response = await request('/api/v1/auth/login', {
    method: 'POST', cookies: bootstrapCookies, csrf,
    body: { email: inspector.email, password },
  });
  return { response, cookies: cookieParts(response) };
}

async function loginCookies(inspector = activeInspector) {
  const result = await loginWith(inspector);
  assert.equal(result.response.status, 200);
  return result.cookies;
}

before(async () => {
  databaseUrl = approvedTestUrl();
  previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  runPrisma(['generate'], databaseUrl, 'Prisma Client generation');

  const { PrismaClient } = await import('@prisma/client');
  adminClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await adminClient.$connect();
  const identity = await adminClient.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  if (identity[0]?.db !== 'task020_test' || identity[0]?.role !== 'task020_test_user') {
    throw new Error('Database identity probe did not match the isolated test target.');
  }
  const publicTables = await adminClient.$queryRaw`
    SELECT tablename FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename !~ '^pg_' ORDER BY tablename
  `;
  if (publicTables.length) throw new Error('Public test schema is not empty; refusing to proceed.');
  const hasMigrationTable = await adminClient.$queryRaw`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
  if (hasMigrationTable[0]?.present) throw new Error('Unexpected migration metadata in public test schema.');

  schemaName = `task021_${process.pid}_${randomBytes(6).toString('hex')}`;
  await adminClient.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  schemaCreated = true;
  const scoped = new URL(databaseUrl);
  scoped.searchParams.set('schema', schemaName);
  const scopedUrl = scoped.toString();
  runPrisma(['migrate', 'deploy'], scopedUrl, 'TASK-020 test schema migration');
  prismaClient = new PrismaClient({ datasources: { db: { url: scopedUrl } } });
  await prismaClient.$connect();

  const { hashPassword } = await import('../dist/identity/password.js');
  const suffix = randomBytes(6).toString('hex');
  const passwordHash = await hashPassword(TEST_PASSWORD);
  activeInspector = await prismaClient.inspector.create({
    data: { email: `active-${suffix}@example.invalid`, passwordHash, status: 'ACTIVE' },
  });
  inactiveInspector = await prismaClient.inspector.create({
    data: { email: `inactive-${suffix}@example.invalid`, passwordHash, status: 'INACTIVE' },
  });

  const { createApp } = await import('../dist/app.js');
  const { registerAuthRoutes } = await import('../dist/identity/auth-routes.js');
  appModule = { createApp, registerAuthRoutes };
  server = appModule.createApp((app) => appModule.registerAuthRoutes(app, prismaClient));
  await new Promise((resolveListen, reject) => {
    const listener = server.listen(0, '127.0.0.1', () => resolveListen(listener));
    listener.once('error', reject);
  }).then((listener) => {
    server = listener;
    baseUrl = `http://127.0.0.1:${listener.address().port}`;
  });
});

after(async () => {
  if (server?.close) await new Promise((resolveClose) => server.close(resolveClose));
  if (prismaClient) {
    await prismaClient.session.deleteMany();
    await prismaClient.inspectorDistrictMembership.deleteMany();
    await prismaClient.inspector.deleteMany();
    await prismaClient.district.deleteMany();
    await prismaClient.$disconnect();
  }
  if (adminClient && schemaCreated && schemaName) await adminClient.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await adminClient?.$disconnect();
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
});

test('TASK-021 active login issues a fixed eight-hour session and secure cookies', async () => {
  const before = Date.now();
  const { response, cookies } = await loginWith(activeInspector);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('x-request-id'));
  const sessionSetCookie = sessionCookie(cookies);
  const csrfSetCookie = csrfCookie(cookies);
  assert.ok(sessionSetCookie);
  assert.ok(csrfSetCookie);
  assert.match(sessionSetCookie, /; HttpOnly(?:;|$)/);
  assert.match(sessionSetCookie, /; Secure(?:;|$)/);
  assert.match(sessionSetCookie, /; SameSite=Strict(?:;|$)/);
  assert.match(sessionSetCookie, /; Path=\/api\/v1(?:;|$)/);
  assert.match(csrfSetCookie, /; Secure(?:;|$)/);
  assert.match(csrfSetCookie, /; SameSite=Strict(?:;|$)/);
  assert.doesNotMatch(csrfSetCookie, /; HttpOnly(?:;|$)/);
  const csrf = cookieValue(cookies, 'inspector_csrf');
  const { tokenHash } = await prismaClient.session.findFirstOrThrow({ where: { inspectorId: activeInspector.id } });
  assert.equal(tokenHash.length, 64);
  const session = await prismaClient.session.findFirstOrThrow({ where: { inspectorId: activeInspector.id } });
  assert.ok(session.createdAt.getTime() >= before - 50);
  assert.equal(session.expiresAt.getTime() - session.createdAt.getTime(), 8 * 60 * 60 * 1000);
  const expires = new Date(sessionSetCookie.match(/; Expires=([^;]+)/)?.[1] ?? '');
  const csrfExpires = new Date(csrfSetCookie.match(/; Expires=([^;]+)/)?.[1] ?? '');
  assert.ok(Number.isFinite(expires.getTime()));
  assert.ok(Number.isFinite(csrfExpires.getTime()));
  assert.ok(expires.getTime() <= session.expiresAt.getTime());
  assert.ok(csrfExpires.getTime() <= session.expiresAt.getTime());
  assert.ok(Number(sessionSetCookie.match(/; Max-Age=(\d+)/)?.[1]) <= 8 * 60 * 60);
  assert.ok(Number(csrfSetCookie.match(/; Max-Age=(\d+)/)?.[1]) <= 8 * 60 * 60);
  const me = await request('/api/v1/auth/me', { cookies, csrf });
  assert.equal(me.status, 200);
});

test('TASK-021 rejects invalid credentials and INACTIVE inspectors uniformly', async () => {
  const wrong = await loginWith(activeInspector, 'wrong-password');
  const inactive = await loginWith(inactiveInspector);
  assert.equal(wrong.response.status, 401);
  assert.equal(inactive.response.status, 401);
  const wrongBody = await wrong.response.json();
  const inactiveBody = await inactive.response.json();
  assert.equal(wrongBody.error.code, inactiveBody.error.code);
  assert.equal(wrongBody.error.message, inactiveBody.error.message);
  assert.equal(await prismaClient.session.count({ where: { inspectorId: activeInspector.id } }), 1);
  assert.equal(await prismaClient.session.count({ where: { inspectorId: inactiveInspector.id } }), 0);
});

test('TASK-021 rejects expired, revoked, and inactive-owner sessions without granting access', async (t) => {
  await t.test('expired', async () => {
    const cookies = await loginCookies();
    const token = cookieValue(cookies, 'inspector_session');
    const hash = (await import('node:crypto')).createHash('sha256').update(token).digest('hex');
    await prismaClient.session.update({ where: { tokenHash: hash }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await request('/api/v1/auth/me', { cookies })).status, 401);
  });

  await t.test('revoked', async () => {
    const cookies = await loginCookies();
    const token = cookieValue(cookies, 'inspector_session');
    const hash = (await import('node:crypto')).createHash('sha256').update(token).digest('hex');
    await prismaClient.session.update({ where: { tokenHash: hash }, data: { revokedAt: new Date() } });
    assert.equal((await request('/api/v1/auth/me', { cookies })).status, 401);
  });

  await t.test('owner deactivated after session creation', async () => {
    const cookies = await loginCookies();
    const token = cookieValue(cookies, 'inspector_session');
    const hash = (await import('node:crypto')).createHash('sha256').update(token).digest('hex');
    await prismaClient.inspector.update({ where: { id: activeInspector.id }, data: { status: 'INACTIVE' } });
    assert.equal((await request('/api/v1/auth/me', { cookies })).status, 401);
    assert.equal((await prismaClient.session.findUniqueOrThrow({ where: { tokenHash: hash } })).revokedAt, null);
    await prismaClient.inspector.update({ where: { id: activeInspector.id }, data: { status: 'ACTIVE' } });
  });
});

test('TASK-021 logout requires CSRF, revokes only the current session, and clears cookies', async () => {
  const cookies = await loginCookies();
  const token = cookieValue(cookies, 'inspector_session');
  const csrf = cookieValue(cookies, 'inspector_csrf');
  const hash = (await import('node:crypto')).createHash('sha256').update(token).digest('hex');
  const rejected = await request('/api/v1/auth/logout', { method: 'POST', cookies });
  assert.equal(rejected.status, 403);
  assert.equal((await prismaClient.session.findUniqueOrThrow({ where: { tokenHash: hash } })).revokedAt, null);

  const response = await request('/api/v1/auth/logout', { method: 'POST', cookies, csrf });
  assert.equal(response.status, 200);
  assert.ok((await prismaClient.session.findUniqueOrThrow({ where: { tokenHash: hash } })).revokedAt instanceof Date);
  const cleared = cookieParts(response);
  assert.match(sessionCookie(cleared), /; HttpOnly(?:;|$)/);
  assert.match(sessionCookie(cleared), /; Secure(?:;|$)/);
  assert.match(sessionCookie(cleared), /; SameSite=Strict(?:;|$)/);
  assert.match(sessionCookie(cleared), /; Max-Age=0(?:;|$)/);
  assert.match(csrfCookie(cleared), /; Max-Age=0(?:;|$)/);
  assert.equal((await request('/api/v1/auth/me', { cookies: cleared })).status, 401);
});

test('TASK-021 login rejects missing/mismatched CSRF before accepting credentials', async () => {
  const bootstrap = await request('/api/v1/auth/me');
  const cookies = cookieParts(bootstrap);
  const missing = await request('/api/v1/auth/login', { method: 'POST', cookies, body: { email: activeInspector.email, password: TEST_PASSWORD } });
  const mismatch = await request('/api/v1/auth/login', {
    method: 'POST', cookies, csrf: 'not-the-cookie-token',
    body: { email: activeInspector.email, password: TEST_PASSWORD },
  });
  assert.equal(missing.status, 403);
  assert.equal(mismatch.status, 403);
  assert.equal(await prismaClient.session.count({ where: { inspectorId: activeInspector.id } }), 5);
});
