import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { createApp } from '../dist/app.js';
import { registerAuthRoutes, requireAuthenticatedInspector } from '../dist/identity/auth-routes.js';
import { registerDashboardRoutes } from '../dist/dashboard/routes.js';
import { assertLiveTestDatabase, createOwnedTestSchema, dropOwnedTestSchema, generateTestSchema } from '../../../scripts/test-schema-safety.mjs';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(apiDir, '../..');
const schemaFile = join(apiDir, 'prisma', 'schema.prisma');
const prismaPackageFile = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(require('node:fs').readFileSync(prismaPackageFile, 'utf8'));
const prismaCli = resolve(dirname(prismaPackageFile), prismaPackage.bin.prisma);
const fixedNow = new Date('2026-10-01T23:30:00.000Z'); // 2026-10-02 00:30 in Africa/Algiers
const password = `task070a-${randomUUID()}-synthetic`;
let PrismaClient, admin, db, server, baseUrl, schemaName, schemaCreated = false;
let actor, otherInspector, emptyInspector, noDistrictInspector, inactiveInspector, noReportInspector, d1, d2, expiredDistrict, futureDistrict, outsideDistrict;
let cookies, emptyCookies, noDistrictCookies, noReportCookies;
let submissionIds, followIds;
let sortedReportVisitIds = [];
let plannedVisitIds = [];
let visitSequence = 0;

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('Approved isolated test database is required.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Approved isolated database URL is malformed.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55432'
    || decodeURIComponent(url.username) !== 'task020_test_user' || url.pathname !== '/task020_test'
    || url.searchParams.get('schema') !== 'public') throw new Error('Refusing an unapproved database target.');
  return raw;
}
function runPrisma(args, url) {
  const result = spawnSync(process.execPath, [prismaCli, ...args, '--schema', schemaFile], {
    cwd: root, encoding: 'utf8', timeout: 180_000, windowsHide: true, env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) throw new Error(`Isolated Prisma ${args[0]} failed.`);
}
function cookieParts(response) { return response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']; }
function cookieHeader(parts) { return parts.filter(Boolean).map((part) => part.split(';', 1)[0]).join('; '); }
function csrf(parts) { return decodeURIComponent(parts.find((part) => part.startsWith('inspector_csrf='))?.split(';', 1)[0].slice('inspector_csrf='.length) ?? ''); }
async function login(inspector) {
  const initial = cookieParts(await fetch(`${baseUrl}/api/v1/auth/me`));
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST',
    headers: { cookie: cookieHeader(initial), 'x-csrf-token': csrf(initial), 'content-type': 'application/json' },
    body: JSON.stringify({ email: inspector.email, password }) });
  return { response, cookies: cookieParts(response) };
}
async function call(path, selectedCookies = cookies) {
  return fetch(`${baseUrl}${path}`, { headers: selectedCookies?.length ? { cookie: cookieHeader(selectedCookies) } : {} });
}
const date = (value) => new Date(`${value}T00:00:00.000Z`);

