import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { log } from 'node:console';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';

const require = createRequire(import.meta.url);
const testDirectory = dirname(fileURLToPath(import.meta.url));
const apiDirectory = resolve(testDirectory, '..');
const repositoryRoot = resolve(apiDirectory, '../..');
const schemaPath = join(apiDirectory, 'prisma', 'schema.prisma');
const prismaPackageJson = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackageJson, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackageJson), prismaPackage.bin.prisma);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let testDatabaseUrl;
let scopedDatabaseUrl;
let schemaName;
let schemaCreated = false;
let migrationApplied = false;
let adminClient;
let prismaClient;

function failClosedUrl() {
  const rawUrl = process.env.TEST_DATABASE_URL;
  if (!rawUrl) {
    throw new Error('TEST_DATABASE_URL is required; refusing database access.');
  }

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL is malformed; refusing database access.');
  }

  const databaseName = target.pathname.replace(/^\//, '');
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol)
    || target.hostname !== '127.0.0.1'
    || target.port !== '55432'
    || target.username !== 'task020_test_user'
    || databaseName !== 'task020_test'
    || target.searchParams.get('schema') !== 'public'
  ) {
    throw new Error('TEST_DATABASE_URL is not the approved local TASK-020 test target.');
  }

  const ambientDatabaseUrl = process.env.DATABASE_URL;
  if (ambientDatabaseUrl) {
    let ambient;
    try {
      ambient = new URL(ambientDatabaseUrl);
    } catch {
      throw new Error('Ambient DATABASE_URL is malformed; refusing database access.');
    }
    const normalized = (url) => JSON.stringify([
      url.protocol.toLowerCase(),
      url.username,
      url.password,
      url.hostname.toLowerCase(),
      url.port || '5432',
      decodeURIComponent(url.pathname),
      [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ]);
    if (normalized(target) === normalized(ambient)) {
      throw new Error('TEST_DATABASE_URL must be distinct from DATABASE_URL.');
    }
  }

  return rawUrl;
}

function redactedOutput(value) {
  return value.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[redacted database URL]');
}

function runPrisma(args, databaseUrl, label) {
  const result = spawnSync(
    process.execPath,
    [prismaCliPath, ...args, '--schema', schemaPath],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      timeout: 120_000,
      windowsHide: true,
      env: {
        ...process.env,
        TEST_DATABASE_URL: testDatabaseUrl,
        DATABASE_URL: databaseUrl,
      },
    },
  );

  if (result.error || result.status !== 0) {
    const output = redactedOutput(`${result.stdout ?? ''}\n${result.stderr ?? ''}`).trim();
    throw new Error(`${label} failed${result.status === null ? '' : ` (exit ${result.status})`}.${output ? ` ${output}` : ''}`);
  }

  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function assertMigrationStatus(output, label) {
  if (!/up to date/i.test(output)) {
    throw new Error(`${label} did not report an up-to-date migration state.`);
  }
}

function isForeignKeyFailure(error) {
  return error?.code === 'P2003';
}

before(async () => {
  testDatabaseUrl = failClosedUrl();
  runPrisma(['generate'], testDatabaseUrl, 'Prisma Client generation');

  const { PrismaClient } = await import('@prisma/client');
  adminClient = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  await adminClient.$connect();

  const identity = await adminClient.$queryRaw`SELECT current_database() AS database_name, current_user AS role_name`;
  if (identity[0]?.database_name !== 'task020_test' || identity[0]?.role_name !== 'task020_test_user') {
    throw new Error('Database identity probe did not match the approved TASK-020 target.');
  }

  const existingTables = await adminClient.$queryRaw`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename !~ '^pg_'
    ORDER BY tablename
  `;
  if (existingTables.length !== 0) {
    throw new Error('The approved test database public schema is not empty; refusing migration.');
  }
  const existingMigrationTable = await adminClient.$queryRaw`
    SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present
  `;
  if (existingMigrationTable[0]?.present) {
    throw new Error('The approved test database already has migration metadata; refusing migration.');
  }

  schemaName = `task020_${process.pid}_${randomBytes(6).toString('hex')}`;
  assert.match(schemaName, /^task020_[0-9]+_[a-f0-9]+$/);
  const priorSchema = await adminClient.$queryRaw`
    SELECT schema_name FROM information_schema.schemata WHERE schema_name = ${schemaName}
  `;
  if (priorSchema.length !== 0) {
    throw new Error('Generated isolated schema already exists; refusing to reuse it.');
  }
  await adminClient.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  schemaCreated = true;

  const scopedUrl = new URL(testDatabaseUrl);
  scopedUrl.searchParams.set('schema', schemaName);
  scopedDatabaseUrl = scopedUrl.toString();

  runPrisma(['validate'], scopedDatabaseUrl, 'Prisma schema validation');
  const beforeMigration = await adminClient.$queryRaw`
    SELECT table_name FROM information_schema.tables WHERE table_schema = ${schemaName}
  `;
  if (beforeMigration.length !== 0) {
    throw new Error('The isolated migration schema was not empty before deployment.');
  }

  runPrisma(['migrate', 'deploy'], scopedDatabaseUrl, 'First migration deploy');
  migrationApplied = true;
  assertMigrationStatus(runPrisma(['migrate', 'status'], scopedDatabaseUrl, 'First migration status'), 'First migration status');

  const { PrismaClient: Client } = await import('@prisma/client');
  prismaClient = new Client({ datasources: { db: { url: scopedDatabaseUrl } } });
  await prismaClient.$connect();
});

