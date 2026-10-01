import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { assertTarget, parseApprovedUrl, UAT_DATABASE, UAT_INSPECTOR } from './local-uat.mjs';

const allowed = 'postgresql://task020_test_user:masked@127.0.0.1:55432/task020_test';

test('accepts only the approved isolated UAT target', () => {
  const parsed = new URL(parseApprovedUrl(allowed));
  assert.equal(parsed.hostname, UAT_DATABASE.host);
  assert.equal(parsed.port, String(UAT_DATABASE.port));
  assert.equal(parsed.pathname, `/${UAT_DATABASE.database}`);
  assert.equal(decodeURIComponent(parsed.username), UAT_DATABASE.user);
  assert.equal(parsed.searchParams.get('schema'), 'public');
});

test('rejects wrong port, database, user, and remote hosts', () => {
  for (const unsafe of [
    allowed.replace('55432', '5432'),
    allowed.replace('/task020_test', '/postgres'),
    allowed.replace('task020_test_user', 'postgres'),
    allowed.replace('127.0.0.1', 'db.example.invalid'),
    allowed + '?schema=other',
  ]) assert.throws(() => parseApprovedUrl(unsafe));
});

test('provides fixed synthetic inspector identity for repeatable seed runs', () => {
  assert.equal(UAT_INSPECTOR.email, 'local-uat-inspector@example.invalid');
  assert.match(UAT_INSPECTOR.id, /^[0-9a-f-]{36}$/u);
});

test('persistent UAT seed is idempotent and preserves declaration-only boundaries', async () => {
  const password = process.env.LOCAL_UAT_INSPECTOR_PASSWORD;
  assert.ok(password && password.length >= 20, 'load the local-only password file into LOCAL_UAT_INSPECTOR_PASSWORD');
  const secretPath = 'D:\\pg-task020-temp\\task020-test-url.secret';
  const text = readFileSync(secretPath, 'utf8').trim();
  const raw = text.match(/^(?:TEST_DATABASE_URL|DATABASE_URL)=(.*)$/u)?.[1]?.trim() ?? text;
  const url = parseApprovedUrl(raw);
  const require = createRequire(resolve(process.cwd(), 'packages/api/package.json'));
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await db.$connect();
    await assertTarget(db);
    const summarize = async () => db.$queryRawUnsafe(`SELECT
      (SELECT count(*)::int FROM "District" WHERE "id"='84000000-0000-4000-8000-000000000001') AS districts,
      (SELECT count(*)::int FROM "Inspector" WHERE "id"='84000000-0000-4000-8000-000000000001') AS inspectors,
      (SELECT count(*)::int FROM "Institution" WHERE "id" BETWEEN '84000000-0000-4000-8000-000000000010'::uuid AND '84000000-0000-4000-8000-000000000015'::uuid) AS institutions,
      (SELECT count(*)::int FROM "Teacher" WHERE "id" BETWEEN '84000000-0000-4000-8000-000000000100'::uuid AND '84000000-0000-4000-8000-000000000109'::uuid) AS teachers,
      (SELECT count(*)::int FROM "PedagogicalVisit" WHERE "id" BETWEEN '84000000-0000-4000-8000-000000000600'::uuid AND '84000000-0000-4000-8000-000000000605'::uuid) AS visits,
      (SELECT count(*)::int FROM "InspectionReport" WHERE "id" BETWEEN '84000000-0000-4000-8000-000000000700'::uuid AND '84000000-0000-4000-8000-000000000702'::uuid) AS reports,
      (SELECT count(*)::int FROM "FollowUp" WHERE "id" BETWEEN '84000000-0000-4000-8000-000000000800'::uuid AND '84000000-0000-4000-8000-000000000801'::uuid) AS followups,
      (SELECT count(*)::int FROM "TeacherSubmission" WHERE "id" BETWEEN '84000000-0000-4000-8000-000000000900'::uuid AND '84000000-0000-4000-8000-000000000903'::uuid) AS submissions`);
    const before = (await summarize())[0];
    assert.deepEqual(before, { districts: 1, inspectors: 1, institutions: 6, teachers: 10, visits: 6, reports: 3, followups: 2, submissions: 4 });
    for (let run = 0; run < 2; run += 1) {
      const result = spawnSync(process.execPath, [resolve(process.cwd(), 'scripts/local-uat.mjs'), 'seed'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', windowsHide: true });
      assert.equal(result.status, 0, 'repeat seed must succeed');
    }
    await assertTarget(db);
    assert.deepEqual((await summarize())[0], before);
    const inspector = await db.inspector.findUniqueOrThrow({ where: { id: UAT_INSPECTOR.id }, include: { memberships: true } });
    assert.equal(inspector.status, 'ACTIVE');
    assert.ok(inspector.memberships.some((item) => item.districtId === '84000000-0000-4000-8000-000000000001' && item.validFrom <= new Date() && (!item.validTo || item.validTo > new Date())));
    const pending = await db.teacherSubmission.findUniqueOrThrow({ where: { id: '84000000-0000-4000-8000-000000000903' }, include: { qualificationDeclarations: true, supplementaryWorkplaceDeclarations: true } });
    assert.equal(pending.status, 'PENDING');
    assert.equal(pending.qualificationDeclarations.length, 1);
    assert.equal(pending.supplementaryWorkplaceDeclarations.length, 1);
    assert.equal(pending.firstEducationAppointmentDecisionNumber, 'تصريح قرار توظيف غير معتمد');
    assert.equal(pending.institutionAppointmentNumber, 'تصريح تعيين مؤسسة غير معتمد');
    assert.equal(pending.declaredHomeInstitutionEmail, 'declared-only@example.invalid');
    assert.equal(await db.teacherQualification.count({ where: { name: 'مؤهل مصرح به غير معتمد' } }), 0);
    assert.equal(await db.teacherSupplementaryWorkplace.count({ where: { institution: { name: 'مؤسسة إضافية مصرح بها فقط' } } }), 0);
    assert.equal(await db.teacher.count({ where: { firstEducationAppointmentDecisionNumber: 'تصريح قرار توظيف غير معتمد' } }), 0);
    assert.equal(await db.teacher.count({ where: { institutionAppointmentNumber: 'تصريح تعيين مؤسسة غير معتمد' } }), 0);
    assert.equal(await db.teacher.count({ where: { id: pending.acceptedTeacherId ?? '84000000-0000-4000-8000-000000000900' } }), 0);
  } finally { await db.$disconnect(); }
});