before(async () => {
  const base = approvedUrl();
  ({ PrismaClient } = await import('@prisma/client'));
  const { hashPassword } = await import('../dist/identity/password.js');
  admin = new PrismaClient({ datasources: { db: { url: base } } }); await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS db,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port`;
  assert.deepEqual(identity[0], { db: 'task020_test', role: 'task020_test_user', address: '127.0.0.1/32', port: 55432 });
  schemaName = generateTestSchema('task070a');
  const scopedUrl = await createOwnedTestSchema(admin, base, schemaName); schemaCreated = true;
  await assertLiveTestDatabase(admin); runPrisma(['migrate', 'deploy'], scopedUrl);
  db = new PrismaClient({ datasources: { db: { url: scopedUrl } } }); await db.$connect();
  const hashed = await hashPassword(password);
  [actor, otherInspector, emptyInspector, noDistrictInspector, inactiveInspector, noReportInspector] = await Promise.all([
    ...['actor', 'other', 'empty', 'no-district', 'inactive', 'report-sort'].map((name) => db.inspector.create({ data: { email: `${name}-${randomUUID()}@example.invalid`, passwordHash: hashed, status: name === 'inactive' ? 'INACTIVE' : 'ACTIVE' } })),
  ]);
  [d1, d2, expiredDistrict, futureDistrict, outsideDistrict] = await Promise.all(['D1','D2','Expired','Future','Outside'].map((name) => db.district.create({ data: { name } })));
  const membership = (inspectorId, districtId, validFrom, validTo) => ({ inspectorId, districtId, role: 'INSPECTOR', validFrom, ...(validTo ? { validTo } : {}) });
  await db.inspectorDistrictMembership.createMany({ data: [
    membership(actor.id, d1.id, date('2020-01-01')),
    membership(actor.id, d2.id, date('2020-01-01')),
    membership(actor.id, expiredDistrict.id, date('2020-01-01'), new Date(fixedNow.getTime() - 1)),
    membership(actor.id, futureDistrict.id, new Date(fixedNow.getTime() + 1)),
    membership(otherInspector.id, d1.id, date('2020-01-01')),
    membership(noReportInspector.id, d1.id, date('2020-01-01')),
    membership(emptyInspector.id, outsideDistrict.id, date('2020-01-01')),
  ] });
  const emptyDistrict = await db.district.create({ data: { name: 'Empty active scope' } });
  await db.inspectorDistrictMembership.create({ data: membership(emptyInspector.id, emptyDistrict.id, date('2020-01-01')) });
  const institutions = await Promise.all([d1, d2, expiredDistrict, futureDistrict, outsideDistrict].map((district) => db.institution.create({ data: { districtId: district.id, name: `Institution ${district.name}` } })));
  const institutionByDistrict = new Map([[d1.id, institutions[0]], [d2.id, institutions[1]], [expiredDistrict.id, institutions[2]], [futureDistrict.id, institutions[3]], [outsideDistrict.id, institutions[4]]]);
  async function makeVisit({ owner = actor, district = d1, status, start, type = 'GUIDANCE', snapshot = 'Historical institution snapshot', actualStart, actualEnd } = {}) {
    visitSequence += 1;
    const institution = institutionByDistrict.get(district.id) ?? await db.institution.create({ data: { districtId: district.id, name: 'Empty institution' } });
    const teacher = await db.teacher.create({ data: { districtId: district.id, institutionId: institution.id, name: 'TEACHER_PRIVATE_SENTINEL', surname: 'SURNAME_PRIVATE_SENTINEL', email: 'teacher-private@example.invalid', phone: '+213555000000', personalAddress: 'ADDRESS_PRIVATE_SENTINEL' } });
    const defaultStart = new Date(Date.UTC(2025, 0, 1, 8) + visitSequence * 3_600_000);
    return db.pedagogicalVisit.create({ data: { districtId: district.id, inspectorId: owner.id, teacherId: teacher.id, institutionId: institution.id,
      institutionNameSnapshot: snapshot, academicYear: '2026-2027', visitType: type,
      scheduledStartAt: actualStart ? null : (start ?? defaultStart), scheduledEndAt: actualStart ? null : (start ? new Date(start.getTime() + 30 * 60_000) : new Date(defaultStart.getTime() + 30 * 60_000)),
      ...(actualStart ? { actualStartAt: actualStart, actualEndAt: actualEnd, occurredAt: actualEnd } : status === 'COMPLETED' ? { occurredAt: new Date('2026-01-01T10:00:00.000Z') } : {}),
      status, ...(type === null ? { visitType: null } : {}) } });
  }
  async function makeDraft(visit, updatedAt) {
    return db.inspectionReport.create({ data: { visitId: visit.id, reportType: 'INSPECTOR_VISIT', templateSource: 'PRODUCT_OWNER_ADOPTED', status: 'DRAFT', updatedAt,
      pedagogicalObservations: null, strengths: null, improvementAreas: null, guidanceRecommendations: null,
      generalAssessmentText: 'REPORT_PROSE_PRIVATE_SENTINEL', inspectorConclusion: 'CONCLUSION_PRIVATE_SENTINEL', pedagogicalMark: '17.25' } });
  }
  const markerDate = new Date('2026-10-01T12:00:00.000Z');
  submissionIds = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
  await db.teacherSubmission.createMany({ data: [
    ...submissionIds.map((id, index) => ({ id, districtId: index % 2 ? d2.id : d1.id, status: 'PENDING', submittedAt: markerDate, submittedProfile: { firstName: 'SUBMISSION_PRIVATE_SENTINEL' } })),
    { districtId: d1.id, status: 'INTERNAL_REVIEW', submittedAt: new Date(fixedNow.getTime()), submittedProfile: { firstName: 'Review' } },
    { districtId: expiredDistrict.id, status: 'PENDING', submittedAt: new Date(fixedNow.getTime()), submittedProfile: { firstName: 'Expired' } },
    { districtId: d1.id, status: 'REJECTED', submittedAt: new Date(fixedNow.getTime()), submittedProfile: { firstName: 'Rejected' } },
  ] });

  const followUpVisits = [];
  for (let i = 0; i < 5; i += 1) {
    const visit = await makeVisit({ status: 'COMPLETED', district: d1 });
    const report = await makeDraft(visit, new Date(`2026-09-${String(20 + i).padStart(2, '0')}T12:00:00.000Z`));
    followUpVisits.push({ visit, report });
  }
  const followRows = [
    ...followUpVisits.slice(0, 2).map(({ report }, i) => ({ reportId: report.id, ownerInspectorId: actor.id, status: 'OPEN', note: `FOLLOWUP_PRIVATE_SENTINEL_${i}`, dueDate: date(i ? '2026-10-01' : '2026-09-30') })),
    ...followUpVisits.slice(2, 5).map(({ report }) => ({ reportId: report.id, ownerInspectorId: actor.id, status: 'OPEN', note: 'DUE_TODAY_PRIVATE', dueDate: date('2026-10-02') })),
  ];
  followIds = [1, 2, 3, 4, 5].map((n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
  await db.followUp.createMany({ data: followRows.map((row, i) => ({ ...row, id: followIds[i] })) });
  await db.followUp.create({ data: { reportId: followUpVisits[0].report.id, ownerInspectorId: otherInspector.id, note: 'OTHER_OWNER_PRIVATE', dueDate: date('2026-09-01') } });
  await db.followUp.create({ data: { reportId: followUpVisits[0].report.id, ownerInspectorId: actor.id, status: 'COMPLETED', note: 'COMPLETED_PRIVATE', dueDate: date('2026-09-01'), completedAt: new Date() } });
  await db.followUp.create({ data: { reportId: followUpVisits[0].report.id, ownerInspectorId: actor.id, note: 'FUTURE_PRIVATE', dueDate: date('2026-10-03') } });
  const expiredVisit = await makeVisit({ status: 'COMPLETED', district: expiredDistrict });
  const expiredReport = await makeDraft(expiredVisit, markerDate);
  await db.followUp.create({ data: { reportId: expiredReport.id, ownerInspectorId: actor.id, note: 'EXPIRED_DISTRICT_PRIVATE', dueDate: date('2026-09-01') } });

  const draftVisits = [];
  for (let i = 0; i < 4; i += 1) {
    const visit = await makeVisit({ status: 'COMPLETED', district: i % 2 ? d2 : d1 });
    if (i >= 1) await makeDraft(visit, new Date('2026-09-28T12:00:00.000Z'));
    draftVisits.push(visit);
  }
  const noReportVisits = [];
  for (let i = 0; i < 4; i += 1) noReportVisits.push(await makeVisit({ status: 'COMPLETED', district: i % 2 ? d2 : d1 }));
  const foreignVisit = await makeVisit({ owner: otherInspector, status: 'COMPLETED', district: d1 });
  await makeVisit({ status: 'COMPLETED', district: expiredDistrict });
  const cancelled = await makeVisit({ status: 'CANCELLED', district: d1 });
  const completedWithFinal = await makeVisit({ status: 'COMPLETED', district: d1 });
  await db.inspectionReport.create({ data: { visitId: completedWithFinal.id, status: 'FINAL', levelClass: 'Level', lessonTopic: 'Topic', inspectorConclusion: 'Final conclusion', finalizedAt: new Date(), finalizedByInspectorId: actor.id, finalizedInspectorNameSnapshot: 'Inspector', finalizedInspectorSurnameSnapshot: 'Test', finalizedTeacherNameSnapshot: 'Teacher', finalizedTeacherSurnameSnapshot: 'Test' } });
  const completedWithDraft = await makeVisit({ status: 'COMPLETED', district: d1 });
  const includedDraft = await makeDraft(completedWithDraft, new Date('2026-10-01T11:00:00.000Z'));
  await db.auditLog.create({ data: { actorInspectorId: actor.id, districtId: d1.id, action: 'TEST_PRIVATE_AUDIT', entityType: 'PedagogicalVisit', entityId: completedWithDraft.id, metadata: { secret: 'AUDIT_PRIVATE_SENTINEL' } } });

  const planned = [];
  for (const [index, start] of [fixedNow, new Date(fixedNow.getTime() + 3_600_000), new Date(fixedNow.getTime() + 7_200_000), new Date(fixedNow.getTime() + 10_800_000)].entries()) {
    planned.push(await makeVisit({ status: 'PLANNED', district: index % 2 ? d2 : d1, start, type: index === 0 ? null : 'GUIDANCE', snapshot: `VISIT_SNAPSHOT_${index}` }));
  }
  plannedVisitIds = planned.map((visit) => visit.id);
  await makeVisit({ status: 'PLANNED', district: d1, start: new Date(fixedNow.getTime() - 3_600_000) });
  const otherPlanned = await makeVisit({ owner: otherInspector, status: 'PLANNED', district: d1, start: new Date(fixedNow.getTime() + 18_000_000) });
  const outsidePlanned = await makeVisit({ status: 'PLANNED', district: expiredDistrict, start: new Date(fixedNow.getTime() + 21_600_000) });
  const futureDistrictPlanned = await makeVisit({ status: 'PLANNED', district: futureDistrict, start: new Date(fixedNow.getTime() + 25_200_000) });
  const exceptional = await makeVisit({ status: 'COMPLETED', district: d1, type: 'EXCEPTIONAL', actualStart: new Date('2026-08-01T08:00:00Z'), actualEnd: new Date('2026-08-01T09:00:00Z') });
  const sortedReportVisits = [];
  for (let i = 0; i < 4; i += 1) sortedReportVisits.push(await makeVisit({ owner: noReportInspector, status: 'COMPLETED', district: d1 }));
  await makeDraft(await makeVisit({ owner: noReportInspector, status: 'COMPLETED', district: d1 }), markerDate);
  sortedReportVisitIds = sortedReportVisits.map((visit) => visit.id);
  void [foreignVisit, cancelled, includedDraft, planned, otherPlanned, outsidePlanned, futureDistrictPlanned, exceptional, draftVisits, sortedReportVisits];

  const app = createApp((instance) => {
    registerAuthRoutes(instance, db);
    const auth = requireAuthenticatedInspector(db);
    registerDashboardRoutes(instance, db, auth, () => new Date(fixedNow));
  });
  server = app.listen(0, '127.0.0.1'); await new Promise((yes, no) => { server.once('listening', yes); server.once('error', no); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const activeLogin = await login(actor); assert.equal(activeLogin.response.status, 200); cookies = activeLogin.cookies;
  const emptyLogin = await login(emptyInspector); assert.equal(emptyLogin.response.status, 200); emptyCookies = emptyLogin.cookies;
  const noDistrictLogin = await login(noDistrictInspector); assert.equal(noDistrictLogin.response.status, 200); noDistrictCookies = noDistrictLogin.cookies;
  const noReportLogin = await login(noReportInspector); assert.equal(noReportLogin.response.status, 200); noReportCookies = noReportLogin.cookies;
  assert.equal((await login(inactiveInspector)).response.status, 401);
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db?.$disconnect();
  if (admin && schemaCreated) await dropOwnedTestSchema(admin, approvedUrl(), schemaName);
  await admin?.$disconnect();
});

test('TASK-070A Dashboard aggregate honors scope, clock, caps, sort, privacy and envelope', async (t) => {
  await t.test('authentication, unknown query rejection, cache and no membership empty response', async () => {
    const unauthorized = await call('/api/v1/dashboard/summary', []); assert.equal(unauthorized.status, 401); assert.equal(unauthorized.headers.get('cache-control'), 'no-store');
    const inactiveToken = randomBytes(32).toString('base64url');
    await db.session.create({ data: { inspectorId: inactiveInspector.id, tokenHash: createHash('sha256').update(inactiveToken).digest('hex'), expiresAt: new Date(Date.now() + 60_000) } });
    const inactive = await call('/api/v1/dashboard/summary', [`inspector_session=${inactiveToken}`]);
    assert.equal(inactive.status, 401); assert.equal(inactive.headers.get('cache-control'), 'no-store');
    for (const query of ['?districtId=x', '?limit=3', '?foo=bar']) {
      const response = await call(`/api/v1/dashboard/summary${query}`); const body = await response.json();
      assert.equal(response.status, 400); assert.equal(body.error.code, 'VALIDATION_ERROR'); assert.ok(body.error.requestId);
    }
    const none = await call('/api/v1/dashboard/summary', noDistrictCookies);
    assert.equal(none.status, 200); assert.equal(none.headers.get('cache-control'), 'no-store');
    const body = await none.json(); assert.equal(body.data.attention.pendingSubmissions.total, 0);
    assert.deepEqual(body.data.attention.pendingSubmissions.items, []); assert.deepEqual(body.data.upcomingVisits, []);
  });

  await t.test('current and multiple memberships scope all categories without cross-inspector leakage', async () => {
    const response = await call('/api/v1/dashboard/summary'); assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.asOf, fixedNow.toISOString()); assert.equal(data.today, '2026-10-02');
    assert.deepEqual(Object.keys(data), ['asOf','today','attention','upcomingVisits']);
    assert.deepEqual(Object.keys(data.attention), ['pendingSubmissions','ownedFollowUps','reports']);
    assert.deepEqual(Object.keys(data.attention.pendingSubmissions), ['total','items']);
    assert.deepEqual(Object.keys(data.attention.ownedFollowUps), ['overdueTotal','dueTodayTotal','items']);
    assert.deepEqual(Object.keys(data.attention.reports), ['draftTotal','completedVisitWithoutReportTotal','items']);
    assert.equal(data.attention.pendingSubmissions.total, 4); assert.equal(data.attention.pendingSubmissions.items.length, 3);
    assert.deepEqual(data.attention.pendingSubmissions.items.map((row) => row.id), submissionIds.slice(1).reverse());
    assert.equal(data.attention.ownedFollowUps.overdueTotal, 2); assert.equal(data.attention.ownedFollowUps.dueTodayTotal, 3);
    assert.equal(data.attention.ownedFollowUps.items.length, 3);
    assert.deepEqual(data.attention.ownedFollowUps.items.map((row) => row.alertState), ['OVERDUE', 'OVERDUE', 'DUE_TODAY']);
    assert.deepEqual(data.attention.ownedFollowUps.items.map((row) => row.id), followIds.slice(0, 3));
    assert.equal(data.attention.reports.draftTotal, 9); // five follow-up reports, three extra drafts and the final draft fixture
    assert.equal(data.attention.reports.completedVisitWithoutReportTotal, 6);
    assert.equal(data.attention.reports.items.length, 3);
    assert.deepEqual(data.attention.reports.items.map((row) => row.kind), ['DRAFT_REPORT', 'DRAFT_REPORT', 'DRAFT_REPORT']);
    const upcoming = data.upcomingVisits;
    assert.equal(upcoming.length, 3); assert.equal(upcoming[0].scheduledStartAt, fixedNow.toISOString());
    assert.equal(upcoming[0].visitType, null); assert.equal(upcoming[0].institutionName, 'VISIT_SNAPSHOT_0');
    assert.deepEqual(upcoming.map((row) => row.id), plannedVisitIds.slice(0, 3));
    assert.deepEqual(Object.keys(upcoming[0]), ['id','scheduledStartAt','scheduledEndAt','visitType','institutionName']);
    assert.equal(JSON.stringify(data).includes('PRIVATE_SENTINEL'), false);
    const serialized = JSON.stringify(data);
    for (const key of ['submittedProfile','personalAddress','administrativeNote','phone','email','notes','pedagogicalMark','metadata','pedagogicalObservations','inspectorConclusion']) assert.equal(serialized.includes(key), false);
    for (const marker of ['SUBMISSION_PRIVATE_SENTINEL','TEACHER_PRIVATE_SENTINEL','FOLLOWUP_PRIVATE_SENTINEL','REPORT_PROSE_PRIVATE_SENTINEL','CONCLUSION_PRIVATE_SENTINEL','AUDIT_PRIVATE_SENTINEL']) assert.equal(serialized.includes(marker), false);
  });

  await t.test('empty active district scope returns a valid all-zero aggregate', async () => {
    const response = await call('/api/v1/dashboard/summary', emptyCookies); assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.attention.pendingSubmissions.total, 0); assert.equal(data.attention.ownedFollowUps.overdueTotal, 0);
    assert.equal(data.attention.reports.draftTotal, 0); assert.equal(data.attention.reports.completedVisitWithoutReportTotal, 0);
    assert.deepEqual(data.attention.pendingSubmissions.items, []); assert.deepEqual(data.attention.ownedFollowUps.items, []);
    assert.deepEqual(data.attention.reports.items, []); assert.deepEqual(data.upcomingVisits, []);
  });

  await t.test('report category and tie ordering is stable across DRAFT_REPORT and NO_REPORT', async () => {
    const response = await call('/api/v1/dashboard/summary', noReportCookies); assert.equal(response.status, 200);
    const { data } = await response.json(); const items = data.attention.reports.items;
    assert.equal(data.attention.reports.draftTotal, 1); assert.equal(data.attention.reports.completedVisitWithoutReportTotal, 4);
    assert.deepEqual(items.map((item) => item.kind), ['DRAFT_REPORT', 'NO_REPORT', 'NO_REPORT']);
    const expectedNoReportIds = [...sortedReportVisitIds].sort().reverse().slice(0, 2);
    assert.deepEqual(items.slice(1).map((item) => item.visitId), expectedNoReportIds);
    assert.ok(items[0].reportId); assert.equal(items[1].reportId, null);
    assert.equal(items[1].referenceAt, items[2].referenceAt);
    const draft = await db.inspectionReport.findUniqueOrThrow({ where: { id: items[0].reportId }, select: { updatedAt: true } });
    assert.equal(items[0].referenceAt, draft.updatedAt.toISOString());
    for (const item of items.slice(1)) {
      const visit = await db.pedagogicalVisit.findUniqueOrThrow({ where: { id: item.visitId }, select: { occurredAt: true, report: { select: { id: true } } } });
      assert.equal(item.referenceAt, visit.occurredAt.toISOString()); assert.equal(visit.report, null);
    }
  });

  await t.test('bounded Dashboard query plans are inspectable and existing indexes cover the access paths', async () => {
    const plans = await Promise.all([
      db.$queryRaw`EXPLAIN (FORMAT JSON) SELECT "id" FROM "FollowUp" WHERE "ownerInspectorId" = ${actor.id}::uuid AND "status" = 'OPEN' AND "dueDate" < ${date('2026-10-02')} ORDER BY "dueDate" ASC, "id" ASC LIMIT 3`,
      db.$queryRaw`EXPLAIN (FORMAT JSON) SELECT "id" FROM "PedagogicalVisit" WHERE "inspectorId" = ${actor.id}::uuid AND "districtId" IN (${d1.id}::uuid, ${d2.id}::uuid) AND "status" = 'PLANNED' AND "scheduledStartAt" >= ${fixedNow} ORDER BY "scheduledStartAt" ASC, "id" ASC LIMIT 3`,
      db.$queryRaw`EXPLAIN (FORMAT JSON) SELECT v."id" FROM "PedagogicalVisit" v WHERE v."inspectorId" = ${actor.id}::uuid AND v."districtId" IN (${d1.id}::uuid, ${d2.id}::uuid) AND v."status" = 'COMPLETED' AND NOT EXISTS (SELECT 1 FROM "InspectionReport" r WHERE r."visitId" = v."id") LIMIT 3`,
    ]);
    assert.ok(plans.every((plan) => Array.isArray(plan) && plan.length === 1));
    const indexes = await db.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()`;
    const names = new Set(indexes.map((row) => row.indexname));
    for (const name of ['FollowUp_status_dueDate_id_idx','FollowUp_ownerInspectorId_idx','PedagogicalVisit_inspectorId_scheduledStartAt_idx','InspectionReport_visitId_key']) assert.ok(names.has(name), `Missing existing index ${name}`);
  });
});
