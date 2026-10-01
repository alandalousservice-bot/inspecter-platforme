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
import { registerTeacherSubmissionRoutes } from '../dist/intake/routes.js';
import { createPublicSubmissionRateLimiter } from '../dist/intake/rate-limit.js';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);

let databaseUrl;
let schemaName;
let schemaCreated = false;
let admin;
let db;
let server;
let rateServer;
let baseUrl;
let rateBaseUrl;
let district;
let expiredDistrict;
let futureDistrict;
let unassignedDistrict;
let auditCountBefore;

const validSubmission = {
  firstName: 'أحمد',
  lastName: 'بن صالح',
  dateOfBirth: '1980-01-02',
  placeOfBirth: 'الجزائر',
  phone: '0555 123 456',
  email: 'teacher@EXAMPLE.DZ',
  professionalStatus: 'PERMANENT',
  employmentDate: '2000-01-02',
  workplace: { institutionName: 'ابتدائية النور', municipality: 'بلدية الجزائر', institutionAddress: 'شارع الاستقلال', directorPhone: '021234567' },
};

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

async function startServer(limiter) {
  const app = createApp((expressApp) => registerTeacherSubmissionRoutes(expressApp, db), {
    publicSubmissionRateLimiter: limiter,
  });
  const httpServer = app.listen(0, '127.0.0.1');
  await new Promise((resolveListening, reject) => {
    httpServer.once('listening', resolveListening);
    httpServer.once('error', reject);
  });
  return { server: httpServer, url: `http://127.0.0.1:${httpServer.address().port}` };
}

async function request(path, { body = validSubmission, rawBody, headers = {} } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: rawBody ?? JSON.stringify(body),
  });
}

async function expectInvalid(body, valueToKeepOut = 'private-test-value') {
  const response = await request(`/api/v1/public/districts/${district.id}/submissions`, { body });
  assert.equal(response.status, 400);
  const serialized = await response.text();
  assert.equal(serialized.includes(valueToKeepOut), false);
  assert.equal(serialized.includes('أحمد'), false);
}

before(async () => {
  databaseUrl = approvedUrl();
  runPrisma(['generate'], databaseUrl, 'Prisma Client generation');
  const { PrismaClient } = await import('@prisma/client');
  admin = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  if (identity[0]?.db !== 'task020_test' || identity[0]?.role !== 'task020_test_user') throw new Error('Isolated database identity mismatch.');
  const tables = await admin.$queryRaw`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename !~ '^pg_'`;
  const migrationTable = await admin.$queryRaw`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
  if (tables.length || migrationTable[0]?.present) throw new Error('Public isolated test schema is not empty; refusing migration.');

  schemaName = `task030_${process.pid}_${randomBytes(6).toString('hex')}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  schemaCreated = true;
  const scopedUrl = new URL(databaseUrl);
  scopedUrl.searchParams.set('schema', schemaName);
  runPrisma(['migrate', 'deploy'], scopedUrl.toString(), 'Clean full migration deploy');
  runPrisma(['migrate', 'status'], scopedUrl.toString(), 'Migration status');
  db = new PrismaClient({ datasources: { db: { url: scopedUrl.toString() } } });
  await db.$connect();

  const inspector = await db.inspector.create({ data: {
    email: `task030-${randomUUID()}@example.invalid`, passwordHash: 'synthetic-only', status: 'ACTIVE',
  } });
  const now = new Date();
  district = await db.district.create({ data: { name: 'Synthetic current intake district' } });
  expiredDistrict = await db.district.create({ data: { name: 'Synthetic expired intake district' } });
  futureDistrict = await db.district.create({ data: { name: 'Synthetic future intake district' } });
  unassignedDistrict = await db.district.create({ data: { name: 'Synthetic unassigned intake district' } });
  await db.inspectorDistrictMembership.createMany({ data: [
    { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(now.getTime() - 86_400_000) },
    { inspectorId: inspector.id, districtId: expiredDistrict.id, role: 'INSPECTOR', validFrom: new Date(now.getTime() - 172_800_000), validTo: new Date(now.getTime() - 86_400_000) },
    { inspectorId: inspector.id, districtId: futureDistrict.id, role: 'INSPECTOR', validFrom: new Date(now.getTime() + 86_400_000) },
  ] });
  auditCountBefore = await db.auditLog.count();
  ({ server, url: baseUrl } = await startServer(createPublicSubmissionRateLimiter({
    limit: 1000,
    resolveClientIp: (request) => request.socket.remoteAddress,
  })));
});

