import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createApp } from '../dist/app.js';
import { registerAuthRoutes, requireAuthenticatedInspector } from '../dist/identity/auth-routes.js';
import { registerTeacherSubmissionRoutes } from '../dist/intake/routes.js';
import { registerInspectorSubmissionRoutes } from '../dist/intake/inspector-routes.js';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const password = 'task032-synthetic-password';

let databaseUrl;
let schemaName;
let schemaCreated = false;
let admin;
let db;
let server;
let baseUrl;
let inspector;
let otherInspector;
let districtA;
let districtB;
let expiredDistrict;
let futureDistrict;
let allowedCookies;
let otherCookies;
let target;
let duplicate;
let pendingOther;
let internalReview;
let rejected;
let crossDistrict;

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL is required; refusing database access.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('TEST_DATABASE_URL is malformed; refusing database access.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
      || url.port !== '55432' || url.username !== 'task020_test_user'
      || url.pathname.replace(/^\//u, '') !== 'task020_test' || url.searchParams.get('schema') !== 'public') {
    throw new Error('TEST_DATABASE_URL is not the approved isolated target.');
  }
  return raw;
}

function runPrisma(args, url, label) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', schemaPath], {
    cwd: rootDir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) {
    const details = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/giu, '[redacted]');
    throw new Error(`${label} failed.${details.trim() ? ` ${details.trim()}` : ''}`);
  }
}

function cookieParts(response) {
  return (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).filter(Boolean);
}
function cookieValue(cookies, name) {
  const entry = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  assert.ok(entry);
  return decodeURIComponent(entry.slice(name.length + 1).split(';', 1)[0]);
}
async function request(path, { cookies = [], body, method = 'GET' } = {}) {
  const headers = {};
  if (cookies.length) headers.cookie = cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function login(targetInspector) {
  const bootstrap = await request('/api/v1/auth/me');
  const bootCookies = cookieParts(bootstrap);
  const bootCsrf = cookieValue(bootCookies, 'inspector_csrf');
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      cookie: bootCookies.map((cookie) => cookie.split(';', 1)[0]).join('; '),
      'x-csrf-token': bootCsrf,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email: targetInspector.email, password }),
  });
  return { response, cookies: cookieParts(response) };
}
function profile(changes = {}) {
  return {
    firstName: 'أمينة', lastName: 'بن صالح', dateOfBirth: '1985-03-04', placeOfBirth: 'وهران',
    phone: '+213555123456', email: 'Amina@example.dz', professionalStatus: 'PERMANENT',
    employmentDate: '2005-09-01', confirmationDate: '2007-09-01', qualifications: 'شهادة تجريبية',
    notes: 'ملاحظة خاصة', primaryInstitutionName: 'ابتدائية النور', additionalInstitutionNames: ['مدرسة إضافية'],
    ...changes,
  };
}
async function createSubmission(district, submittedProfile, status = 'PENDING', submittedAt = new Date()) {
  return db.teacherSubmission.create({ data: { districtId: district.id, submittedProfile, status, submittedAt } });
}