after(async () => {
  let cleanupFailure;
  try {
    if (prismaClient && migrationApplied) {
      await prismaClient.session.deleteMany();
      await prismaClient.inspectorDistrictMembership.deleteMany();
      await prismaClient.inspector.deleteMany();
      await prismaClient.district.deleteMany();
      const remaining = await Promise.all([
        prismaClient.session.count(),
        prismaClient.inspectorDistrictMembership.count(),
        prismaClient.inspector.count(),
        prismaClient.district.count(),
      ]);
      assert.deepEqual(remaining, [0, 0, 0, 0]);
      log('TASK-020 synthetic fixture rows after child-first cleanup: 0');

      const secondDeploy = runPrisma(['migrate', 'deploy'], scopedDatabaseUrl, 'Second migration deploy');
      assertMigrationStatus(runPrisma(['migrate', 'status'], scopedDatabaseUrl, 'Second migration status'), 'Second migration status');
      const history = await prismaClient.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied
        FROM "${schemaName}"."_prisma_migrations"
      `);
      assert.deepEqual(history[0], { total: 6, applied: 6 });
      log('TASK-020 second deploy/status: PASS; migration history: 6/6 applied');
      void secondDeploy;
    }
  } catch (error) {
    cleanupFailure = error;
  } finally {
    await prismaClient?.$disconnect();
    if (schemaCreated && adminClient) {
      await adminClient.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    }
    await adminClient?.$disconnect();
  }
  if (cleanupFailure) throw cleanupFailure;
});

test('TASK-020 isolated PostgreSQL migration and Inspector core constraints', async (t) => {
  const tables = await prismaClient.$queryRaw`
    SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = ${schemaName} ORDER BY tablename
  `;
  assert.deepEqual(tables.map(({ tablename }) => tablename), [
    'AuditLog',
    'District',
    'Inspector',
    'InspectorDistrictMembership',
    'Institution',
    'Session',
    'Teacher',
    'TeacherSubmission',
    '_prisma_migrations',
  ]);

  const columns = await prismaClient.$queryRaw`
    SELECT table_name, column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = ${schemaName}
    ORDER BY table_name, ordinal_position
  `;
  const columnNames = (tableName) => columns.filter((column) => column.table_name === tableName).map((column) => column.column_name);
  assert.deepEqual(columnNames('District'), ['id', 'name', 'externalCode', 'createdAt', 'updatedAt']);
  assert.deepEqual(columnNames('Inspector'), ['id', 'email', 'passwordHash', 'status', 'createdAt', 'updatedAt']);
  assert.deepEqual(columnNames('InspectorDistrictMembership'), ['id', 'inspectorId', 'districtId', 'role', 'validFrom', 'validTo', 'createdAt', 'updatedAt']);
  assert.deepEqual(columnNames('Session'), ['id', 'inspectorId', 'tokenHash', 'expiresAt', 'revokedAt', 'createdAt', 'updatedAt']);

  const nullable = new Map(columns.map((column) => [`${column.table_name}.${column.column_name}`, column.is_nullable]));
  for (const required of [
    'District.id', 'District.name',
    'District.createdAt', 'District.updatedAt',
    'Inspector.id', 'Inspector.email', 'Inspector.passwordHash', 'Inspector.status',
    'Inspector.createdAt', 'Inspector.updatedAt',
    'InspectorDistrictMembership.id', 'InspectorDistrictMembership.inspectorId',
    'InspectorDistrictMembership.districtId', 'InspectorDistrictMembership.role',
    'InspectorDistrictMembership.validFrom', 'InspectorDistrictMembership.createdAt',
    'InspectorDistrictMembership.updatedAt',
    'Session.id', 'Session.inspectorId', 'Session.tokenHash', 'Session.expiresAt',
    'Session.createdAt', 'Session.updatedAt',
  ]) assert.equal(nullable.get(required), 'NO', `${required} must be NOT NULL`);
  for (const optional of ['District.externalCode', 'InspectorDistrictMembership.validTo', 'Session.revokedAt']) {
    assert.equal(nullable.get(optional), 'YES', `${optional} must be nullable`);
  }

  const constraints = await prismaClient.$queryRaw`
    SELECT source.relname AS source_table, c.conname AS constraint_name, c.contype,
           target.relname AS target_table, c.confdeltype, c.confupdtype,
           pg_get_constraintdef(c.oid) AS definition
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class source ON source.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = source.relnamespace
    LEFT JOIN pg_catalog.pg_class target ON target.oid = c.confrelid
    WHERE n.nspname = ${schemaName} AND source.relname <> '_prisma_migrations'
    ORDER BY source.relname, c.contype, c.conname
  `;
  const primaryKeys = constraints.filter((constraint) => constraint.contype === 'p');
  assert.deepEqual(primaryKeys.map(({ source_table }) => source_table).sort(), [
    'AuditLog', 'District', 'Inspector', 'InspectorDistrictMembership', 'Institution', 'Session', 'Teacher', 'TeacherSubmission',
  ]);
  const foreignKeys = constraints.filter((constraint) => constraint.contype === 'f');
  assert.deepEqual(foreignKeys.map(({ source_table, target_table, confdeltype, confupdtype }) => ({
    source_table, target_table, confdeltype, confupdtype,
  })).sort((a, b) => a.source_table.localeCompare(b.source_table) || a.target_table.localeCompare(b.target_table)), [
    { source_table: 'AuditLog', target_table: 'District', confdeltype: 'r', confupdtype: 'c' },
    { source_table: 'AuditLog', target_table: 'Inspector', confdeltype: 'r', confupdtype: 'c' },
    { source_table: 'InspectorDistrictMembership', target_table: 'District', confdeltype: 'r', confupdtype: 'c' },
    { source_table: 'InspectorDistrictMembership', target_table: 'Inspector', confdeltype: 'r', confupdtype: 'c' },
    { source_table: 'Institution', target_table: 'District', confdeltype: 'r', confupdtype: 'c' },
    { source_table: 'Session', target_table: 'Inspector', confdeltype: 'r', confupdtype: 'c' },
    { source_table: 'Teacher', target_table: 'District', confdeltype: 'r', confupdtype: 'c' },
    { source_table: 'TeacherSubmission', target_table: 'District', confdeltype: 'r', confupdtype: 'c' },
    { source_table: 'TeacherSubmission', target_table: 'Inspector', confdeltype: 'r', confupdtype: 'c' },
    { source_table: 'TeacherSubmission', target_table: 'Teacher', confdeltype: 'r', confupdtype: 'c' },
  ]);

  const indexes = await prismaClient.$queryRaw`
    SELECT indexname, tablename, indexdef
    FROM pg_catalog.pg_indexes
    WHERE schemaname = ${schemaName} AND tablename <> '_prisma_migrations'
    ORDER BY indexname
  `;
  const expectedIndexes = [
    'Institution_districtId_name_idx',
    'InspectorDistrictMembership_districtId_idx',
    'InspectorDistrictMembership_inspectorId_idx',
    'Session_inspectorId_idx',
    'Teacher_districtId_surname_name_recordStatus_idx',
    'TeacherSubmission_districtId_status_submittedAt_idx',
  ];
  for (const name of expectedIndexes) assert.ok(indexes.some((index) => index.indexname === name), `Missing index ${name}`);
  const emailUniqueIndex = indexes.find((index) => index.tablename === 'Inspector' && index.indexname === 'Inspector_email_key');
  assert.ok(emailUniqueIndex);
  assert.match(emailUniqueIndex.indexdef, /\bemail\b/i);
  const uniqueIndexes = indexes.filter((index) => index.indexdef.includes('UNIQUE') && !index.indexname.endsWith('_pkey'));
  assert.deepEqual(uniqueIndexes.map(({ indexname }) => indexname), [
    'Inspector_email_key', 'Session_tokenHash_key', 'TeacherSubmission_acceptedTeacherId_key',
  ]);

  const migrationHistory = await prismaClient.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied
    FROM "${schemaName}"."_prisma_migrations"
  `);
  assert.deepEqual(migrationHistory[0], { total: 6, applied: 6 });

  await t.test('creates the four models with UUIDs, nullability, and resolvable relations', async () => {
    const runId = randomBytes(6).toString('hex');
    const district = await prismaClient.district.create({ data: { name: `QA District ${runId}`, externalCode: null } });
    const duplicateCodeDistrict = await prismaClient.district.create({ data: { name: `QA District duplicate ${runId}`, externalCode: `QA-${runId}` } });
    const duplicateCodeDistrict2 = await prismaClient.district.create({ data: { name: `QA District duplicate 2 ${runId}`, externalCode: `QA-${runId}` } });
    const inspector = await prismaClient.inspector.create({
      data: { email: `qa-${runId}@example.invalid`, passwordHash: `synthetic-hash-${runId}`, status: 'QA' },
    });
    const membership = await prismaClient.inspectorDistrictMembership.create({
      data: { inspectorId: inspector.id, districtId: district.id, role: 'QA', validFrom: new Date('2025-09-01T00:00:00.000Z'), validTo: new Date('2025-10-01T00:00:00.000Z') },
    });
    const duplicateMembership = await prismaClient.inspectorDistrictMembership.create({
      data: { inspectorId: inspector.id, districtId: district.id, role: 'QA', validFrom: new Date('2025-10-01T00:00:00.000Z'), validTo: null },
    });
    const tokenHash = `synthetic-token-${runId}`;
    const session = await prismaClient.session.create({
      data: { inspectorId: inspector.id, tokenHash, expiresAt: new Date('2030-01-01T00:00:00.000Z'), revokedAt: null },
    });
    for (const id of [district.id, duplicateCodeDistrict.id, duplicateCodeDistrict2.id, inspector.id, membership.id, duplicateMembership.id, session.id]) {
      assert.match(id, uuidPattern);
    }
    const resolvedMembership = await prismaClient.inspectorDistrictMembership.findUnique({
      where: { id: membership.id }, include: { inspector: true, district: true },
    });
    assert.equal(resolvedMembership.inspector.id, inspector.id);
    assert.equal(resolvedMembership.district.id, district.id);
    const resolvedSession = await prismaClient.session.findUnique({ where: { id: session.id }, include: { inspector: true } });
    assert.equal(resolvedSession.inspector.id, inspector.id);
    assert.equal((await prismaClient.inspector.findUnique({ where: { id: inspector.id }, include: { memberships: true, sessions: true } })).memberships.length, 2);
    assert.equal((await prismaClient.inspector.findUnique({ where: { id: inspector.id }, include: { sessions: true } })).sessions.length, 1);
    assert.equal(await prismaClient.district.count({ where: { externalCode: `QA-${runId}` } }), 2);
    assert.equal(await prismaClient.inspectorDistrictMembership.count({ where: { inspectorId: inspector.id, districtId: district.id } }), 2);
    assert.equal(await prismaClient.session.count({ where: { tokenHash } }), 1);
    assert.equal(await prismaClient.district.findUnique({ where: { id: district.id } }).then((record) => record.externalCode), null);
    assert.equal((await prismaClient.inspectorDistrictMembership.findUnique({ where: { id: membership.id } })).validTo.getTime(), new Date('2025-10-01T00:00:00.000Z').getTime());
    assert.equal((await prismaClient.session.findUnique({ where: { id: session.id } })).revokedAt, null);

    const timestampRows = [
      { model: 'District', row: district },
      { model: 'Inspector', row: inspector },
      { model: 'InspectorDistrictMembership', row: membership },
      { model: 'Session', row: session },
    ];
    for (const { model, row } of timestampRows) {
      assert.ok(row.createdAt instanceof Date, `${model}.createdAt must be generated`);
      assert.ok(row.updatedAt instanceof Date, `${model}.updatedAt must be generated`);
    }

    await delay(10);
    const updatedRows = await Promise.all([
      prismaClient.district.update({ where: { id: district.id }, data: { name: `${district.name} updated` } }),
      prismaClient.inspector.update({ where: { id: inspector.id }, data: { status: 'QA_UPDATED' } }),
      prismaClient.inspectorDistrictMembership.update({ where: { id: membership.id }, data: { validTo: new Date('2025-09-20T00:00:00.000Z') } }),
      prismaClient.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
    ]);
    for (const [index, updated] of updatedRows.entries()) {
      assert.ok(updated.updatedAt.getTime() > timestampRows[index].row.updatedAt.getTime(), `${timestampRows[index].model}.updatedAt must advance on update`);
      assert.equal(updated.createdAt.getTime(), timestampRows[index].row.createdAt.getTime(), `${timestampRows[index].model}.createdAt must remain stable`);
    }
    assert.equal(updatedRows[2].validTo.getTime(), new Date('2025-09-20T00:00:00.000Z').getTime());
  });

  await t.test('rejects duplicate Inspector.email in PostgreSQL', async () => {
    const inspector = await prismaClient.inspector.findFirstOrThrow();
    await assert.rejects(
      prismaClient.inspector.create({ data: { email: inspector.email, passwordHash: 'synthetic-duplicate-hash', status: 'QA' } }),
      (error) => error?.code === 'P2002',
    );
    assert.equal(await prismaClient.inspector.count({ where: { email: inspector.email } }), 1);
  });

  await t.test('rejects duplicate Session.tokenHash in PostgreSQL', async () => {
    const session = await prismaClient.session.findFirstOrThrow();
    await assert.rejects(
      prismaClient.session.create({
        data: { inspectorId: session.inspectorId, tokenHash: session.tokenHash, expiresAt: session.expiresAt },
      }),
      (error) => error?.code === 'P2002',
    );
    assert.equal(await prismaClient.session.count({ where: { tokenHash: session.tokenHash } }), 1);
  });

  await t.test('rejects required null or missing fields at the Prisma boundary', async () => {
    await assert.rejects(
      prismaClient.district.create({ data: { name: null } }),
      (error) => error?.name === 'PrismaClientValidationError',
    );
    await assert.rejects(
      prismaClient.inspector.create({ data: { email: 'qa-missing@example.invalid', passwordHash: null, status: 'QA' } }),
      (error) => error?.name === 'PrismaClientValidationError',
    );
    await assert.rejects(
      prismaClient.inspectorDistrictMembership.create({ data: { inspectorId: randomUUID(), districtId: randomUUID(), validFrom: new Date() } }),
      (error) => error?.name === 'PrismaClientValidationError',
    );
    await assert.rejects(
      prismaClient.session.create({ data: { inspectorId: randomUUID(), expiresAt: new Date() } }),
      (error) => error?.name === 'PrismaClientValidationError',
    );
  });

  await t.test('rejects orphan Membership and Session foreign keys', async () => {
    const inspector = await prismaClient.inspector.findFirstOrThrow();
    const district = await prismaClient.district.findFirstOrThrow();
    await assert.rejects(
      prismaClient.inspectorDistrictMembership.create({
        data: { inspectorId: randomUUID(), districtId: district.id, role: 'QA', validFrom: new Date() },
      }), isForeignKeyFailure,
    );
    await assert.rejects(
      prismaClient.inspectorDistrictMembership.create({
        data: { inspectorId: inspector.id, districtId: randomUUID(), role: 'QA', validFrom: new Date() },
      }), isForeignKeyFailure,
    );
    await assert.rejects(
      prismaClient.session.create({ data: { inspectorId: randomUUID(), tokenHash: 'synthetic-orphan', expiresAt: new Date() } }),
      isForeignKeyFailure,
    );
  });

  await t.test('restricts deletion of referenced Inspector and District rows', async () => {
    const membership = await prismaClient.inspectorDistrictMembership.findFirstOrThrow({
      include: { inspector: true, district: true },
    });
    const { inspector, district } = membership;
    await assert.rejects(prismaClient.inspector.delete({ where: { id: inspector.id } }));
    await assert.rejects(prismaClient.district.delete({ where: { id: district.id } }));
    assert.ok(await prismaClient.inspector.findUnique({ where: { id: inspector.id } }));
    assert.ok(await prismaClient.district.findUnique({ where: { id: district.id } }));
  });
});
