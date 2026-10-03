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
const migration054Name = '20260930150000_task_054_inspector_visit_report_v1';
let admin, db, server, baseUrl, cleanSchema, upgradeSchema, tempRoot, inspector, otherInspector, inactiveInspector, district, institution, teacher, cookies, otherCookies;
let visitSequence = 0;
const password = `task052-${randomUUID()}`;

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
function content(overrides = {}) { return { expectedRevision: null, levelClass: 'السنة الرابعة', lessonTopic: 'الألعاب', pedagogicalObservations: 'ملاحظة\nميدانية', strengths: null, improvementAreas: null, guidanceRecommendations: null, inspectorConclusion: 'خلاصة', ...overrides }; }
async function makeVisit(status = 'PLANNED', visitType = null) {
  visitSequence += 1;
  const start = new Date(Date.UTC(2028, 0, visitSequence, 8));
  return db.pedagogicalVisit.create({ data: { districtId: district.id, inspectorId: inspector.id, teacherId: teacher.id, institutionId: institution.id,
    institutionNameSnapshot: 'المؤسسة التاريخية', academicYear: '2026-2027', scheduledStartAt: start, scheduledEndAt: new Date(start.getTime() + 3600000),
    visitType, ...(status === 'COMPLETED' ? { status, occurredAt: new Date() } : { status }) } });
}

const v1Blank = () => ({
  educationDirectorateText: null, administrativeDivisionText: null, teacherClassificationText: null, teacherGradeText: null,
  teacherNationalityText: null, teacherEffectiveDateText: null, teacherLastInspectionText: null, teacherAppointmentText: null,
  teacherProfessionalFrameworkText: null, actualLessonDurationText: null, studentCount: null, studentsPresentCount: null,
  studentsAbsentCount: null, lessonObjective: null, pedagogicalGuidanceText: null, practicalGuidanceText: null,
  visitStrengthsText: null, visitImprovementAreasText: null, tenureConclusionText: null, generalAssessmentText: null,
  markText: null, markWordsText: null, pedagogicalMark: null,
});
const v1Content = (overrides = {}) => ({ expectedRevision: null, levelClass: 'السنة الرابعة', lessonTopic: 'الألعاب',
  inspectorConclusion: 'خلاصة التقرير', inspectorVisitV1: { ...v1Blank(), ...overrides }, observations: [] });

