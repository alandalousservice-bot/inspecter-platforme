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

let databaseUrl;
let scopedUrl;
let schemaName;
let schemaCreated = false;
let adminClient;
let prismaClient;
let inspector;
let district;
let otherDistrict;

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

const at = (value) => new Date(`${value}T00:00:00.000Z`);

async function membership(data) {
  return prismaClient.inspectorDistrictMembership.create({
    data: { role: 'INSPECTOR', ...data },
  });
}

before(async () => {
  databaseUrl = approvedTestUrl();
  runPrisma(['generate'], databaseUrl, 'Prisma Client generation');

  const { PrismaClient } = await import('@prisma/client');
  adminClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await adminClient.$connect();
  const identity = await adminClient.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  if (identity[0]?.db !== 'task020_test' || identity[0]?.role !== 'task020_test_user') {
    throw new Error('Database identity probe did not match the isolated test target.');
  }
  schemaName = `task022_${process.pid}_${randomBytes(6).toString('hex')}`;
  await adminClient.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  schemaCreated = true;
  const scoped = new URL(databaseUrl);
  scoped.searchParams.set('schema', schemaName);
  scopedUrl = scoped.toString();
  runPrisma(['migrate', 'deploy'], scopedUrl, 'TASK-022 clean migration deploy');
  prismaClient = new PrismaClient({ datasources: { db: { url: scopedUrl } } });
  await prismaClient.$connect();

  const suffix = randomBytes(6).toString('hex');
  inspector = await prismaClient.inspector.create({
    data: { email: `task022-${suffix}@example.invalid`, passwordHash: 'synthetic-hash', status: 'ACTIVE' },
  });
  district = await prismaClient.district.create({ data: { name: `Task 022 district ${suffix}` } });
  otherDistrict = await prismaClient.district.create({ data: { name: `Task 022 district other ${suffix}` } });
});

after(async () => {
  await prismaClient?.$disconnect();
  if (adminClient && schemaCreated && schemaName) {
    await adminClient.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  }
  await adminClient?.$disconnect();
});

test('TASK-022 migration installs membership range checks without pair uniqueness', async () => {
  const constraints = await prismaClient.$queryRaw`
    SELECT conname, contype, pg_get_constraintdef(oid) AS definition
    FROM pg_catalog.pg_constraint
    WHERE conrelid = to_regclass(${`${schemaName}."InspectorDistrictMembership"`})
    ORDER BY conname
  `;
  const check = constraints.find((constraint) => constraint.conname === 'InspectorDistrictMembership_validTo_not_before_validFrom');
  const exclusion = constraints.find((constraint) => constraint.conname === 'InspectorDistrictMembership_no_overlapping_periods');
  assert.equal(check?.contype, 'c');
  assert.match(check.definition, /validTo.*validFrom/s);
  assert.equal(exclusion?.contype, 'x');
  assert.match(exclusion.definition, /inspectorId.*districtId.*tsrange/s);
  assert.ok(!constraints.some((constraint) => constraint.contype === 'u' && /inspectorId.*districtId/s.test(constraint.definition)));
  const extension = await prismaClient.$queryRaw`SELECT extname FROM pg_catalog.pg_extension WHERE extname = 'btree_gist'`;
  assert.equal(extension.length, 1);
});

test('TASK-022 rejects validTo before validFrom and allows equality as an empty interval', async () => {
  await assert.rejects(membership({
    inspectorId: inspector.id,
    districtId: district.id,
    validFrom: at('2042-02-01'),
    validTo: at('2042-01-31'),
  }));
  const empty = await membership({
    inspectorId: inspector.id,
    districtId: district.id,
    validFrom: at('2042-03-01'),
    validTo: at('2042-03-01'),
  });
  assert.equal(empty.validTo.getTime(), empty.validFrom.getTime());
});

test('TASK-022 permits historical non-overlapping memberships and shared half-open boundaries', async () => {
  const first = await membership({
    inspectorId: inspector.id,
    districtId: district.id,
    validFrom: at('2043-01-01'),
    validTo: at('2043-02-01'),
  });
  const second = await membership({
    inspectorId: inspector.id,
    districtId: district.id,
    validFrom: first.validTo,
    validTo: at('2043-03-01'),
  });
  assert.notEqual(first.id, second.id);
  assert.equal(await prismaClient.inspectorDistrictMembership.count({ where: { inspectorId: inspector.id, districtId: district.id } }), 3);
});

test('TASK-022 rejects overlapping and open-ended duplicate periods for one Inspector/District', async () => {
  await membership({
    inspectorId: inspector.id,
    districtId: district.id,
    validFrom: at('2044-01-01'),
    validTo: at('2044-06-01'),
  });
  await assert.rejects(membership({
    inspectorId: inspector.id,
    districtId: district.id,
    validFrom: at('2044-05-01'),
    validTo: at('2044-07-01'),
  }));

  await membership({
    inspectorId: inspector.id,
    districtId: district.id,
    validFrom: at('2045-01-01'),
    validTo: null,
  });
  await assert.rejects(membership({
    inspectorId: inspector.id,
    districtId: district.id,
    validFrom: at('2045-08-01'),
    validTo: at('2045-09-01'),
  }));
});

test('TASK-022 allows one Inspector memberships in different Districts over the same interval', async () => {
  const separateInspector = await prismaClient.inspector.create({
    data: { email: `task022-parallel-${randomBytes(6).toString('hex')}@example.invalid`, passwordHash: 'synthetic-hash', status: 'ACTIVE' },
  });
  const period = { validFrom: at('2046-01-01'), validTo: at('2046-12-31') };
  const first = await membership({ inspectorId: separateInspector.id, districtId: district.id, ...period });
  const second = await membership({ inspectorId: separateInspector.id, districtId: otherDistrict.id, ...period });
  assert.notEqual(first.districtId, second.districtId);
});

test('TASK-022 district policy grants current membership and conceals cross-district absence', async () => {
  const { requireInspectorDistrictMembership } = await import('../dist/policy/district-access.js');
  const now = new Date();
  const current = await membership({
    inspectorId: inspector.id,
    districtId: otherDistrict.id,
    validFrom: new Date(now.getTime() - 60_000),
    validTo: null,
  });
  const found = await requireInspectorDistrictMembership(prismaClient, inspector.id, otherDistrict.id, now);
  assert.equal(found.id, current.id);
  await assert.rejects(
    requireInspectorDistrictMembership(prismaClient, inspector.id, district.id, now),
    (error) => error?.status === 404 && error?.code === 'NOT_FOUND',
  );
  await assert.rejects(
    requireInspectorDistrictMembership(prismaClient, inspector.id, '00000000-0000-4000-8000-000000000000', now),
    (error) => error?.status === 404 && error?.code === 'NOT_FOUND',
  );
});