after(async () => {
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  if (rateServer) await new Promise((resolveClose) => rateServer.close(resolveClose));
  await db?.$disconnect();
  if (admin && schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin?.$disconnect();
});

test('clean migration creates the documented snapshot table, indexes and restrictive FKs', async () => {
  const columns = await db.$queryRaw`SELECT column_name, is_nullable, data_type, column_default FROM information_schema.columns WHERE table_schema=${schemaName} AND table_name='TeacherSubmission'`;
  assert.deepEqual(columns.map(({ column_name }) => column_name).sort(), [
    'id', 'districtId', 'submittedProfile', 'status', 'submittedAt', 'decidedAt', 'decidedByInspectorId', 'acceptedTeacherId',
  ].sort());
  assert.equal(columns.find(({ column_name }) => column_name === 'submittedProfile').data_type, 'jsonb');
  assert.match(columns.find(({ column_name }) => column_name === 'status').column_default, /PENDING/u);
  const indexes = await db.$queryRaw`SELECT indexname, indexdef FROM pg_catalog.pg_indexes WHERE schemaname=${schemaName} AND tablename='TeacherSubmission'`;
  assert.ok(indexes.some(({ indexname, indexdef }) => indexname === 'TeacherSubmission_districtId_status_submittedAt_idx'
    && indexdef.includes('"districtId", status, "submittedAt"')), JSON.stringify(indexes));
  assert.ok(indexes.some(({ indexname, indexdef }) => indexname === 'TeacherSubmission_acceptedTeacherId_key'
    && indexdef.includes('UNIQUE') && indexdef.includes('"acceptedTeacherId"')));
  const fks = await db.$queryRawUnsafe(`SELECT conname, confdeltype, confupdtype FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass('"${schemaName}"."TeacherSubmission"') AND contype='f'`);
  assert.equal(fks.length, 3);
  assert.ok(fks.every(({ confdeltype, confupdtype }) => confdeltype === 'r' && confupdtype === 'c'));
  const history = await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied FROM "${schemaName}"."_prisma_migrations"`);
  assert.deepEqual(history[0], { total: 18, applied: 18 });
  const forbiddenTables = await db.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema=${schemaName} AND table_name IN ('TeacherInstitutionAssignment')`;
  assert.deepEqual(forbiddenTables, []);
  assert.equal(await db.teacher.count(), 0);
  assert.equal(await db.institution.count(), 0);
});

test('public Arabic submission returns receipt only and persists normalized PENDING snapshot', async () => {
  const response = await request(`/api/v1/public/districts/${district.id}/submissions`);
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['data']);
  assert.deepEqual(Object.keys(body.data), ['receiptId']);
  assert.match(body.data.receiptId, /^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu);
  const row = await db.teacherSubmission.findUnique({ where: { id: body.data.receiptId } });
  assert.equal(row.status, 'PENDING');
  assert.equal(row.districtId, district.id);
  assert.equal(row.submittedProfile.phone, '+213555123456');
  assert.equal(row.submittedProfile.email, 'teacher@example.dz');
  assert.equal(row.submittedProfile.firstName, 'أحمد');
  assert.deepEqual(row.submittedProfile.workplace, { institutionName: 'ابتدائية النور', municipality: 'بلدية الجزائر', institutionAddress: 'شارع الاستقلال', directorPhone: '+21321234567' });
  assert.equal(Object.hasOwn(row.submittedProfile, 'primaryInstitutionName'), false);
  assert.equal(Object.hasOwn(row.submittedProfile, 'additionalInstitutionNames'), false);
  assert.equal(await db.auditLog.count(), auditCountBefore);
  assert.equal(await db.institution.count(), 0);
});

