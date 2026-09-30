import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);

let admin;
let db;
let schemaName;
let schemaCreated = false;
let appendAuditEvent;
let AuditAction;
let inspector;
let district;

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL is required; refusing database access.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('TEST_DATABASE_URL is malformed; refusing database access.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
      || url.port !== '55432' || url.username !== 'task020_test_user'
      || url.pathname.replace(/^\//, '') !== 'task020_test' || url.searchParams.get('schema') !== 'public') {
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
    const details = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[redacted]');
    throw new Error(`${label} failed.${details.trim() ? ` ${details.trim()}` : ''}`);
  }
}

function httpEvent(overrides = {}) {
  return {
    source: 'HTTP', actorInspectorId: inspector.id, districtId: district.id,
    action: AuditAction.TEACHER_SUBMISSION_ACCEPTED, entityType: 'TeacherSubmission',
    entityId: randomUUID(), requestId: randomUUID(), ...overrides,
  };
}

before(async () => {
  const databaseUrl = approvedUrl();
  runPrisma(['generate'], databaseUrl, 'Prisma Client generation');
  const { PrismaClient } = await import('@prisma/client');
  admin = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  if (identity[0]?.db !== 'task020_test' || identity[0]?.role !== 'task020_test_user') throw new Error('Isolated database identity mismatch.');
  const tables = await admin.$queryRaw`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename !~ '^pg_'`;
  if (tables.length) throw new Error('Public isolated test schema is not empty; refusing migration.');

  schemaName = `task025_${process.pid}_${randomBytes(6).toString('hex')}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  schemaCreated = true;
  const scoped = new URL(databaseUrl);
  scoped.searchParams.set('schema', schemaName);
  runPrisma(['migrate', 'deploy'], scoped.toString(), 'Clean full migration deploy');
  runPrisma(['migrate', 'status'], scoped.toString(), 'Migration status');
  db = new PrismaClient({ datasources: { db: { url: scoped.toString() } } });
  await db.$connect();
  ({ appendAuditEvent, AuditAction } = await import('../dist/audit/append.js'));
  inspector = await db.inspector.create({ data: { email: `audit-${randomUUID()}@example.invalid`, passwordHash: 'synthetic-only', status: 'ACTIVE' } });
  district = await db.district.create({ data: { name: 'Synthetic audit district' } });
});

after(async () => {
  await db?.$disconnect();
  if (admin && schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin?.$disconnect();
});

test('clean migration creates exact AuditLog columns, FKs, index and complete history', async () => {
  const columns = await db.$queryRaw`SELECT column_name, is_nullable, data_type, column_default FROM information_schema.columns WHERE table_schema=${schemaName} AND table_name='AuditLog'`;
  assert.deepEqual(columns.map((row) => row.column_name).sort(), [
    'id', 'actorInspectorId', 'districtId', 'action', 'entityType', 'entityId', 'occurredAt', 'requestId', 'metadata',
  ].sort());
  for (const name of ['actorInspectorId', 'districtId', 'requestId', 'metadata']) {
    assert.equal(columns.find((row) => row.column_name === name).is_nullable, 'YES');
  }
  for (const name of ['id', 'action', 'entityType', 'entityId', 'occurredAt']) {
    assert.equal(columns.find((row) => row.column_name === name).is_nullable, 'NO');
  }
  assert.equal(columns.find((row) => row.column_name === 'metadata').data_type, 'jsonb');
  assert.match(columns.find((row) => row.column_name === 'occurredAt').column_default, /CURRENT_TIMESTAMP/);
  const index = await db.$queryRaw`SELECT indexdef FROM pg_catalog.pg_indexes WHERE schemaname=${schemaName} AND tablename='AuditLog' AND indexname='AuditLog_districtId_occurredAt_idx'`;
  assert.equal(index.length, 1);
  assert.match(index[0].indexdef, /"districtId", "occurredAt"/);
  const fks = await db.$queryRaw`SELECT confdeltype, confupdtype FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass(${`${schemaName}."AuditLog"`}) AND contype='f'`;
  assert.equal(fks.length, 2);
  assert.ok(fks.every(({ confdeltype, confupdtype }) => confdeltype === 'r' && confupdtype === 'c'));
  const history = await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied FROM "${schemaName}"."_prisma_migrations"`);
  assert.deepEqual(history[0], { total: 10, applied: 10 });
});