before(async () => {
  databaseUrl = approvedUrl();
  runPrisma(['generate'], databaseUrl, 'Prisma Client generation');
  const { PrismaClient } = await import('@prisma/client');
  const { hashPassword } = await import('../dist/identity/password.js');
  admin = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  if (identity[0]?.db !== 'task020_test' || identity[0]?.role !== 'task020_test_user') throw new Error('Isolated database identity mismatch.');
  const publicTables = await admin.$queryRaw`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename !~ '^pg_'`;
  const migrationTable = await admin.$queryRaw`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
  if (publicTables.length || migrationTable[0]?.present) throw new Error('Public isolated test schema is not empty; refusing migration.');

  schemaName = `task032_${process.pid}_${randomBytes(6).toString('hex')}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  schemaCreated = true;
  const scopedUrl = new URL(databaseUrl);
  scopedUrl.searchParams.set('schema', schemaName);
  runPrisma(['migrate', 'deploy'], scopedUrl.toString(), 'Clean full migration deploy');
  runPrisma(['migrate', 'status'], scopedUrl.toString(), 'Migration status');
  db = new PrismaClient({ datasources: { db: { url: scopedUrl.toString() } } });
  await db.$connect();

  const passwordHash = await hashPassword(password);
  const suffix = randomBytes(5).toString('hex');
  inspector = await db.inspector.create({ data: { email: `task032-${suffix}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  otherInspector = await db.inspector.create({ data: { email: `task032-other-${suffix}@example.invalid`, passwordHash, status: 'ACTIVE' } });
  const now = new Date();
  districtA = await db.district.create({ data: { name: 'Synthetic TASK-032 District A' } });
  districtB = await db.district.create({ data: { name: 'Synthetic TASK-032 District B' } });
  expiredDistrict = await db.district.create({ data: { name: 'Synthetic expired District' } });
  futureDistrict = await db.district.create({ data: { name: 'Synthetic future District' } });
  await db.inspectorDistrictMembership.createMany({ data: [
    { inspectorId: inspector.id, districtId: districtA.id, role: 'INSPECTOR', validFrom: new Date(now.getTime() - 60_000) },
    { inspectorId: inspector.id, districtId: expiredDistrict.id, role: 'INSPECTOR', validFrom: new Date(now.getTime() - 120_000), validTo: new Date(now.getTime() - 60_000) },
    { inspectorId: inspector.id, districtId: futureDistrict.id, role: 'INSPECTOR', validFrom: new Date(now.getTime() + 86_400_000) },
    { inspectorId: otherInspector.id, districtId: districtB.id, role: 'INSPECTOR', validFrom: new Date(now.getTime() - 60_000) },
  ] });

  const app = createApp((instance) => {
    registerAuthRoutes(instance, db);
    const requireInspector = requireAuthenticatedInspector(db);
    registerTeacherSubmissionRoutes(instance, db);
    registerInspectorSubmissionRoutes(instance, db, requireInspector);
  });
  const listener = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen, reject) => {
    listener.once('listening', resolveListen);
    listener.once('error', reject);
  });
  server = listener;
  baseUrl = `http://127.0.0.1:${listener.address().port}`;
  const activeLogin = await login(inspector);
  assert.equal(activeLogin.response.status, 200);
  allowedCookies = activeLogin.cookies;
  const otherLogin = await login(otherInspector);
  assert.equal(otherLogin.response.status, 200);
  otherCookies = otherLogin.cookies;

  target = await createSubmission(districtA, profile(), 'PENDING', new Date('2026-01-01T00:00:00Z'));
  duplicate = await createSubmission(districtA, profile({ notes: 'candidate secret notes' }), 'PENDING', new Date('2026-01-02T00:00:00Z'));
  pendingOther = await createSubmission(districtA, profile({ firstName: 'سلمى', phone: '+213555000000', email: 'different@example.dz' }), 'PENDING', new Date('2026-01-03T00:00:00Z'));
  internalReview = await createSubmission(districtA, profile({ firstName: 'مختلف', phone: '+213555123456', email: 'other@example.dz' }), 'INTERNAL_REVIEW', new Date('2026-01-04T00:00:00Z'));
  rejected = await createSubmission(districtA, profile(), 'REJECTED', new Date('2026-01-05T00:00:00Z'));
  crossDistrict = await createSubmission(districtB, profile(), 'PENDING');
});

after(async () => {
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  await db?.$disconnect();
  if (admin && schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin?.$disconnect();
});

test('list requires an authenticated ACTIVE Inspector and defaults to PENDING', async () => {
  const unauthenticated = await request('/api/v1/submissions');
  assert.equal(unauthenticated.status, 401);
  const unauthenticatedDetail = await request(`/api/v1/submissions/${target.id}`);
  assert.equal(unauthenticatedDetail.status, 401);
  const response = await request('/api/v1/submissions', { cookies: allowedCookies });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.page.total, 3);
  assert.ok(body.data.every(({ status }) => status === 'PENDING'));
  assert.ok(body.data.some(({ id }) => id === target.id));
  assert.ok(!body.data.some(({ id }) => [rejected.id, internalReview.id, crossDistrict.id].includes(id)));
});

test('list exposes only triage fields, duplicate boolean, and q/status/district server filters', async () => {
  const response = await request(`/api/v1/submissions?q=${encodeURIComponent('ابتدائية النور')}&districtId=${districtA.id}`, { cookies: allowedCookies });
  const body = await response.json();
  assert.equal(body.page.total, 3);
  const item = body.data.find(({ id }) => id === target.id);
  assert.equal(item.hasPotentialDuplicates, true);
  assert.equal(body.data.find(({ id }) => id === pendingOther.id)?.hasPotentialDuplicates, false);
  assert.deepEqual(Object.keys(item).sort(), ['id', 'firstName', 'lastName', 'dateOfBirth', 'submittedAt', 'primaryInstitutionName', 'status', 'hasPotentialDuplicates'].sort());
  assert.equal(JSON.stringify(body).includes('+213555123456'), false);
  assert.equal(JSON.stringify(body).includes('Amina@example.dz'), false);
  assert.equal(JSON.stringify(body).includes('potentialDuplicates'), false);
  const nameSearch = await request(`/api/v1/submissions?q=${encodeURIComponent('أمينة')}`, { cookies: allowedCookies });
  assert.equal((await nameSearch.json()).page.total, 2);

  const scoped = await request(`/api/v1/submissions?districtId=${districtB.id}`, { cookies: allowedCookies });
  assert.equal(scoped.status, 404);
  const internal = await request('/api/v1/submissions?status=INTERNAL_REVIEW', { cookies: allowedCookies });
  assert.deepEqual((await internal.json()).data.map(({ id }) => id), [internalReview.id]);
  const bad = await request('/api/v1/submissions?status=UNKNOWN', { cookies: allowedCookies });
  assert.equal(bad.status, 400);
});

test('cursor pagination is stable, disjoint, and counts only filtered results', async () => {
  const firstResponse = await request('/api/v1/submissions?limit=1', { cookies: allowedCookies });
  const first = await firstResponse.json();
  assert.equal(first.data.length, 1);
  assert.equal(first.page.total, 3);
  assert.ok(first.page.nextCursor);
  const secondResponse = await request(`/api/v1/submissions?limit=1&cursor=${first.page.nextCursor}`, { cookies: allowedCookies });
  const second = await secondResponse.json();
  assert.equal(second.data.length, 1);
  assert.notEqual(first.data[0].id, second.data[0].id);
  const invalidCursor = await request(`/api/v1/submissions?status=REJECTED&cursor=${first.page.nextCursor}`, { cookies: allowedCookies });
  assert.equal(invalidCursor.status, 404);
});

test('detail returns authorized submitted profile and candidates with minimized candidate PII', async () => {
  const response = await request(`/api/v1/submissions/${target.id}`, { cookies: allowedCookies });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.id, target.id);
  assert.equal(body.data.submittedProfile.email, 'Amina@example.dz');
  const matched = body.data.potentialDuplicates.find(({ id }) => id === duplicate.id);
  assert.deepEqual(matched.matchReasons, ['SAME_PHONE', 'SAME_EMAIL', 'SAME_NAME_AND_DOB']);
  assert.deepEqual(Object.keys(matched).sort(), ['id', 'firstName', 'lastName', 'dateOfBirth', 'placeOfBirth', 'status', 'submittedAt', 'matchReasons'].sort());
  const serialized = JSON.stringify(matched);
  for (const forbidden of ['+213555123456', 'Amina@example.dz', 'candidate secret notes', 'شهادة تجريبية', 'ابتدائية النور', 'مدرسة إضافية', '2005-09-01']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.ok(body.data.potentialDuplicates.some(({ id }) => id === internalReview.id));
  assert.ok(!body.data.potentialDuplicates.some(({ id }) => [target.id, rejected.id, crossDistrict.id].includes(id)));
  const noCandidates = await request(`/api/v1/submissions/${pendingOther.id}`, { cookies: allowedCookies });
  assert.deepEqual((await noCandidates.json()).data.potentialDuplicates, []);
  assert.equal(await db.teacherSubmission.count(), 6);
});

test('detail out-of-scope and nonexistent IDs have the same generic 404 semantics', async () => {
  const outside = await request(`/api/v1/submissions/${target.id}`, { cookies: otherCookies });
  const missing = await request(`/api/v1/submissions/${randomUUID()}`, { cookies: allowedCookies });
  assert.equal(outside.status, 404);
  assert.equal(missing.status, 404);
  const outsideError = (await outside.json()).error;
  const missingError = (await missing.json()).error;
  assert.equal(outsideError.code, 'NOT_FOUND');
  assert.equal(outsideError.message, missingError.message);
});

test('expired/future memberships cannot authorize list widening; inactive login is rejected', async () => {
  for (const district of [expiredDistrict, futureDistrict]) {
    const response = await request(`/api/v1/submissions?districtId=${district.id}`, { cookies: allowedCookies });
    assert.equal(response.status, 404);
  }
  const inactive = await db.inspector.create({ data: {
    email: `task032-inactive-${randomUUID()}@example.invalid`, passwordHash: inspector.passwordHash, status: 'INACTIVE',
  } });
  const attempt = await login(inactive);
  assert.equal(attempt.response.status, 401);
});

test('public submission receipt remains private and has no candidate disclosure', async () => {
  const response = await request(`/api/v1/public/districts/${districtA.id}/submissions`, {
    method: 'POST',
    body: {
      firstName: 'اسم تجريبي', lastName: 'لقب تجريبي', dateOfBirth: '1980-01-02', placeOfBirth: 'الجزائر',
      phone: '0555123456', email: 'public@example.dz', professionalStatus: 'PERMANENT', employmentDate: '2000-01-02',
      primaryInstitutionName: 'مدرسة تجريبية',
    },
  });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.deepEqual(Object.keys(body.data), ['receiptId']);
  assert.equal(JSON.stringify(body).includes('potentialDuplicates'), false);
  assert.equal(JSON.stringify(body).includes('أمينة'), false);
});

test('submission reads expose no decision mutation routes', async () => {
  const response = await request(`/api/v1/submissions/${target.id}/decision`, {
    method: 'POST', cookies: allowedCookies, body: { action: 'ACCEPT' },
  });
  assert.equal(response.status, 404);
});