test('each documented professional status is accepted and arbitrary values are rejected', async () => {
  for (const status of ['PERMANENT', 'TRAINEE', 'CONTRACT', 'TEMPORARY_CONTRACT', 'SUBSTITUTE']) {
    const response = await request(`/api/v1/public/districts/${district.id}/submissions`, { body: { ...validSubmission, professionalStatus: status } });
    assert.equal(response.status, 202);
  }
  await expectInvalid({ ...validSubmission, professionalStatus: 'OTHER', email: 'private-test-value@example.invalid' });
});

test('all documented Unicode field boundaries accept their limit and reject values above it', async () => {
  const atLimit = {
    ...validSubmission,
    firstName: 'ا'.repeat(100),
    lastName: 'ب'.repeat(100),
    placeOfBirth: 'ج'.repeat(150),
    qualifications: 'د'.repeat(1000),
    notes: 'م'.repeat(2000),
    workplace: { institutionName: 'و'.repeat(200), municipality: 'ز'.repeat(150), institutionAddress: 'ع'.repeat(300), directorPhone: '021234567' },
    email: `${'a'.repeat(64)}@${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(58)}.dz`,
  };
  const accepted = await request(`/api/v1/public/districts/${district.id}/submissions`, { body: atLimit });
  assert.equal(accepted.status, 202);
  for (const [field, value] of [
    ['firstName', 'ا'.repeat(101)], ['lastName', 'ب'.repeat(101)], ['placeOfBirth', 'ج'.repeat(151)],
    ['qualifications', 'د'.repeat(1001)], ['notes', 'م'.repeat(2001)],
    ['phone', '0'.repeat(21)],
    ['email', `${'a'.repeat(64)}@${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(59)}.dz`],
  ]) {
    await expectInvalid({ ...validSubmission, [field]: value }, value.slice(0, 8));
  }
  for (const [field, max] of [['institutionName', 200], ['municipality', 150], ['institutionAddress', 300]]) {
    await expectInvalid({ ...validSubmission, workplace: { ...validSubmission.workplace, [field]: 'ز'.repeat(max + 1) } });
  }
});

test('dates reject malformed, impossible, future, and contradictory values', async () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  for (const changes of [
    { dateOfBirth: '1980-1-2' }, { dateOfBirth: '2001-02-29' }, { dateOfBirth: tomorrow },
    { employmentDate: tomorrow }, { employmentDate: '1980-01-02' },
    { confirmationDate: tomorrow }, { confirmationDate: '1999-01-01' },
  ]) await expectInvalid({ ...validSubmission, ...changes });
  const accepted = await request(`/api/v1/public/districts/${district.id}/submissions`, {
    body: { ...validSubmission, confirmationDate: '2000-01-02' },
  });
  assert.equal(accepted.status, 202);
});

test('phone accepts documented local/international fixed and mobile forms and persists canonical values', async () => {
  for (const [phone, canonical] of [
    ['021234567', '+21321234567'], ['+213 21 234 567', '+21321234567'],
    ['0555123456', '+213555123456'], ['+213 555 123 456', '+213555123456'],
  ]) {
    const response = await request(`/api/v1/public/districts/${district.id}/submissions`, { body: { ...validSubmission, phone } });
    assert.equal(response.status, 202);
    const receipt = await response.json();
    const saved = await db.teacherSubmission.findUnique({ where: { id: receipt.data.receiptId } });
    assert.equal(saved.submittedProfile.phone, canonical);
  }
  for (const phone of ['055512345', '0212345678', '05551234567', '+2130555123456', '1555123456']) {
    await expectInvalid({ ...validSubmission, phone });
  }
  for (const [directorPhone, canonical] of [['0555123456', '+213555123456'], ['021234567', '+21321234567']]) {
    const response = await request(`/api/v1/public/districts/${district.id}/submissions`, { body: { ...validSubmission, workplace: { ...validSubmission.workplace, directorPhone } } });
    assert.equal(response.status, 202);
    const receipt = await response.json();
    const saved = await db.teacherSubmission.findUnique({ where: { id: receipt.data.receiptId } });
    assert.equal(saved.submittedProfile.workplace.directorPhone, canonical);
  }
});