before(async () => {
  const raw = approvedUrl();
  admin = new PrismaClient({ datasources: { db: { url: raw } } }); await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db, current_user AS role`;
  assert.deepEqual(identity[0], { db: 'task020_test', role: 'task020_test_user' });
  const suffix = `${process.pid}_${randomBytes(5).toString('hex')}`; cleanSchema = `task052_clean_${suffix}`; upgradeSchema = `task052_upgrade_${suffix}`;
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${cleanSchema}"`); await admin.$executeRawUnsafe(`CREATE SCHEMA "${upgradeSchema}"`);
  migrate(schemaUrl(raw, cleanSchema));
  const history = await admin.$queryRawUnsafe(`SELECT migration_name,finished_at FROM "${cleanSchema}"."_prisma_migrations" ORDER BY started_at`);
  assert.ok(history.some((row) => row.migration_name === '20261003100000_task_085_public_intake_evolution'));
  assert.ok(history.some((row) => row.migration_name === '20261003130000_task_076a_institution_location'));
  assert.ok(history.every((row) => row.finished_at));
  tempRoot = mkdtempSync(join(tmpdir(), 'task052-migrations-'));
  const oldMigrations = join(tempRoot, 'migrations'); cpSync(join(migrationsDir, 'migration_lock.toml'), join(tempRoot, 'migration_lock.toml'));
  for (const item of readdirSync(migrationsDir, { withFileTypes: true })) if (item.isDirectory() && item.name !== migration054Name) cpSync(join(migrationsDir, item.name), join(oldMigrations, item.name), { recursive: true });
  const oldSchema = join(tempRoot, 'schema.prisma'); cpSync(schemaFile, oldSchema);
  const upgradeUrl = schemaUrl(raw, upgradeSchema); migrate(upgradeUrl, oldSchema);
  const legacy = new PrismaClient({ datasources: { db: { url: upgradeUrl } } });
  const oldDistrict = await legacy.district.create({ data: { name: 'TASK-054 preserved district' } });
  const oldInspector = await legacy.inspector.create({ data: { email: `old-${suffix}@example.invalid`, passwordHash: 'synthetic', status: 'ACTIVE' } });
  const oldInstitution = await legacy.institution.create({ data: { districtId: oldDistrict.id, name: 'Legacy institution' } });
  const oldTeacher = await legacy.teacher.create({ data: { districtId: oldDistrict.id, institutionId: oldInstitution.id, name: 'Legacy', surname: 'Teacher' } });
  const oldVisit = await legacy.pedagogicalVisit.create({ data: { districtId: oldDistrict.id, inspectorId: oldInspector.id, teacherId: oldTeacher.id,
    institutionId: oldInstitution.id, institutionNameSnapshot: 'Legacy historical snapshot', academicYear: '2026-2027', visitType: 'GUIDANCE',
    scheduledStartAt: new Date('2027-01-01T08:00:00Z'), scheduledEndAt: new Date('2027-01-01T09:00:00Z'), status: 'COMPLETED', occurredAt: new Date('2027-01-01T09:00:00Z') } });
  const oldDraftVisit = await legacy.pedagogicalVisit.create({ data: { districtId: oldDistrict.id, inspectorId: oldInspector.id, teacherId: oldTeacher.id,
    institutionId: oldInstitution.id, institutionNameSnapshot: 'Legacy draft snapshot', academicYear: '2026-2027', visitType: 'GUIDANCE',
    scheduledStartAt: new Date('2027-01-02T08:00:00Z'), scheduledEndAt: new Date('2027-01-02T09:00:00Z') } });
  const oldFinalId = randomUUID(); const oldDraftId = randomUUID(); const oldFollowUpId = randomUUID();
  await legacy.$executeRaw`INSERT INTO "InspectionReport" ("id","visitId","status","revision","levelClass","lessonTopic","inspectorConclusion","finalizedAt","finalizedByInspectorId","finalizedInspectorNameSnapshot","finalizedInspectorSurnameSnapshot","finalizedTeacherNameSnapshot","finalizedTeacherSurnameSnapshot","updatedAt") VALUES (${oldFinalId}::uuid,${oldVisit.id}::uuid,'FINAL',2,'قديم','موضوع','خلاصة',now(),${oldInspector.id}::uuid,'مفتش قديم','لقب','أستاذ قديم','لقب أستاذ',now())`;
  await legacy.$executeRaw`INSERT INTO "InspectionReport" ("id","visitId","updatedAt") VALUES (${oldDraftId}::uuid,${oldDraftVisit.id}::uuid,now())`;
  await legacy.$executeRaw`INSERT INTO "FollowUp" ("id","reportId","ownerInspectorId","note","dueDate","updatedAt") VALUES (${oldFollowUpId}::uuid,${oldFinalId}::uuid,${oldInspector.id}::uuid,'متابعة محفوظة','2027-02-01'::date,now())`;
  await legacy.$disconnect();
  cpSync(join(migrationsDir, migration054Name), join(oldMigrations, migration054Name), { recursive: true }); migrate(upgradeUrl, oldSchema);
  const upgraded = new PrismaClient({ datasources: { db: { url: upgradeUrl } } });
  const preservedVisit = await upgraded.pedagogicalVisit.findUniqueOrThrow({ where: { id: oldVisit.id } });
  assert.equal(preservedVisit.institutionNameSnapshot, 'Legacy historical snapshot'); assert.equal(preservedVisit.visitType, 'GUIDANCE');
  const preservedFinal = await upgraded.inspectionReport.findUniqueOrThrow({ where: { id: oldFinalId } });
  assert.equal(preservedFinal.reportType, 'PEDAGOGICAL_ACCOMPANIMENT'); assert.equal(preservedFinal.status, 'FINAL');
  assert.equal(preservedFinal.inspectorConclusion, 'خلاصة'); assert.equal(preservedFinal.pedagogicalMark, null);
  assert.equal((await upgraded.inspectionReport.findUniqueOrThrow({ where: { id: oldDraftId } })).status, 'DRAFT');
  assert.equal((await upgraded.followUp.findUniqueOrThrow({ where: { id: oldFollowUpId } })).note, 'متابعة محفوظة');
  const upgradeHistory = await admin.$queryRawUnsafe(`SELECT migration_name,finished_at FROM "${upgradeSchema}"."_prisma_migrations" ORDER BY started_at`);
  assert.ok(upgradeHistory.some((row) => row.migration_name === migration054Name)); assert.ok(upgradeHistory.every((row) => row.finished_at));
  await upgraded.$disconnect();

  db = new PrismaClient({ datasources: { db: { url: schemaUrl(raw, cleanSchema) } } }); await db.$connect();
  const { hashPassword } = await import('../dist/identity/password.js'); const passwordHash = await hashPassword(password);
  inspector = await db.inspector.create({ data: { email: `task052-${suffix}@example.invalid`, passwordHash, status: 'ACTIVE', name: 'مفتش', surname: 'تجريبي' } });
  otherInspector = await db.inspector.create({ data: { email: `task052-other-${suffix}@example.invalid`, passwordHash, status: 'ACTIVE', name: 'آخر', surname: 'مفتش' } });
  inactiveInspector = await db.inspector.create({ data: { email: `task052-inactive-${suffix}@example.invalid`, passwordHash, status: 'INACTIVE' } });
  district = await db.district.create({ data: { name: 'مقاطعة الاختبار' } });
  await db.inspectorDistrictMembership.createMany({ data: [inspector, otherInspector, inactiveInspector].map((item) => ({ inspectorId: item.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date(Date.now() - 60_000) })) });
  institution = await db.institution.create({ data: { districtId: district.id, name: 'المؤسسة وقت الزيارة' } });
  teacher = await db.teacher.create({ data: { districtId: district.id, institutionId: institution.id, name: 'ليلى', surname: 'علي', email: 'pii@example.invalid', phone: '+213555000000' } });
  server = createApp((app) => { registerAuthRoutes(app, db); const requireInspector = requireAuthenticatedInspector(db); registerInspectionReportRoutes(app, db, requireInspector); registerFollowUpRoutes(app, db, requireInspector); }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); }); baseUrl = `http://127.0.0.1:${server.address().port}`;
  const active = await login(inspector); assert.equal(active.response.status, 200); cookies = active.cookies;
  const other = await login(otherInspector); assert.equal(other.response.status, 200); otherCookies = other.cookies;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db?.$disconnect();
  if (admin && cleanSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${cleanSchema}" CASCADE`);
  if (admin && upgradeSchema) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${upgradeSchema}" CASCADE`);
  await admin?.$disconnect(); if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('TASK-052 migration invariants, scoped report lifecycle, privacy, concurrency, snapshots and audit atomicity', async (t) => {
  await t.test('DB invariants and FK restriction', async () => {
    const constraints = await db.$queryRaw`SELECT conname, contype, confdeltype, confupdtype FROM pg_constraint WHERE connamespace=${cleanSchema}::regnamespace`;
    for (const name of ['InspectionReport_provenance_check', 'InspectionReport_status_check', 'InspectionReport_revision_positive_check', 'InspectionReport_lifecycle_check', 'InspectionReport_levelClass_length_check', 'InspectionReport_lessonTopic_length_check', 'InspectionReport_pedagogicalObservations_length_check']) assert.ok(constraints.some((item) => item.conname === name && item.contype === 'c'));
    for (const name of ['InspectionReport_visitId_fkey', 'InspectionReport_finalizedByInspectorId_fkey']) { const fk = constraints.find((item) => item.conname === name); assert.equal(fk?.confdeltype, 'r'); assert.equal(fk?.confupdtype, 'r'); }
    const visit = await makeVisit(); const draft = await db.inspectionReport.create({ data: { visitId: visit.id, updatedAt: new Date() } });
    assert.equal(draft.revision, 1); assert.equal(draft.status, 'DRAFT'); assert.equal(draft.reportType, 'PEDAGOGICAL_ACCOMPANIMENT'); assert.ok(draft.createdAt);
    await assert.rejects(db.inspectionReport.create({ data: { visitId: visit.id, updatedAt: new Date() } }));
    await assert.rejects(db.inspectionReport.create({ data: { visitId: randomUUID(), updatedAt: new Date() } }));
    await assert.rejects(db.$executeRaw`UPDATE "InspectionReport" SET "status"='FINAL' WHERE "id"=${draft.id}::uuid`);
    await assert.rejects(db.$executeRaw`UPDATE "InspectionReport" SET "revision"=0 WHERE "id"=${draft.id}::uuid`);
    await assert.rejects(db.$executeRaw`UPDATE "InspectionReport" SET "levelClass"=repeat('x',101) WHERE "id"=${draft.id}::uuid`);
    const allowed = await db.inspectionReport.create({ data: { visitId: (await makeVisit()).id, levelClass: 'x'.repeat(100), lessonTopic: 'x'.repeat(200), updatedAt: new Date() } });
    assert.equal(allowed.levelClass.length, 100); assert.equal(allowed.lessonTopic.length, 200);
    await assert.rejects(db.pedagogicalVisit.delete({ where: { id: visit.id } }));
  });

  const visit = await makeVisit(); const path = `/api/v1/visits/${visit.id}/report`;
  await t.test('GET scope, no-store, explicit create/update, normalization, no-op, validation and privacy', async () => {
    assert.equal((await call(path, 'GET', undefined, [])).status, 401);
    const empty = await call(path); assert.equal(empty.status, 200); assert.equal(empty.headers.get('cache-control'), 'no-store'); assert.deepEqual((await empty.json()).data, { report: null });
    const wrongCreateRevision = await call(path, 'PUT', content({ expectedRevision: 1 })); assert.equal(wrongCreateRevision.status, 409);
    const noCsrf = await call(path, 'PUT', content(), cookies, true); assert.equal(noCsrf.status, 403);
    const unknown = await call(path, 'PUT', { ...content(), extra: 'secret-like' }); assert.equal(unknown.status, 400);
    const duplicate = await fetch(`${baseUrl}${path}`, { method: 'PUT', headers: { cookie: cookieHeader(cookies), 'x-csrf-token': csrf(cookies), 'content-type': 'application/json' },
      body: '{"expectedRevision":null,"levelClass":"أول","levelClass":"ثان","lessonTopic":null,"pedagogicalObservations":null,"strengths":null,"improvementAreas":null,"guidanceRecommendations":null,"inspectorConclusion":null}' });
    assert.equal(duplicate.status, 400);
    const createdResponse = await call(path, 'PUT', content({ levelClass: '  السَّنة   الرابعة  ', pedagogicalObservations: '  سطر\r\nثانٍ  ' }));
    assert.equal(createdResponse.status, 201); const created = (await createdResponse.json()).data.report;
    assert.equal(created.revision, 1); assert.equal(created.levelClass, 'السَّنة الرابعة'.normalize('NFC').trim().replace(/\s+/gu, ' ')); assert.equal(created.levelClass, created.levelClass.normalize('NFC')); assert.equal(created.pedagogicalObservations, 'سطر\nثانٍ');
    assert.equal(created.visit.institution.name, 'المؤسسة التاريخية'); assert.equal(JSON.stringify(created).includes('pii@example.invalid'), false); assert.equal(JSON.stringify(created).includes('+213555000000'), false);
    const noOp = await call(path, 'PUT', content({ ...Object.fromEntries(['levelClass','lessonTopic','pedagogicalObservations','strengths','improvementAreas','guidanceRecommendations','inspectorConclusion'].map((key) => [key, created[key]])), expectedRevision: 1 }));
    assert.equal(noOp.status, 200); assert.equal((await noOp.json()).data.report.revision, 1);
    const updated = await call(path, 'PUT', content({ expectedRevision: 1, levelClass: 'قسم جديد' })); assert.equal(updated.status, 200); assert.equal((await updated.json()).data.report.revision, 2);
    const stale = await call(path, 'PUT', content({ expectedRevision: 1 })); assert.equal(stale.status, 409); assert.equal((await stale.json()).error.code, 'REPORT_REVISION_CONFLICT');
    const invalid = await call(path, 'PUT', content({ expectedRevision: 2, strengths: 'x'.repeat(4001) })); assert.equal(invalid.status, 400); assert.equal(JSON.stringify(await invalid.json()).includes('xxxx'), false);
    assert.equal((await call(path, 'PUT', content({ expectedRevision: 2, levelClass: 'x'.repeat(101) }))).status, 400);
    assert.equal((await call(path, 'PUT', content({ expectedRevision: 2, lessonTopic: 'x'.repeat(201) }))).status, 400);
    const control = await call(path, 'PUT', content({ expectedRevision: 2, strengths: 'bad\u0000text' })); assert.equal(control.status, 400);
    assert.equal((await call(path, 'GET', undefined, otherCookies)).status, 404);
    const hiddenVisit = await db.pedagogicalVisit.create({ data: { districtId: visit.districtId, inspectorId: otherInspector.id, teacherId: visit.teacherId,
      institutionId: visit.institutionId, institutionNameSnapshot: visit.institutionNameSnapshot, academicYear: visit.academicYear,
      scheduledStartAt: new Date('2028-02-01T08:00:00Z'), scheduledEndAt: new Date('2028-02-01T09:00:00Z'), status: 'CANCELLED' } });
    assert.equal((await call(`/api/v1/visits/${hiddenVisit.id}/report`)).status, 404);
    assert.equal((await call(`/api/v1/visits/${randomUUID()}/report`)).status, 404);
    const inactiveLogin = await login(inactiveInspector); assert.equal(inactiveLogin.response.status, 401);
    const boundaryVisit = await makeVisit();
    const boundary = await call(`/api/v1/visits/${boundaryVisit.id}/report`, 'PUT', content({ strengths: '😀'.repeat(4000) }));
    assert.equal(boundary.status, 201); assert.equal(Array.from((await boundary.json()).data.report.strengths).length, 4000);
  });

  await t.test('first-create and same-revision update races have one winner', async () => {
    const first = await makeVisit(); const firstPath = `/api/v1/visits/${first.id}/report`;
    const race = await Promise.all([call(firstPath, 'PUT', content()), call(firstPath, 'PUT', content({ levelClass: 'نسخة أخرى' }))]);
    assert.deepEqual(race.map((response) => response.status).sort(), [201, 409]);
    const winner = (await db.inspectionReport.findUniqueOrThrow({ where: { visitId: first.id } }));
    const updates = await Promise.all([call(firstPath, 'PUT', content({ expectedRevision: winner.revision, levelClass: 'تعديل أ' })), call(firstPath, 'PUT', content({ expectedRevision: winner.revision, levelClass: 'تعديل ب' }))]);
    assert.deepEqual(updates.map((response) => response.status).sort(), [200, 409]);
  });

  await t.test('cancelled visits block create/update but preserve existing draft read-only', async () => {
    const cancelled = await makeVisit('CANCELLED'); const cancelledPath = `/api/v1/visits/${cancelled.id}/report`;
    assert.equal((await call(cancelledPath, 'PUT', content())).status, 409);
    const planned = await makeVisit(); const plannedPath = `/api/v1/visits/${planned.id}/report`;
    const draftResult = await call(plannedPath, 'PUT', content()); const draftId = (await draftResult.json()).data.report.id;
    await db.pedagogicalVisit.update({ where: { id: planned.id }, data: { status: 'CANCELLED' } });
    assert.equal((await call(plannedPath, 'GET')).status, 200); assert.equal((await call(plannedPath, 'PUT', content({ expectedRevision: 1 }))).status, 409);
    assert.ok(await db.inspectionReport.findUnique({ where: { id: draftId } }));
    const finalVisit = await makeVisit('CANCELLED');
    const historicalFinal = await db.inspectionReport.create({ data: { visitId: finalVisit.id, status: 'FINAL', levelClass: 'مستوى', lessonTopic: 'موضوع', inspectorConclusion: 'خلاصة',
      finalizedAt: new Date(), finalizedByInspectorId: inspector.id, finalizedInspectorNameSnapshot: 'مفتش', finalizedInspectorSurnameSnapshot: 'سابق',
      finalizedTeacherNameSnapshot: 'أستاذ', finalizedTeacherSurnameSnapshot: 'سابق' } });
    assert.equal((await call(`/api/v1/visits/${finalVisit.id}/report`)).status, 200);
    assert.equal((await call(`/api/v1/reports/${historicalFinal.id}/finalize`, 'POST', { expectedRevision: 1 })).status, 409);
  });

  await t.test('finalization snapshots identities, increments revision, emits empty atomic audit and is immutable', async () => {
    const completed = await makeVisit('COMPLETED'); const completedPath = `/api/v1/visits/${completed.id}/report`;
    const saved = await call(completedPath, 'PUT', content()); assert.equal(saved.status, 201); const draft = (await saved.json()).data.report;
    const finalizedResponse = await call(`/api/v1/reports/${draft.id}/finalize`, 'POST', { expectedRevision: 1 }); assert.equal(finalizedResponse.status, 200);
    const finalized = (await finalizedResponse.json()).data.report; assert.equal(finalized.status, 'FINAL'); assert.equal(finalized.revision, 2); assert.equal(finalized.finalizedByInspectorId, inspector.id);
    assert.ok(finalized.finalizedAt);
    assert.equal(finalized.finalizedInspectorNameSnapshot, 'مفتش'); assert.equal(finalized.finalizedTeacherSurnameSnapshot, 'علي');
    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: draft.id, action: 'INSPECTION_REPORT_FINALIZED' } }); assert.deepEqual(audit.metadata, {}); assert.equal(audit.districtId, district.id);
    const renamedInstitution = await db.institution.create({ data: { districtId: district.id, name: 'مؤسسة بديلة' } });
    await db.inspector.update({ where: { id: inspector.id }, data: { name: 'اسم جديد' } });
    await db.teacher.update({ where: { id: teacher.id }, data: { name: 'اسم أستاذ جديد', institutionId: renamedInstitution.id } });
    await db.institution.update({ where: { id: institution.id }, data: { name: 'اسم مؤسسة لاحق', archivedAt: new Date() } });
    const historical = (await (await call(completedPath)).json()).data.report; assert.equal(historical.displayIdentity.inspector.name, 'مفتش'); assert.equal(historical.displayIdentity.teacher.name, 'ليلى'); assert.equal(historical.visit.institution.name, 'المؤسسة التاريخية');
    const update = await call(completedPath, 'PUT', content({ expectedRevision: 2 })); assert.equal(update.status, 409); assert.equal((await update.json()).error.code, 'REPORT_STATE_CONFLICT');
    const secondFinalize = await call(`/api/v1/reports/${draft.id}/finalize`, 'POST', { expectedRevision: 2 }); assert.equal(secondFinalize.status, 409);
    assert.equal((await call(`/api/v1/reports/${draft.id}/finalize`, 'POST', { expectedRevision: 2 }, cookies, true)).status, 403);
    assert.equal((await call(`/api/v1/reports/${draft.id}/finalize`, 'POST', { expectedRevision: 2 }, otherCookies)).status, 404);
    assert.equal(await db.auditLog.count({ where: { entityId: draft.id, action: 'INSPECTION_REPORT_FINALIZED' } }), 1);
    const raceVisit = await makeVisit('COMPLETED');
    const raceDraft = (await (await call(`/api/v1/visits/${raceVisit.id}/report`, 'PUT', content())).json()).data.report;
    const race = await Promise.all([0, 1].map(() => call(`/api/v1/reports/${raceDraft.id}/finalize`, 'POST', { expectedRevision: 1 })));
    assert.deepEqual(race.map((item) => item.status).sort(), [200, 409]);
    const raceWinner = race.find((item) => item.status === 200); assert.equal((await raceWinner.json()).data.report.revision, 2);
    assert.equal(await db.auditLog.count({ where: { entityId: raceDraft.id, action: 'INSPECTION_REPORT_FINALIZED' } }), 1);
  });

  await t.test('finalization requires completion, identity, and all minimum fields; stale revision rejected', async () => {
    const planned = await makeVisit(); const plannedPath = `/api/v1/visits/${planned.id}/report`;
    const draft = (await (await call(plannedPath, 'PUT', content())).json()).data.report;
    assert.equal((await call(`/api/v1/reports/${draft.id}/finalize`, 'POST', { expectedRevision: 1 })).status, 409);
    await db.pedagogicalVisit.update({ where: { id: planned.id }, data: { status: 'COMPLETED', occurredAt: new Date() } });
    assert.equal((await call(`/api/v1/reports/${draft.id}/finalize`, 'POST', { expectedRevision: 9 })).status, 409);
    for (const key of ['levelClass', 'lessonTopic', 'inspectorConclusion']) {
      const minimalVisit = await makeVisit('COMPLETED'); const minimal = (await (await call(`/api/v1/visits/${minimalVisit.id}/report`, 'PUT', content({ [key]: null }))).json()).data.report;
      const missing = await call(`/api/v1/reports/${minimal.id}/finalize`, 'POST', { expectedRevision: 1 });
      assert.equal(missing.status, 400); assert.ok(Object.hasOwn((await missing.json()).error.fields, key));
    }
    await db.inspector.update({ where: { id: inspector.id }, data: { name: null, surname: null } });
    const eligibleVisit = await makeVisit('COMPLETED'); const eligible = (await (await call(`/api/v1/visits/${eligibleVisit.id}/report`, 'PUT', content())).json()).data.report;
    const noIdentity = await call(`/api/v1/reports/${eligible.id}/finalize`, 'POST', { expectedRevision: 1 }); assert.equal(noIdentity.status, 409); assert.equal((await noIdentity.json()).error.code, 'INSPECTOR_PROFESSIONAL_IDENTITY_REQUIRED');
    await db.inspector.update({ where: { id: inspector.id }, data: { name: 'مفتش', surname: 'تجريبي' } });
  });

  await t.test('audit failure rolls finalization back and error never echoes prose', async () => {
    const completed = await makeVisit('COMPLETED'); const draft = (await (await call(`/api/v1/visits/${completed.id}/report`, 'PUT', content({ strengths: 'خصوصي للاختبار' }))).json()).data.report;
    await db.$executeRaw`CREATE FUNCTION task052_fail_report_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='INSPECTION_REPORT_FINALIZED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`;
    await db.$executeRaw`CREATE TRIGGER task052_fail_report_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION task052_fail_report_audit()`;
    try {
      const response = await call(`/api/v1/reports/${draft.id}/finalize`, 'POST', { expectedRevision: 1 }); assert.equal(response.status, 500);
      const envelope = await response.text(); assert.equal(envelope.includes('خصوصي للاختبار'), false); assert.equal(envelope.includes('synthetic audit failure'), false);
      assert.equal((await db.inspectionReport.findUniqueOrThrow({ where: { id: draft.id } })).status, 'DRAFT');
      assert.equal(await db.auditLog.count({ where: { entityId: draft.id, action: 'INSPECTION_REPORT_FINALIZED' } }), 0);
    } finally { await db.$executeRaw`DROP TRIGGER task052_fail_report_audit ON "AuditLog"`; await db.$executeRaw`DROP FUNCTION task052_fail_report_audit()`; }
  });

  await t.test('TASK-054 dictionary, V1 persistence, applicability, snapshots, finalization and FollowUp compatibility', async () => {
    const dictionaryPath = '/api/v1/report-templates/inspector-visit/v1';
    assert.equal((await call(dictionaryPath, 'GET', undefined, [])).status, 401);
    const dictionaryResponse = await call(dictionaryPath); assert.equal(dictionaryResponse.status, 200);
    assert.equal(dictionaryResponse.headers.get('cache-control'), 'no-store');
    const dictionary = (await dictionaryResponse.json()).data;
    assert.deepEqual([dictionary.reportType, dictionary.templateSource, dictionary.templateVersion], ['INSPECTOR_VISIT', 'PRODUCT_OWNER_ADOPTED', 1]);
    assert.equal(dictionary.criteria.length, 23); assert.deepEqual(dictionary.criteria.map((item) => item.sourceOrder), Array.from({ length: 23 }, (_, i) => i + 1));
    assert.notEqual(dictionary.criteria[4].criterionKey, dictionary.criteria[7].criterionKey);

    const promotion = await makeVisit('COMPLETED', 'PROMOTION_EVALUATION');
    const reportPath = `/api/v1/visits/${promotion.id}/inspector-visit-report`;
    assert.equal((await call(`/api/v1/visits/${promotion.id}/report`, 'PUT', content())).status, 409);
    assert.equal((await call(reportPath, 'PUT', v1Content(), cookies, true)).status, 403);
    const unknownKey = await call(reportPath, 'PUT', { ...v1Content(), surprise: 'not echoed' }); assert.equal(unknownKey.status, 400);
    const unknownCriterionPayload = v1Content(); unknownCriterionPayload.observations = [{ criterionKey: 'unknown', valueText: 'نص' }];
    const unknownCriterion = await call(reportPath, 'PUT', unknownCriterionPayload); assert.equal(unknownCriterion.status, 400);
    const duplicateCriterionPayload = v1Content(); duplicateCriterionPayload.observations = [
      { criterionKey: 'field_planning', valueText: 'ملاحظة' }, { criterionKey: 'field_planning', valueText: 'أخرى' },
    ];
    assert.equal((await call(reportPath, 'PUT', duplicateCriterionPayload)).status, 400);
    const rejectedMarkValues = ['-0.01', '20.01', '14.257', 'نص'];
    for (const pedagogicalMark of rejectedMarkValues) {
      assert.equal((await call(reportPath, 'PUT', v1Content({ pedagogicalMark }))).status, 400);
    }
    const attendanceInvalid = await call(reportPath, 'PUT', v1Content({ studentCount: 10, studentsPresentCount: 7, studentsAbsentCount: 2 }));
    assert.equal(attendanceInvalid.status, 400);
    const validPayload = v1Content({ pedagogicalMark: '14', studentCount: 10, studentsPresentCount: 7, studentsAbsentCount: 3,
      educationDirectorateText: ' مديرية   التربية ', visitStrengthsText: 'قوة\r\nملحوظة',
      pedagogicalGuidanceText: ' توجيه ', });
    validPayload.observations = [{ criterionKey: 'field_planning', valueText: '  جيّد  ' }, { criterionKey: 'educational_unit_preparation', valueText: 'موجود' }];
    const createdResponse = await call(reportPath, 'PUT', validPayload); assert.equal(createdResponse.status, 201);
    let created = (await createdResponse.json()).data.report;
    assert.equal(created.reportType, 'INSPECTOR_VISIT'); assert.equal(created.templateSource, 'PRODUCT_OWNER_ADOPTED'); assert.equal(created.templateVersion, 1);
    assert.equal(created.revision, 1); assert.equal(created.inspectorVisitV1.pedagogicalMark, '14');
    assert.equal(created.inspectorVisitV1.educationDirectorateText, 'مديرية التربية');
    assert.equal(created.inspectorVisitV1.visitStrengthsText, 'قوة\nملحوظة');
    assert.deepEqual(created.inspectorVisitV1.observations.map((item) => item.criterionKey), ['field_planning', 'educational_unit_preparation']);
    assert.equal(created.displayContext.visitType, 'PROMOTION_EVALUATION');
    assert.equal(JSON.stringify(created).includes('not echoed'), false);
    assert.equal((await call(`/api/v1/visits/${promotion.id}/report`, 'GET')).status, 200);
    const equivalentValue = { ...validPayload, expectedRevision: 1,
      inspectorVisitV1: { ...validPayload.inspectorVisitV1, pedagogicalMark: '14.00' } };
    assert.equal((await call(reportPath, 'PUT', equivalentValue)).status, 200);
    created = (await (await call(`/api/v1/visits/${promotion.id}/report`)).json()).data.report; assert.equal(created.revision, 1);
    const updatedPayload = v1Content({ pedagogicalMark: '14.25', visitStrengthsText: null });
    updatedPayload.expectedRevision = 1;
    updatedPayload.observations = validPayload.observations;
    const updated = await call(reportPath, 'PUT', updatedPayload); assert.equal(updated.status, 200);
    const updatedReport = (await updated.json()).data.report; assert.equal(updatedReport.revision, 2);
    assert.equal(updatedReport.inspectorVisitV1.pedagogicalMark, '14.25'); assert.equal(updatedReport.inspectorVisitV1.visitStrengthsText, null);
    assert.equal((await call(reportPath, 'PUT', { ...updatedPayload, expectedRevision: 1 })).status, 409);
    assert.equal((await call(reportPath, 'GET', undefined, otherCookies)).status, 404);
    const persisted = await db.inspectionReport.findUniqueOrThrow({ where: { visitId: promotion.id }, include: { observations: true } });
    assert.ok(persisted.pedagogicalMark instanceof Object); assert.equal(persisted.pedagogicalMark.toFixed(2), '14.25');
    await assert.rejects(db.inspectionReportObservation.create({ data: { reportId: persisted.id, criterionKey: 'field_planning', valueText: 'مكرر' } }));
    await assert.rejects(db.$executeRaw`INSERT INTO "InspectionReportObservation" ("id","reportId","criterionKey","valueText","updatedAt") VALUES (${randomUUID()}::uuid,${persisted.id}::uuid,'unknown_criterion','نص',now())`);
    await assert.rejects(db.$executeRaw`INSERT INTO "InspectionReportObservation" ("id","reportId","reportType","templateVersion","criterionKey","valueText","updatedAt") VALUES (${randomUUID()}::uuid,${persisted.id}::uuid,'PEDAGOGICAL_ACCOMPANIMENT',1,'field_ground','نص',now())`);
    await assert.rejects(db.$executeRaw`UPDATE "InspectionReport" SET "pedagogicalMark"=20.01 WHERE "id"=${persisted.id}::uuid`);

    const guidance = await makeVisit('COMPLETED', 'GUIDANCE'); const guidancePath = `/api/v1/visits/${guidance.id}/inspector-visit-report`;
    assert.equal((await call(guidancePath, 'PUT', v1Content({ pedagogicalMark: '0' }))).status, 400);
    assert.equal((await call(guidancePath, 'PUT', v1Content({ pedagogicalMark: '20' }))).status, 400);
    assert.equal((await call(guidancePath, 'PUT', v1Content())).status, 201);
    const tenure = await makeVisit('COMPLETED', 'TENURE_CONFIRMATION'); const tenurePath = `/api/v1/visits/${tenure.id}/inspector-visit-report`;
    assert.equal((await call(tenurePath, 'PUT', v1Content({ tenureConclusionText: 'استنتاج مهني' }))).status, 201);
    const tenureWrong = await makeVisit('COMPLETED', 'EXCEPTIONAL');
    assert.equal((await call(`/api/v1/visits/${tenureWrong.id}/inspector-visit-report`, 'PUT', v1Content({ tenureConclusionText: 'استنتاج' }))).status, 400);
    const reportingByOtherType = await makeVisit('COMPLETED', 'MONITORING_FOLLOW_UP');
    assert.equal((await call(`/api/v1/visits/${reportingByOtherType.id}/inspector-visit-report`, 'PUT', v1Content({ markText: '12', markWordsText: 'اثنا عشر' }))).status, 201);
    const zeroMarkVisit = await makeVisit('COMPLETED', 'PROMOTION_EVALUATION');
    const zeroMark = await call(`/api/v1/visits/${zeroMarkVisit.id}/inspector-visit-report`, 'PUT', v1Content({ pedagogicalMark: '0' })); assert.equal(zeroMark.status, 201);

    const snapshotTeacher = await db.teacher.update({ where: { id: teacher.id }, data: { birthDate: new Date('1988-04-02T00:00:00.000Z'), placeOfBirth: 'مكان الميلاد', qualifications: 'شهادة مهنية' } });
    await db.district.update({ where: { id: district.id }, data: { name: 'مقاطعة وقت الاعتماد' } });
    await db.institution.update({ where: { id: institution.id }, data: { municipality: 'بلدية وقت الاعتماد' } });
    const finalVisit = await makeVisit('COMPLETED', 'PROMOTION_EVALUATION');
    const finalPath = `/api/v1/visits/${finalVisit.id}/inspector-visit-report`;
    const finalDraft = (await (await call(finalPath, 'PUT', v1Content({ pedagogicalMark: '20.00', studentCount: 0, studentsPresentCount: 0, studentsAbsentCount: 0 }))).json()).data.report;
    const finalizedResponse = await call(`/api/v1/reports/${finalDraft.id}/finalize`, 'POST', { expectedRevision: 1 }); assert.equal(finalizedResponse.status, 200);
    const finalReport = (await finalizedResponse.json()).data.report; assert.equal(finalReport.status, 'FINAL'); assert.equal(finalReport.revision, 2);
    assert.equal(finalReport.inspectorVisitV1.pedagogicalMark, '20'); assert.equal(finalReport.displayContext.teacherBirthDate, '1988-04-02');
    assert.equal(finalReport.displayContext.teacherPlaceOfBirth, 'مكان الميلاد'); assert.equal(finalReport.displayContext.teacherQualifications, 'شهادة مهنية');
    assert.equal(finalReport.displayContext.districtName, 'مقاطعة وقت الاعتماد'); assert.equal(finalReport.displayContext.institutionMunicipality, 'بلدية وقت الاعتماد');
    const finalAudit = await db.auditLog.findFirstOrThrow({ where: { entityId: finalDraft.id, action: 'INSPECTION_REPORT_FINALIZED' } }); assert.deepEqual(finalAudit.metadata, {});
    await db.teacher.update({ where: { id: snapshotTeacher.id }, data: { placeOfBirth: 'تغيير لاحق', qualifications: 'تغيير لاحق' } });
    await db.district.update({ where: { id: district.id }, data: { name: 'مقاطعة لاحقة' } });
    const reloaded = (await (await call(`/api/v1/visits/${finalVisit.id}/report`)).json()).data.report;
    assert.equal(reloaded.displayContext.districtName, 'مقاطعة وقت الاعتماد'); assert.equal(reloaded.displayContext.teacherQualifications, 'شهادة مهنية');
    assert.equal((await call(`/api/v1/reports/${finalDraft.id}/finalize`, 'POST', { expectedRevision: 2 })).status, 409);
    const finalUpdate = v1Content(); finalUpdate.expectedRevision = 2;
    assert.equal((await call(finalPath, 'PUT', finalUpdate)).status, 409);
    const followUpResponse = await call(`/api/v1/reports/${finalDraft.id}/follow-ups`, 'POST', { note: 'متابعة تقرير V1', dueDate: '2028-01-01' }); assert.equal(followUpResponse.status, 201);
    const followUp = (await followUpResponse.json()).data.followUp;
    const completedFollowUp = await call(`/api/v1/follow-ups/${followUp.id}`, 'PATCH', { operation: 'COMPLETE', expectedRevision: 1 }); assert.equal(completedFollowUp.status, 200);
    assert.equal((await (await call(`/api/v1/visits/${finalVisit.id}/report`)).json()).data.report.revision, 2);
  });

  await t.test('V1 creation and revision races have one winner', async () => {
    const racingVisit = await makeVisit('COMPLETED', 'GUIDANCE'); const path = `/api/v1/visits/${racingVisit.id}/inspector-visit-report`;
    const race = await Promise.all([call(path, 'PUT', v1Content()), call(path, 'PUT', v1Content())]);
    assert.deepEqual(race.map((response) => response.status).sort(), [201, 409]);
    const report = await db.inspectionReport.findUniqueOrThrow({ where: { visitId: racingVisit.id } });
    const updateA = v1Content({ pedagogicalGuidanceText: 'أ' }); updateA.expectedRevision = 1;
    const updateB = v1Content({ pedagogicalGuidanceText: 'ب' }); updateB.expectedRevision = 1;
    const updates = await Promise.all([call(path, 'PUT', updateA), call(path, 'PUT', updateB)]);
    assert.deepEqual(updates.map((response) => response.status).sort(), [200, 409]);
    assert.equal((await db.inspectionReport.findUniqueOrThrow({ where: { id: report.id } })).revision, 2);
  });
});
