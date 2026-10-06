import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';
import { approvedTestDatabaseUrl, assertLiveTestDatabase, createOwnedTestSchema, dropOwnedTestSchema, generateTestSchema } from '../../../scripts/test-schema-safety.mjs';

test('additive evolution upgrades the complete prior migration chain without rewriting historical records', async () => {
  const base = approvedTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const admin = new PrismaClient({ datasources: { db: { url: base } } });
  const schema = generateTestSchema('task090_upgrade');
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve('prisma/package.json');
  const cli = resolve(dirname(pkgPath), JSON.parse(readFileSync(pkgPath, 'utf8')).bin.prisma);
  const prismaDir = resolve(dirname(fileURLToPath(import.meta.url)), '../prisma');
  const latest = '20261005180000_product_evolution_teacher_portal';
  const scratch = mkdtempSync(join(tmpdir(), 'inspector-evolution-upgrade-'));
  let owned = false; let db;
  try {
    await assertLiveTestDatabase(admin);
    const scoped = await createOwnedTestSchema(admin, base, schema); owned = true;
    const migrations = join(scratch, 'migrations'); mkdirSync(migrations);
    cpSync(join(prismaDir, 'schema.prisma'), join(scratch, 'schema.prisma'));
    cpSync(join(prismaDir, 'migrations/migration_lock.toml'), join(migrations, 'migration_lock.toml'));
    const names = readdirSync(join(prismaDir, 'migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    for (const name of names.filter((name) => name < latest)) cpSync(join(prismaDir, 'migrations', name), join(migrations, name), { recursive: true });
    function deploy() {
      const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', join(scratch, 'schema.prisma')], { env: { ...process.env, DATABASE_URL: scoped }, windowsHide: true, encoding: 'utf8', timeout: 120000 });
      assert.equal(result.status, 0, 'Owned upgrade deployment must succeed; credential-bearing CLI output is withheld');
    }
    deploy(); db = new PrismaClient({ datasources: { db: { url: scoped } } });
    const district = await db.district.create({ data: { name: 'Synthetic historical district' } });
    const inspector = await db.inspector.create({ data: { email: `${randomUUID()}@example.invalid`, passwordHash: 'unused-synthetic', status: 'ACTIVE', name: 'Old', surname: 'Inspector' } });
    const institution = await db.institution.create({ data: { districtId: district.id, name: 'Historical home' } });
    const teacher = await db.teacher.create({ data: { districtId: district.id, institutionId: institution.id, name: 'Old', surname: 'Teacher', professionalStatus: 'TRAINEE', qualifications: 'Legacy text retained' }, select: { id: true } });
    const schedule = await db.weeklySchedule.create({ data: { teacherId: teacher.id, academicYear: '2025-2026', slots: { create: [{ dayOfWeek: 1, startMinute: 480, endMinute: 540 }] } } });
    const visit = await db.pedagogicalVisit.create({ data: { districtId: district.id, inspectorId: inspector.id, teacherId: teacher.id, institutionId: institution.id, institutionNameSnapshot: 'Historical home snapshot', academicYear: '2025-2026', visitType: 'GUIDANCE', scheduledStartAt: new Date('2025-10-01T08:00:00Z'), scheduledEndAt: new Date('2025-10-01T09:00:00Z') } });
    await db.inspectionReport.create({ data: { visitId: visit.id, reportType: 'INSPECTOR_VISIT', templateSource: 'PRODUCT_OWNER_ADOPTED', levelClass: 'Legacy class', lessonTopic: 'Legacy topic', inspectorConclusion: 'Legacy conclusion', markText: 'historical mark text', status: 'FINAL', finalizedAt: new Date('2025-10-02'), finalizedByInspectorId: inspector.id, finalizedInspectorNameSnapshot: 'Old', finalizedInspectorSurnameSnapshot: 'Inspector', finalizedTeacherNameSnapshot: 'Old', finalizedTeacherSurnameSnapshot: 'Teacher' } });
    await db.auditLog.create({ data: { actorInspectorId: inspector.id, districtId: district.id, action: 'LEGACY_SENTINEL', entityType: 'Teacher', entityId: teacher.id, metadata: { retained: true } }, select: { id: true } });
    const tables = ['District', 'Inspector', 'Institution', 'Teacher', 'WeeklySchedule', 'WeeklyScheduleSlot', 'PedagogicalVisit', 'InspectionReport', 'AuditLog'];
    async function snapshots() { const result = {}; for (const table of tables) result[table] = await db.$queryRawUnsafe(`SELECT * FROM "${table}" ORDER BY "id"`); return result; }
    const before = await snapshots();
    await db.$disconnect();
    cpSync(join(prismaDir, 'migrations', latest), join(migrations, latest), { recursive: true }); deploy();
    db = new PrismaClient({ datasources: { db: { url: scoped } } });
    // Explicit 22 -> 23 upgrade fixtures: old REQUESTED correction and unsanitized photo.
    const correctionId = randomUUID(); const photoId = randomUUID(); const storageKey = randomUUID();
    await db.$executeRaw`INSERT INTO "ScheduleCorrection" (id,"teacherId","inspectorId","academicYear",note,"scheduleRevision","updatedAt") VALUES (${correctionId}::uuid,${teacher.id}::uuid,${inspector.id}::uuid,'2025-2026','Historical correction retained',1,CURRENT_TIMESTAMP)`;
    await db.$executeRaw`INSERT INTO "TeacherPhoto" (id,"teacherId","contentType","byteLength","storageKey") VALUES (${photoId}::uuid,${teacher.id}::uuid,'image/jpeg',100,${storageKey}::uuid)`;
    const oldCorrection = await db.$queryRaw`SELECT * FROM "ScheduleCorrection" WHERE id=${correctionId}::uuid`;
    const oldPhoto = await db.$queryRaw`SELECT * FROM "TeacherPhoto" WHERE id=${photoId}::uuid`;
    await db.$disconnect();
    for (const name of names.filter((name) => name > latest)) cpSync(join(prismaDir, 'migrations', name), join(migrations, name), { recursive: true }); deploy();
    // Reconnect after DDL: PostgreSQL's old prepared SELECT * plans cannot span a shape change.
    db = new PrismaClient({ datasources: { db: { url: scoped } } });
    const after = await snapshots();
    for (const row of after.Teacher) { assert.equal(row.trainingStatus, null); assert.equal(row.trainingVerifiedAt, null); delete row.trainingStatus; delete row.trainingVerifiedAt; }
    for (const row of after.AuditLog) { assert.equal(row.actorTeacherId, null); delete row.actorTeacherId; }
    assert.deepEqual(after, before);
    assert.equal(await db.teacherAccount.count(), 0);
    assert.equal(await db.teacherChangeRequest.count(), 0);
    assert.equal(await db.scheduleCorrection.count(), 1);
    const upgradedCorrection = await db.$queryRaw`SELECT * FROM "ScheduleCorrection" WHERE id=${correctionId}::uuid`;
    assert.equal(upgradedCorrection[0].origin, 'INSPECTOR_CORRECTION'); assert.equal(upgradedCorrection[0].decisionInspectorId, null); assert.equal(upgradedCorrection[0].decisionNote, null);
    delete upgradedCorrection[0].origin; delete upgradedCorrection[0].decisionInspectorId; delete upgradedCorrection[0].decisionNote; assert.deepEqual(upgradedCorrection, oldCorrection);
    const upgradedPhoto = await db.$queryRaw`SELECT * FROM "TeacherPhoto" WHERE id=${photoId}::uuid`;
    assert.equal(upgradedPhoto[0].sanitizationVersion, null); delete upgradedPhoto[0].sanitizationVersion; assert.deepEqual(upgradedPhoto, oldPhoto);
    assert.equal((await db.weeklySchedule.findUniqueOrThrow({ where: { id: schedule.id } })).revision, 1);
    const history = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`;
    assert.deepEqual(history.map((row) => row.migration_name), names);
    deploy(); assert.deepEqual(await snapshots(), { ...before, Teacher: before.Teacher.map((row) => ({ ...row, trainingStatus: null, trainingVerifiedAt: null })), AuditLog: before.AuditLog.map((row) => ({ ...row, actorTeacherId: null })) });
  } finally {
    await db?.$disconnect();
    try { if (owned) await dropOwnedTestSchema(admin, base, schema); } finally { await admin.$disconnect(); }
    // scratch is the exact directory created by this test, never a supplied path.
    assert.ok(scratch.startsWith(join(tmpdir(), 'inspector-evolution-upgrade-')), 'Unsafe temporary cleanup target');
    rmSync(scratch, { recursive: true, force: true });
  }
});