test('email is validated and only its domain is normalized', async () => {
  const response = await request(`/api/v1/public/districts/${district.id}/submissions`, { body: { ...validSubmission, email: '  Teacher@EXAMPLE.DZ  ' } });
  assert.equal(response.status, 202);
  const receipt = await response.json();
  const saved = await db.teacherSubmission.findUnique({ where: { id: receipt.data.receiptId } });
  assert.equal(saved.submittedProfile.email, 'Teacher@example.dz');
  await expectInvalid({ ...validSubmission, email: 'not-an-email' });
});

test('strict payload, nulls, whitespace, control characters, and malformed JSON are rejected without echo', async () => {
  await expectInvalid({ ...validSubmission, extra: 'private-test-value' });
  await expectInvalid({ ...validSubmission, qualifications: null });
  await expectInvalid({ ...validSubmission, notes: '  ' });
  await expectInvalid({ ...validSubmission, workplace: { ...validSubmission.workplace, institutionName: '   ' } });
  await expectInvalid({ ...validSubmission, workplace: { ...validSubmission.workplace, directorPhone: 'x' } });
  await expectInvalid({ ...validSubmission, workplace: { ...validSubmission.workplace, directorPhone: '0'.repeat(21) } });
  await expectInvalid({ ...validSubmission, workplace: { ...validSubmission.workplace, directorPhone: '021234567             ' } });
  for (const field of ['institutionName', 'municipality', 'institutionAddress', 'directorPhone']) {
    const missing = { ...validSubmission.workplace }; delete missing[field];
    await expectInvalid({ ...validSubmission, workplace: missing });
    await expectInvalid({ ...validSubmission, workplace: { ...validSubmission.workplace, [field]: null } });
    await expectInvalid({ ...validSubmission, workplace: { ...validSubmission.workplace, [field]: '  ' } });
  }
  await expectInvalid({ ...validSubmission, workplace: null });
  await expectInvalid({ ...validSubmission, workplace: { ...validSubmission.workplace, unexpected: 'private-test-value' } });
  await expectInvalid({ ...validSubmission, primaryInstitutionName: 'legacy' });
  await expectInvalid({ ...validSubmission, additionalInstitutionNames: ['legacy'] });
  await expectInvalid({ ...validSubmission, firstName: 'أحمد\u0000' });
  const malformed = await request(`/api/v1/public/districts/${district.id}/submissions`, { rawBody: '{bad-json' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.text()).includes('bad-json'), false);
});

test('exactly one new workplace is accepted with normalized Arabic values', async () => {
  const accepted = await request(`/api/v1/public/districts/${district.id}/submissions`, { body: validSubmission });
  assert.equal(accepted.status, 202);
});

test('district route validation hides nonexistent and unavailable district distinctions', async () => {
  const malformed = await request('/api/v1/public/districts/not-a-uuid/submissions');
  assert.equal(malformed.status, 400);
  const nonexistent = await request(`/api/v1/public/districts/${randomUUID()}/submissions`);
  const expired = await request(`/api/v1/public/districts/${expiredDistrict.id}/submissions`);
  const future = await request(`/api/v1/public/districts/${futureDistrict.id}/submissions`);
  const unassigned = await request(`/api/v1/public/districts/${unassignedDistrict.id}/submissions`);
  const errors = [];
  for (const response of [nonexistent, expired, future, unassigned]) {
    assert.equal(response.status, 404);
    errors.push((await response.json()).error);
  }
  assert.ok(errors.every(({ code, message }) => code === 'NOT_FOUND' && message === errors[0].message));
  assert.ok(errors.every(({ requestId }) => typeof requestId === 'string'));
});

