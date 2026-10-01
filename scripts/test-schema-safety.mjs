import { randomBytes } from 'node:crypto';

const owned = new WeakMap();
const namePattern = /^(?:task[0-9]{3}a?(?:_(?:clean|upgrade|e2e))?|g3_e2e)_[0-9]+_[a-f0-9]{10,16}$/u;

export function approvedTestDatabaseUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid isolated test database URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.port !== '55432'
    || decodeURIComponent(url.username) !== 'task020_test_user'
    || url.pathname !== '/task020_test' || url.searchParams.get('schema') !== 'public') {
    throw new Error('Refusing an unapproved isolated test database target.');
  }
  return url.toString();
}

export async function assertLiveTestDatabase(admin) {
  const [row] = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role,
    inet_server_addr()::text AS address, inet_server_port() AS port`;
  if (row?.db !== 'task020_test' || row?.role !== 'task020_test_user'
    || !/^127\.0\.0\.1(?:\/\d+)?$/u.test(row?.address ?? '') || row?.port !== 55432) {
    throw new Error('Live isolated test database identity mismatch.');
  }
}

export function assertTestSchemaName(name) {
  if (typeof name !== 'string' || name.length > 63 || !namePattern.test(name)) {
    throw new Error('Unsafe automated test schema name.');
  }
  return name;
}

export function generateTestSchema(prefix) {
  if (!/^(?:task[0-9]{3}a?(?:_(?:clean|upgrade|e2e))?|g3_e2e)$/u.test(prefix)) {
    throw new Error('Unsafe automated test schema prefix.');
  }
  return assertTestSchemaName(`${prefix}_${process.pid}_${randomBytes(6).toString('hex')}`);
}

export function scopedTestDatabaseUrl(base, name) {
  const url = new URL(approvedTestDatabaseUrl(base));
  url.searchParams.set('schema', assertTestSchemaName(name));
  return url.toString();
}

export async function createOwnedTestSchema(admin, base, name) {
  approvedTestDatabaseUrl(base);
  assertTestSchemaName(name);
  await assertLiveTestDatabase(admin);
  const names = owned.get(admin) ?? new Set();
  if (names.has(name)) throw new Error('Test schema is already owned by this run.');
  const existing = await admin.$queryRaw`SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname = ${name}`;
  if (existing.length) throw new Error('Generated test schema already exists; refusing to reuse it.');
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${name}"`);
  names.add(name);
  owned.set(admin, names);
  return scopedTestDatabaseUrl(base, name);
}

export async function dropOwnedTestSchema(admin, base, name) {
  approvedTestDatabaseUrl(base);
  assertTestSchemaName(name);
  if (!owned.get(admin)?.has(name)) throw new Error('Refusing to drop an unowned test schema.');
  await assertLiveTestDatabase(admin);
  await admin.$executeRawUnsafe(`DROP SCHEMA "${name}" CASCADE`);
  const remaining = await admin.$queryRaw`SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname = ${name}`;
  if (remaining.length) throw new Error('Owned test schema cleanup failed.');
  owned.get(admin).delete(name);
}