test('valid append generates UUID and occurrence time, links actor/district, and queries by district/time', async () => {
  const since = new Date(Date.now() - 1000);
  const entityId = randomUUID();
  const requestId = randomUUID();
  const event = await db.$transaction((tx) => appendAuditEvent(tx, httpEvent({ entityId, requestId, metadata: { resultingTeacherId: randomUUID() } })));
  assert.match(event.id, /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i);
  assert.ok(event.occurredAt instanceof Date);
  assert.equal(event.actorInspectorId, inspector.id);
  assert.equal(event.districtId, district.id);
  assert.equal(event.entityId, entityId);
  assert.equal(event.requestId, requestId);
  const found = await db.auditLog.findMany({ where: { districtId: district.id, occurredAt: { gte: since }, id: event.id } });
  assert.equal(found.length, 1);
});

test('service rejects missing fields, unknown action/entity type and unsafe metadata before database write', async () => {
  const invalid = [
    { entityId: undefined }, { action: 'UNDEFINED_ACTION' }, { entityType: 'Institution' },
    { metadata: { unexpected: true } }, { metadata: { password: 'synthetic' } },
    { metadata: { tokenHash: 'synthetic' } }, { metadata: { csrfToken: 'synthetic' } },
    { metadata: { cookie: 'synthetic' } }, { metadata: { Authorization: 'synthetic' } },
    { metadata: { apiKey: 'synthetic' } }, { metadata: { secret: 'synthetic' } },
    { metadata: { name: 'Synthetic' } }, { metadata: { email: 'synthetic@example.invalid' } },
    { metadata: { phone: '000' } }, { metadata: { address: 'Synthetic' } },
    { metadata: { dateOfBirth: '2000-01-01' } },
    { metadata: { body: { profile: 'synthetic' } } },
    { metadata: { resultingTeacherId: randomUUID(), rawRequest: {} } },
    { requestId: null }, { actorInspectorId: null },
  ];
  const beforeCount = await db.auditLog.count();
  for (const change of invalid) {
    await assert.rejects(db.$transaction((tx) => appendAuditEvent(tx, httpEvent(change))));
  }
  assert.equal(await db.auditLog.count(), beforeCount);
});

test('synthetic business mutation and audit append commit together', async () => {
  const name = `Atomic ${randomUUID()}`;
  const event = await db.$transaction(async (tx) => {
    await tx.institution.create({ data: { districtId: district.id, name } });
    return appendAuditEvent(tx, httpEvent());
  });
  assert.ok(await db.institution.findFirst({ where: { name } }));
  assert.ok(await db.auditLog.findUnique({ where: { id: event.id } }));
});

test('audit FK failure rolls back synthetic business mutation', async () => {
  const name = `Rollback ${randomUUID()}`;
  await assert.rejects(db.$transaction(async (tx) => {
    await tx.institution.create({ data: { districtId: district.id, name } });
    await appendAuditEvent(tx, httpEvent({ actorInspectorId: randomUUID() }));
  }), (error) => error?.code === 'P2003');
  assert.equal(await db.institution.count({ where: { name } }), 0);
});

test('invalid actor/district FKs fail and referenced actor/district deletion is restricted', async () => {
  await assert.rejects(db.$transaction((tx) => appendAuditEvent(tx, httpEvent({ actorInspectorId: randomUUID() }))), (error) => error?.code === 'P2003');
  await assert.rejects(db.$transaction((tx) => appendAuditEvent(tx, httpEvent({ districtId: randomUUID() }))), (error) => error?.code === 'P2003');
  await db.$transaction((tx) => appendAuditEvent(tx, httpEvent()));
  await assert.rejects(db.inspector.delete({ where: { id: inspector.id } }), (error) => /23001|P2003/.test(String(error?.message)));
  await assert.rejects(db.district.delete({ where: { id: district.id } }), (error) => /23001|P2003/.test(String(error?.message)));
});

test('logical entity reference requires no resource row; trusted system append may omit actor and request ID', async () => {
  const entityId = randomUUID();
  const event = await db.$transaction((tx) => appendAuditEvent(tx, {
    ...httpEvent({ entityId }), source: 'SYSTEM', actorInspectorId: null, requestId: null,
  }));
  assert.equal(event.entityId, entityId);
  assert.equal(event.actorInspectorId, null);
  assert.equal(event.requestId, null);
  assert.equal(await db.auditLog.count({ where: { entityId } }), 1);
});

test('append service exports no update or delete operations', async () => {
  const service = await import('../dist/audit/append.js');
  assert.deepEqual(Object.keys(service).sort(), ['AuditAction', 'appendAuditEvent']);
});