test('districtId cannot be supplied in body and valid identical submissions remain independent', async () => {
  const widened = await request(`/api/v1/public/districts/${district.id}/submissions`, {
    body: { ...validSubmission, districtId: unassignedDistrict.id },
  });
  assert.equal(widened.status, 400);
  const before = await db.teacherSubmission.count();
  const first = await request(`/api/v1/public/districts/${district.id}/submissions`);
  const second = await request(`/api/v1/public/districts/${district.id}/submissions`);
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  const firstReceipt = await first.json();
  const secondReceipt = await second.json();
  assert.notEqual(firstReceipt.data.receiptId, secondReceipt.data.receiptId);
  assert.equal(await db.teacherSubmission.count(), before + 2);
});

test('public POST changes only TeacherSubmission rows and never logs PII', async () => {
  const initialSubmissions = await db.teacherSubmission.count();
  const initialAudit = await db.auditLog.count();
  const initialInstitutions = await db.institution.count();
  const initialTeachers = await db.teacher.count();
  const observedLogs = [];
  const originalLogMethods = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map((method) => [method, globalThis.console[method]]));
  for (const method of Object.keys(originalLogMethods)) globalThis.console[method] = (...args) => observedLogs.push(args.map(String).join(' '));
  let response;
  try {
    response = await request(`/api/v1/public/districts/${district.id}/submissions`, {
      body: { ...validSubmission, firstName: 'UNIQUE_PRIVATE_NAME', email: 'private@example.invalid', workplace: { institutionName: 'PRIVATE_INSTITUTION', municipality: 'PRIVATE_MUNICIPALITY', institutionAddress: 'PRIVATE_ADDRESS', directorPhone: '021234567' } },
    });
  } finally {
    for (const [method, original] of Object.entries(originalLogMethods)) globalThis.console[method] = original;
  }
  assert.equal(response.status, 202);
  const logs = observedLogs.join('\n');
  for (const value of ['UNIQUE_PRIVATE_NAME', 'private@example.invalid', 'PRIVATE_INSTITUTION', 'PRIVATE_MUNICIPALITY', 'PRIVATE_ADDRESS', '021234567']) {
    assert.equal(logs.includes(value), false, value);
  }
  assert.equal(await db.teacherSubmission.count(), initialSubmissions + 1);
  assert.equal(await db.auditLog.count(), initialAudit);
  assert.equal(await db.institution.count(), initialInstitutions);
  assert.equal(await db.teacher.count(), initialTeachers);
  const existingTables = await db.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema=${schemaName} AND table_name IN ('TeacherInstitutionAssignment')`;
  assert.deepEqual(existingTables, []);
});

test('rate limit counts validation attempts, ignores spoofed X-Forwarded-For, and returns Retry-After', async () => {
  ({ server: rateServer, url: rateBaseUrl } = await startServer(createPublicSubmissionRateLimiter({
    limit: 10,
    resolveClientIp: (request) => request.socket.remoteAddress,
  })));
  for (let index = 0; index < 10; index += 1) {
    const response = await fetch(`${rateBaseUrl}/api/v1/public/districts/${district.id}/submissions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${index + 1}` },
      body: JSON.stringify({ ...validSubmission, professionalStatus: 'invalid' }),
    });
    assert.equal(response.status, 400);
  }
  const blocked = await fetch(`${rateBaseUrl}/api/v1/public/districts/${district.id}/submissions`, {
    method: 'POST', headers: { 'x-forwarded-for': '203.0.113.200' },
  });
  assert.equal(blocked.status, 429);
  assert.equal(Number(blocked.headers.get('retry-after')) > 0, true);
  assert.equal((await blocked.json()).error.code, 'RATE_LIMITED');
});
