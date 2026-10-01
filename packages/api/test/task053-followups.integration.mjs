import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import process from 'node:process';
import { createApp } from '../dist/app.js';
import { registerAuthRoutes, requireAuthenticatedInspector } from '../dist/identity/auth-routes.js';
import { registerInspectionReportRoutes } from '../dist/reports/routes.js';
import { registerFollowUpRoutes } from '../dist/followups/routes.js';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(apiDir, '../..');
const migrationsDir = join(apiDir, 'prisma', 'migrations');
const schemaFile = join(apiDir, 'prisma', 'schema.prisma');
const prismaPackage = require.resolve('prisma/package.json');
const prismaCli = resolve(dirname(prismaPackage), JSON.parse(readFileSync(prismaPackage, 'utf8')).bin.prisma);
const { PrismaClient } = require('@prisma/client');
const migrationName = '20260930030000_task_053_follow_up';
let admin, db, server, baseUrl, cleanSchema, upgradeSchema, tempRoot, owner, other, district, otherDistrict, institution, teacher, cookies, otherCookies;
let visitSequence = 0;
const password = `task053-${randomUUID()}`;

function approvedUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('Approved isolated test DB is required.');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55432' || url.username !== 'task020_test_user' || url.pathname !== '/task020_test' || url.searchParams.get('schema') !== 'public') throw new Error('Refusing unapproved DB target.');
  return value;
}
function schemaUrl(raw, schema) { const url = new URL(raw); url.searchParams.set('schema', schema); return url.toString(); }
function migrate(url, prismaSchema = schemaFile) {
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', prismaSchema], { cwd: root, env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8', windowsHide: true, timeout: 120_000 });
  if (result.error || result.status !== 0) throw new Error('Isolated migration failed.');
}
const cookieParts = (response) => (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).filter(Boolean);
const cookieHeader = (parts) => parts.map((part) => part.split(';', 1)[0]).join('; ');
const csrf = (parts) => decodeURIComponent(parts.find((part) => part.startsWith('inspector_csrf='))?.split(';', 1)[0].slice(15) ?? '');
async function login(user) {
  const bootstrap = cookieParts(await fetch(`${baseUrl}/api/v1/auth/me`));
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { cookie: cookieHeader(bootstrap), 'x-csrf-token': csrf(bootstrap), 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
  return { response, cookies: cookieParts(response) };
}
async function call(path, method = 'GET', body, selected = cookies, omitCsrf = false) {
  const headers = { 'content-type': 'application/json' };
  if (selected?.length) headers.cookie = cookieHeader(selected);
  if (method !== 'GET' && selected?.length && !omitCsrf) headers['x-csrf-token'] = csrf(selected);
  return fetch(`${baseUrl}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function makeFinalReport(suffix = randomUUID()) {
  visitSequence += 1;
  const start = new Date(Date.UTC(2028, 0, 1 + visitSequence, 8));
  const visit = await db.pedagogicalVisit.create({ data: { districtId: district.id, inspectorId: owner.id, teacherId: teacher.id, institutionId: institution.id,
    institutionNameSnapshot: 'المؤسسة التاريخية', academicYear: '2026-2027', scheduledStartAt: start, scheduledEndAt: new Date(start.getTime() + 3600000), status: 'COMPLETED', occurredAt: new Date() } });
  const report = await db.inspectionReport.create({ data: { visitId: visit.id, status: 'FINAL', revision: 3, levelClass: 'السنة الرابعة', lessonTopic: 'الألعاب', pedagogicalObservations: 'ملاحظة', strengths: 'قوة', improvementAreas: 'تحسين', guidanceRecommendations: 'توجيه', inspectorConclusion: 'خلاصة', finalizedAt: new Date('2028-01-01T09:00:00Z'), finalizedByInspectorId: owner.id,
    finalizedInspectorNameSnapshot: 'اسم تاريخي', finalizedInspectorSurnameSnapshot: 'لقب تاريخي', finalizedTeacherNameSnapshot: `معلم-${suffix}`, finalizedTeacherSurnameSnapshot: 'تاريخي' } });
  await db.auditLog.create({ data: { actorInspectorId: owner.id, districtId: district.id, action: 'INSPECTION_REPORT_FINALIZED', entityType: 'InspectionReport', entityId: report.id, metadata: {} } });
  return { visit, report };
}
async function makeReportWithStatuses(visitStatus, reportStatus, options = {}) {
  visitSequence += 1;
  const districtId = options.districtId ?? district.id;
  const inspectorId = options.inspectorId ?? owner.id;
  const teacherId = options.teacherId ?? teacher.id;
  const institutionId = options.institutionId ?? institution.id;
  const start = new Date(Date.UTC(2028, 0, 1 + visitSequence, 8));
  const visit = await db.pedagogicalVisit.create({ data: { districtId, inspectorId, teacherId, institutionId,
    institutionNameSnapshot: options.institutionNameSnapshot ?? 'مؤسسة اختبار', academicYear: '2026-2027', scheduledStartAt: start,
    scheduledEndAt: new Date(start.getTime() + 3_600_000), status: visitStatus,
    ...(visitStatus === 'COMPLETED' ? { occurredAt: new Date() } : {}) } });
  const report = await db.inspectionReport.create({ data: { visitId: visit.id, status: reportStatus, revision: 1,
    ...(reportStatus === 'FINAL' ? { levelClass: 'السنة الرابعة', lessonTopic: 'الألعاب', inspectorConclusion: 'خلاصة', finalizedAt: new Date(),
      finalizedByInspectorId: inspectorId, finalizedInspectorNameSnapshot: 'مفتش', finalizedInspectorSurnameSnapshot: 'اختبار',
      finalizedTeacherNameSnapshot: 'أستاذ', finalizedTeacherSurnameSnapshot: 'اختبار' } : {}) } });
  return { visit, report };
}

before(async () => {
  const raw = approvedUrl(); admin = new PrismaClient({ datasources: { db: { url: raw } } }); await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  assert.deepEqual(identity[0], { db: 'task020_test', role: 'task020_test_user' });
  const suffix = `${process.pid}_${randomBytes(5).toString('hex')}`; cleanSchema = `task053_clean_${suffix}`; upgradeSchema = `task053_upgrade_${suffix}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${cleanSchema}"`); await admin.$executeRawUnsafe(`CREATE SCHEMA "${upgradeSchema}"`);
  migrate(schemaUrl(raw, cleanSchema));
  const history = await admin.$queryRawUnsafe(`SELECT migration_name,finished_at FROM "${cleanSchema}"."_prisma_migrations" ORDER BY started_at`);
  assert.equal(history.length, 19); assert.equal(history.at(-1).migration_name, '20261003100000_task_085_public_intake_evolution'); assert.ok(history.every((row) => row.finished_at));
  tempRoot = mkdtempSync(join(tmpdir(), 'task053-migrations-')); const oldMigrations = join(tempRoot, 'migrations');
  cpSync(join(migrationsDir, 'migration_lock.toml'), join(tempRoot, 'migration_lock.toml'));
  for (const item of readdirSync(migrationsDir, { withFileTypes: true })) if (item.isDirectory() && item.name !== migrationName) cpSync(join(migrationsDir, item.name), join(oldMigrations, item.name), { recursive: true });
  const oldSchema = join(tempRoot, 'schema.prisma'); cpSync(schemaFile, oldSchema);
  const upgradeUrl = schemaUrl(raw, upgradeSchema); migrate(upgradeUrl, oldSchema);
  const legacy = new PrismaClient({ datasources: { db: { url: upgradeUrl } } });
  const d = await legacy.district.create({ data: { name: 'TASK-053 preserved' } });
  const i = await legacy.inspector.create({ data: { email: `legacy-${suffix}@example.invalid`, passwordHash: 'synthetic', status: 'ACTIVE' } });
  const inst = await legacy.institution.create({ data: { districtId: d.id, name: 'Preserved institution' } });
  const t = await legacy.teacher.create({ data: { districtId: d.id, institutionId: inst.id, name: 'Legacy', surname: 'Teacher' } });
  const v = await legacy.pedagogicalVisit.create({ data: { districtId: d.id, inspectorId: i.id, teacherId: t.id, institutionId: inst.id, institutionNameSnapshot: 'Snapshot', academicYear: '2026-2027', scheduledStartAt: new Date('2028-01-01T08:00:00Z'), scheduledEndAt: new Date('2028-01-01T09:00:00Z'), status: 'COMPLETED', occurredAt: new Date() } });
  const r = await legacy.inspectionReport.create({ data: { visitId: v.id, status: 'FINAL', levelClass: 'مستوى', lessonTopic: 'موضوع', inspectorConclusion: 'خلاصة', finalizedAt: new Date(), finalizedByInspectorId: i.id, finalizedInspectorNameSnapshot: 'اسم', finalizedInspectorSurnameSnapshot: 'لقب', finalizedTeacherNameSnapshot: 'أستاذ', finalizedTeacherSurnameSnapshot: 'قديم' } });
  const oldAudit = await legacy.auditLog.create({ data: { actorInspectorId: i.id, districtId: d.id, action: 'INSPECTION_REPORT_FINALIZED', entityType: 'InspectionReport', entityId: r.id, metadata: {} } });
  await legacy.$disconnect();
  cpSync(join(migrationsDir, migrationName), join(oldMigrations, migrationName), { recursive: true }); migrate(upgradeUrl, oldSchema);
  const upgraded = new PrismaClient({ datasources: { db: { url: upgradeUrl } } });
  assert.equal((await upgraded.pedagogicalVisit.findUniqueOrThrow({ where: { id: v.id } })).institutionNameSnapshot, 'Snapshot');
  assert.equal((await upgraded.inspectionReport.findUniqueOrThrow({ where: { id: r.id } })).finalizedTeacherSurnameSnapshot, 'قديم');
  assert.ok(await upgraded.auditLog.findUniqueOrThrow({ where: { id: oldAudit.id } }));
  assert.equal(await upgraded.followUp.count(), 0); await upgraded.$disconnect();

  db = new PrismaClient({ datasources: { db: { url: schemaUrl(raw, cleanSchema) } } }); await db.$connect();
  const { hashPassword } = await import('../dist/identity/password.js'); const passwordHash = await hashPassword(password);
  owner = await db.inspector.create({ data: { email: `owner-${suffix}@example.invalid`, passwordHash, status: 'ACTIVE', name: 'مفتش', surname: 'مالك' } });
  other = await db.inspector.create({ data: { email: `other-${suffix}@example.invalid`, passwordHash, status: 'ACTIVE', name: 'مفتش', surname: 'آخر' } });
  district = await db.district.create({ data: { name: 'مقاطعة متابعة' } }); otherDistrict = await db.district.create({ data: { name: 'مقاطعة أخرى' } });
  await db.inspectorDistrictMembership.createMany({ data: [owner, other].map((person) => ({ inspectorId: person.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(Date.now() - 60_000) })) });
  await db.inspectorDistrictMembership.create({ data: { inspectorId: owner.id, districtId: otherDistrict.id, role: 'INSPECTOR', validFrom: new Date(Date.now() - 60_000) } });
  institution = await db.institution.create({ data: { districtId: district.id, name: 'ابتدائية تاريخية' } });
  teacher = await db.teacher.create({ data: { districtId: district.id, institutionId: institution.id, name: 'اسم حالي', surname: 'لقب حالي', email: 'private@example.invalid' } });
  server = createApp((app) => { registerAuthRoutes(app, db); const auth = requireAuthenticatedInspector(db); registerInspectionReportRoutes(app, db, auth); registerFollowUpRoutes(app, db, auth); }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); }); baseUrl = `http://127.0.0.1:${server.address().port}`;
  cookies = (await login(owner)).cookies; otherCookies = (await login(other)).cookies;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve)); await db?.$disconnect();
  if (admin && cleanSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${cleanSchema}" CASCADE`);
  if (admin && upgradeSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${upgradeSchema}" CASCADE`);
  if (admin && cleanSchema && upgradeSchema) {
    const left = await admin.$queryRaw`SELECT count(*)::int AS count FROM pg_namespace WHERE nspname IN (${cleanSchema}, ${upgradeSchema})`;
    assert.equal(left[0].count, 0);
  }
  await admin?.$disconnect(); if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('TASK-053 persistence, scoped APIs, lifecycle, alerts, audit and races', async (t) => {
  const { report } = await makeFinalReport(); const reportPath = `/api/v1/reports/${report.id}/follow-ups`;
  const reportSnapshot = async () => {
    const row = await db.inspectionReport.findUniqueOrThrow({ where: { id: report.id } });
    return row;
  };
  await t.test('DB constraints, relation cardinality and FK restrict', async () => {
    const constraints = await db.$queryRaw`SELECT conname,contype,confdeltype,confupdtype FROM pg_constraint WHERE connamespace=current_schema()::regnamespace`;
    for (const name of ['FollowUp_status_check','FollowUp_revision_positive_check','FollowUp_note_length_check','FollowUp_completionNote_length_check','FollowUp_lifecycle_check']) assert.ok(constraints.some((c) => c.conname === name && c.contype === 'c'));
    for (const name of ['FollowUp_reportId_fkey','FollowUp_ownerInspectorId_fkey']) { const fk = constraints.find((c) => c.conname === name); assert.equal(fk.confdeltype, 'r'); assert.equal(fk.confupdtype, 'r'); }
    const created = await db.followUp.create({ data: { reportId: report.id, ownerInspectorId: owner.id, note: 'إجراء أول', dueDate: new Date('2026-09-30T00:00:00Z') } });
    assert.equal(created.status, 'OPEN'); assert.equal(created.revision, 1); assert.ok(created.createdAt); assert.ok(created.updatedAt);
    await db.followUp.create({ data: { reportId: report.id, ownerInspectorId: owner.id, note: 'إجراء ثان', dueDate: new Date('2026-10-01T00:00:00Z') } });
    await assert.rejects(db.$executeRaw`INSERT INTO "FollowUp" ("id","reportId","ownerInspectorId","status","note","dueDate","revision","createdAt","updatedAt") VALUES (${randomUUID()}::uuid,${report.id}::uuid,${owner.id}::uuid,'INVALID','x','2026-10-01',1,now(),now())`);
    await assert.rejects(db.$executeRaw`UPDATE "FollowUp" SET "revision"=0 WHERE "reportId"=${report.id}::uuid`);
    await assert.rejects(db.$executeRaw`UPDATE "FollowUp" SET "completedAt"=now() WHERE "reportId"=${report.id}::uuid AND "status"='OPEN'`);
    await assert.rejects(db.$executeRaw`UPDATE "FollowUp" SET "note"=repeat('x',1001) WHERE "reportId"=${report.id}::uuid`);
    await assert.rejects(db.$executeRaw`UPDATE "FollowUp" SET "completionNote"='غير مسموح' WHERE "reportId"=${report.id}::uuid AND "status"='OPEN'`);
    await assert.rejects(db.$executeRaw`UPDATE "FollowUp" SET "status"='COMPLETED' WHERE "reportId"=${report.id}::uuid AND "status"='OPEN'`);
    await assert.rejects(db.$executeRaw`INSERT INTO "FollowUp" ("id","reportId","ownerInspectorId","status","note","dueDate","completionNote","completedAt","revision","createdAt","updatedAt") VALUES (${randomUUID()}::uuid,${report.id}::uuid,${owner.id}::uuid,'COMPLETED','valid','2026-10-01',repeat('x',1001),now(),1,now(),now())`);
    await assert.rejects(db.followUp.create({ data: { reportId: randomUUID(), ownerInspectorId: owner.id, note: 'x', dueDate: new Date() } }));
  });
  await t.test('report scoped GET/POST, validation, privacy and final report immutability', async () => {
    const before = await reportSnapshot(); const auditBefore = await db.auditLog.findMany({ where: { entityId: report.id } });
    assert.equal((await call(reportPath, 'GET', undefined, [])).status, 401);
    const empty = await call(reportPath); assert.equal(empty.status, 200); assert.equal(empty.headers.get('cache-control'), 'no-store');
    const payload = { note: '  إجراء   تربوي  ', dueDate: '2020-01-01' };
    assert.equal((await call(reportPath, 'POST', payload, cookies, true)).status, 403);
    assert.equal((await call(reportPath, 'POST', { ...payload, ownerInspectorId: other.id })).status, 400);
    assert.equal((await call(reportPath, 'POST', { ...payload, dueDate: '2026-02-30' })).status, 400);
    assert.equal((await call(reportPath, 'POST', { ...payload, note: '😀'.repeat(1001) })).status, 400);
    const maximumNote = await call(reportPath, 'POST', { note: '😀'.repeat(1000), dueDate: '2020-01-02' });
    assert.equal(maximumNote.status, 201); const maximumFollowUp = (await maximumNote.json()).data.followUp;
    assert.equal(Array.from(maximumFollowUp.note).length, 1000);
    const nfc = await call(reportPath, 'POST', { note: 'ا\u0654', dueDate: '2020-01-03' });
    assert.equal(nfc.status, 201); assert.equal((await nfc.json()).data.followUp.note, 'أ');
    const maximumCompletion = await call(`/api/v1/follow-ups/${maximumFollowUp.id}`, 'PATCH', { operation: 'COMPLETE', expectedRevision: 1, completionNote: '😀'.repeat(1001) });
    assert.equal(maximumCompletion.status, 400);
    const exactCompletion = await call(`/api/v1/follow-ups/${maximumFollowUp.id}`, 'PATCH', { operation: 'COMPLETE', expectedRevision: 1, completionNote: '😀'.repeat(1000) });
    assert.equal(exactCompletion.status, 200); assert.equal(Array.from((await exactCompletion.json()).data.followUp.completionNote).length, 1000);
    const response = await call(reportPath, 'POST', payload); assert.equal(response.status, 201);
    const row = (await response.json()).data.followUp; assert.equal(row.note, 'إجراء تربوي'); assert.equal(row.ownerInspectorId, owner.id); assert.equal(row.dueDate, '2020-01-01'); assert.equal(row.alertState, 'OVERDUE');
    assert.equal(JSON.stringify(row).includes('private@example.invalid'), false); assert.equal(row.context.teacher.name, 'اسم تاريخي'.replace('اسم تاريخي', report.finalizedTeacherNameSnapshot));
    const after = await reportSnapshot(); assert.deepEqual(after, before); assert.deepEqual(await db.auditLog.findMany({ where: { entityId: report.id } }), auditBefore);
    assert.equal((await call(reportPath, 'GET', undefined, otherCookies)).status, 200);
    assert.equal((await call(`/api/v1/reports/${randomUUID()}/follow-ups`)).status, 404);
    assert.equal((await call(`/api/v1/reports/${report.id}/follow-ups`, 'POST', payload, otherCookies)).status, 201);

    const draft = await makeReportWithStatuses('COMPLETED', 'DRAFT');
    const draftPath = `/api/v1/reports/${draft.report.id}/follow-ups`;
    assert.equal((await call(draftPath, 'GET')).status, 409); assert.equal((await call(draftPath, 'POST', payload)).status, 409);
    const planned = await makeReportWithStatuses('PLANNED', 'FINAL');
    const cancelled = await makeReportWithStatuses('CANCELLED', 'FINAL');
    assert.equal((await call(`/api/v1/reports/${planned.report.id}/follow-ups`, 'POST', payload)).status, 409);
    assert.equal((await call(`/api/v1/reports/${cancelled.report.id}/follow-ups`, 'POST', payload)).status, 409);

    const outsideInstitution = await db.institution.create({ data: { districtId: otherDistrict.id, name: 'مؤسسة خارج النطاق' } });
    const outsideTeacher = await db.teacher.create({ data: { districtId: otherDistrict.id, institutionId: outsideInstitution.id, name: 'أستاذ', surname: 'خارج النطاق' } });
    const outside = await makeReportWithStatuses('COMPLETED', 'FINAL', { districtId: otherDistrict.id, teacherId: outsideTeacher.id, institutionId: outsideInstitution.id });
    const outsidePath = `/api/v1/reports/${outside.report.id}/follow-ups`;
    assert.equal(await db.inspectorDistrictMembership.count({ where: { inspectorId: other.id, districtId: otherDistrict.id } }), 0);
    assert.equal((await call(outsidePath, 'GET', undefined, otherCookies)).status, 404);
    assert.equal((await call(outsidePath, 'POST', payload, otherCookies)).status, 404);
  });
  await t.test('operational list scope, alert filters, pagination and sorting', async () => {
    const list = await call('/api/v1/follow-ups?limit=1'); assert.equal(list.status, 200);
    const first = await list.json(); assert.equal(first.page.total >= 2, true); assert.equal(first.data[0].alertState, 'OVERDUE');
    const next = await call(`/api/v1/follow-ups?limit=1&cursor=${first.page.nextCursor}`); assert.equal(next.status, 200);
    const second = await next.json();
    const expected = await db.followUp.findMany({ where: { status: 'OPEN', report: { visit: { districtId: { in: [district.id, otherDistrict.id] } } } },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 2, select: { id: true } });
    assert.deepEqual([first.data[0].id, second.data[0].id], expected.map((row) => row.id));
    assert.equal(first.page.total, await db.followUp.count({ where: { status: 'OPEN', report: { visit: { districtId: { in: [district.id, otherDistrict.id] } } } } }));
    assert.equal((await call(`/api/v1/follow-ups?districtId=${randomUUID()}`)).status, 404);
    const todayParts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
    const dueTodayReport = await makeFinalReport(); const todayRow = await call(`/api/v1/reports/${dueTodayReport.report.id}/follow-ups`, 'POST', { note: 'مستحق اليوم', dueDate: today }); assert.equal(todayRow.status, 201);
    assert.equal((await call('/api/v1/follow-ups?alert=DUE_TODAY')).status, 200);
    assert.equal((await call('/api/v1/follow-ups?alert=OVERDUE')).status, 200);
  });
  await t.test('edit/no-op, non-owner, former owner, completion and audit atomicity', async () => {
    const row = await db.followUp.findFirstOrThrow({ where: { reportId: report.id, ownerInspectorId: owner.id }, orderBy: { createdAt: 'asc' } }); const path = `/api/v1/follow-ups/${row.id}`;
    const before = await reportSnapshot();
    assert.equal((await call(path, 'PATCH', { operation: 'EDIT', expectedRevision: 1, note: row.note, dueDate: row.dueDate.toISOString().slice(0, 10) }, otherCookies)).status, 404);
    const noOp = await call(path, 'PATCH', { operation: 'EDIT', expectedRevision: 1, note: ` ${row.note} `, dueDate: row.dueDate.toISOString().slice(0, 10) }); assert.equal(noOp.status, 200); assert.equal((await noOp.json()).data.followUp.revision, 1);
    const edit = await call(path, 'PATCH', { operation: 'EDIT', expectedRevision: 1, note: 'إجراء معدل', dueDate: '2026-10-02' }); assert.equal(edit.status, 200); assert.equal((await edit.json()).data.followUp.revision, 2);
    const stale = await call(path, 'PATCH', { operation: 'EDIT', expectedRevision: 1, note: 'قديم', dueDate: '2026-10-03' }); assert.equal(stale.status, 409); assert.equal((await stale.json()).error.code, 'FOLLOW_UP_REVISION_CONFLICT');
    await db.inspectorDistrictMembership.updateMany({ where: { inspectorId: owner.id, districtId: district.id }, data: { validTo: new Date(Date.now() - 1000) } });
    assert.equal((await call('/api/v1/follow-ups', 'GET', undefined, otherCookies)).status, 200);
    assert.equal((await call(path, 'PATCH', { operation: 'COMPLETE', expectedRevision: 2 }, cookies)).status, 404);
    await db.inspectorDistrictMembership.updateMany({ where: { inspectorId: owner.id, districtId: district.id }, data: { validTo: null } });
    const auditStart = await db.auditLog.count({ where: { action: 'FOLLOW_UP_STATE_CHANGED', entityId: row.id } });
    await db.$executeRawUnsafe(`CREATE FUNCTION "reject_task053_followup_audit"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action" = 'FOLLOW_UP_STATE_CHANGED' THEN RAISE EXCEPTION 'forced audit failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER "reject_task053_followup_audit_trigger" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "reject_task053_followup_audit"()');
    const failedAudit = await call(path, 'PATCH', { operation: 'COMPLETE', expectedRevision: 2, completionNote: 'اختبار rollback' }); assert.equal(failedAudit.status, 500);
    const rolledBack = await db.followUp.findUniqueOrThrow({ where: { id: row.id } }); assert.equal(rolledBack.status, 'OPEN'); assert.equal(rolledBack.completedAt, null); assert.equal(rolledBack.revision, 2);
    await db.$executeRawUnsafe('DROP TRIGGER "reject_task053_followup_audit_trigger" ON "AuditLog"'); await db.$executeRawUnsafe('DROP FUNCTION "reject_task053_followup_audit"()');
    const complete = await call(path, 'PATCH', { operation: 'COMPLETE', expectedRevision: 2, completionNote: 'تم التحقق' }); assert.equal(complete.status, 200);
    const completed = (await complete.json()).data.followUp; assert.equal(completed.status, 'COMPLETED'); assert.ok(completed.completedAt); assert.equal(completed.revision, 3); assert.equal(completed.alertState, 'NONE');
    assert.equal(await db.auditLog.count({ where: { action: 'FOLLOW_UP_STATE_CHANGED', entityId: row.id } }), auditStart + 1);
    const event = await db.auditLog.findFirstOrThrow({ where: { action: 'FOLLOW_UP_STATE_CHANGED', entityId: row.id } }); assert.deepEqual(event.metadata, {}); assert.equal(event.districtId, district.id);
    assert.equal((await call(path, 'PATCH', { operation: 'COMPLETE', expectedRevision: 3 })).status, 409);
    assert.deepEqual(await reportSnapshot(), before);
  });
  await t.test('same-revision update and completion races have one winner each', async () => {
    const { report: raceReport } = await makeFinalReport(); const made = await call(`/api/v1/reports/${raceReport.id}/follow-ups`, 'POST', { note: 'سباق', dueDate: '2026-10-01' }); const id = (await made.json()).data.followUp.id;
    const path = `/api/v1/follow-ups/${id}`;
    const edits = await Promise.all([call(path, 'PATCH', { operation: 'EDIT', expectedRevision: 1, note: 'تعديل أ', dueDate: '2026-10-02' }), call(path, 'PATCH', { operation: 'EDIT', expectedRevision: 1, note: 'تعديل ب', dueDate: '2026-10-03' })]);
    assert.deepEqual(edits.map((response) => response.status).sort(), [200, 409]); assert.equal((await db.followUp.findUniqueOrThrow({ where: { id } })).revision, 2);
    const auditBefore = await db.auditLog.count({ where: { action: 'FOLLOW_UP_STATE_CHANGED', entityId: id } });
    const completions = await Promise.all([call(path, 'PATCH', { operation: 'COMPLETE', expectedRevision: 2, completionNote: 'نتيجة أ' }), call(path, 'PATCH', { operation: 'COMPLETE', expectedRevision: 2, completionNote: 'نتيجة ب' })]);
    assert.deepEqual(completions.map((response) => response.status).sort(), [200, 409]);
    assert.equal(await db.auditLog.count({ where: { action: 'FOLLOW_UP_STATE_CHANGED', entityId: id } }), auditBefore + 1);
    const completed = await db.followUp.findUniqueOrThrow({ where: { id } });
    assert.equal(completed.revision, 3); assert.ok(completed.completedAt);
  });
});
