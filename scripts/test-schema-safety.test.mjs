import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approvedTestDatabaseUrl, assertTestSchemaName, createOwnedTestSchema,
  dropOwnedTestSchema, generateTestSchema, scopedTestDatabaseUrl,
} from './test-schema-safety.mjs';

const safeUrl = 'postgresql://task020_test_user:masked@127.0.0.1:55432/task020_test?schema=public';

test('accepts only the authorized local isolated database identity in URL', () => {
  assert.equal(new URL(approvedTestDatabaseUrl(safeUrl)).port, '55432');
  for (const unsafe of [
    safeUrl.replace('55432', '5432'),
    safeUrl.replace('/task020_test?', '/postgres?'),
    safeUrl.replace('task020_test_user', 'other'),
    safeUrl.replace('127.0.0.1', 'db.example.invalid'),
    safeUrl.replace('?schema=public', '?schema=other'),
  ]) assert.throws(() => approvedTestDatabaseUrl(unsafe));
});

test('generates constrained names and rejects public, malformed, and unapproved names', () => {
  const name = generateTestSchema('task085_e2e');
  assert.match(name, /^task085_e2e_[0-9]+_[a-f0-9]{12}$/u);
  assert.equal(new URL(scopedTestDatabaseUrl(safeUrl, name)).searchParams.get('schema'), name);
  for (const unsafe of ['', 'public', 'arbitrary_123_0123456789ab', 'task085_1_bad-name', 'task085_' + '1'.repeat(64)]) {
    assert.throws(() => assertTestSchemaName(unsafe));
  }
});

test('only the current client run can drop the exact schema it created', async () => {
  const name = generateTestSchema('task085');
  const schemas = new Set();
  const dropped = [];
  const admin = {
    async $queryRaw(strings, value) {
      const query = strings.join('?');
      if (query.includes('pg_namespace')) return schemas.has(value) ? [{ nspname: value }] : [];
      return [{ db: 'task020_test', role: 'task020_test_user', address: '127.0.0.1/32', port: 55432 }];
    },
    async $executeRawUnsafe(sql) {
      const match = sql.match(/^(CREATE|DROP) SCHEMA "([a-z0-9_]+)"(?: CASCADE)?$/u);
      assert.ok(match);
      if (match[1] === 'CREATE') schemas.add(match[2]);
      else { dropped.push(match[2]); schemas.delete(match[2]); }
    },
  };
  await assert.rejects(dropOwnedTestSchema(admin, safeUrl, name), /unowned/u);
  const scoped = await createOwnedTestSchema(admin, safeUrl, name);
  assert.equal(new URL(scoped).searchParams.get('schema'), name);
  await assert.rejects(createOwnedTestSchema(admin, safeUrl, name), /already/u);
  let controlledFailure;
  try { throw new Error('controlled test failure'); }
  catch (error) { controlledFailure = error; }
  finally { await dropOwnedTestSchema(admin, safeUrl, name); }
  assert.match(controlledFailure.message, /controlled/u);
  assert.deepEqual(dropped, [name]);
  assert.equal(schemas.has(name), false);
});

test('fails closed when the live database identity is not approved', async () => {
  const admin = { async $queryRaw() { return [{ db: 'task020_test', role: 'task020_test_user', address: '10.0.0.2', port: 55432 }]; } };
  await assert.rejects(createOwnedTestSchema(admin, safeUrl, generateTestSchema('task020')), /identity mismatch/u);
});
