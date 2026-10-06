import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { before, after, test } from 'node:test';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import sharp from 'sharp';
import { withSyntheticGpsExif } from './fixtures/synthetic-photo.mjs';
import { PrismaClient } from '@prisma/client';
import { approvedTestDatabaseUrl, assertLiveTestDatabase, createOwnedTestSchema, dropOwnedTestSchema, generateTestSchema } from '../../../scripts/test-schema-safety.mjs';
import { createApp } from '../dist/app.js';
import { requireAuthenticatedInspector } from '../dist/identity/auth-routes.js';
import { registerTeacherAuth } from '../dist/teacher-portal/auth.js';
import { registerTeacherPortal } from '../dist/teacher-portal/routes.js';
import { registerTeacherSchedules } from '../dist/teacher-portal/schedules.js';
import { registerTeacherPhotos } from '../dist/teacher-portal/photos.js';
import { registerEvolutionWorkspace } from '../dist/teacher-portal/workspace.js';
import { registerTeacherDirectoryRoutes } from '../dist/teachers/directory-routes.js';
import { registerPedagogicalVisitRoutes } from '../dist/visits/routes.js';
import { registerWeeklyScheduleRoutes } from '../dist/schedules/routes.js';

const require = createRequire(import.meta.url); const packagePath = require.resolve('prisma/package.json');
const cli = resolve(dirname(packagePath), JSON.parse(readFileSync(packagePath, 'utf8')).bin.prisma);
const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), '../prisma/schema.prisma');
const hash = (s) => createHash('sha256').update(s).digest('hex'); const password = `Synthetic-${randomUUID()}`;
let admin; let db; let schema; let url; let base; let server; let teacher; let otherTeacher; let district; let otherDistrict; let institution; let inspector; let inspectorCookie; let inspectorCsrf; let teacherCookie; let teacherCsrf; let publicSnapshot;
const storage = new Map();
const privateStore = { async put(key, bytes) { storage.set(key, bytes); }, async get(key) { return storage.get(key); }, async discardUncommitted(key) { storage.delete(key); } };
async function call(path, method = 'GET', body, actor = 'teacher', csrf = true) {
  const cookie = actor === 'inspector' ? inspectorCookie : actor === 'teacher' ? teacherCookie : undefined;
  const token = actor === 'inspector' ? inspectorCsrf : teacherCsrf;
  const headers = { ...(cookie ? { cookie } : {}), ...(csrf && token ? { 'x-csrf-token': token } : {}), 'content-type': Buffer.isBuffer(body) ? 'image/png' : 'application/json' };
  return fetch(`${base}/api/v1${path}`, { method, headers, ...(body !== undefined ? { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) } : {}) });
}
function cookies(response) { const values = response.headers.getSetCookie(); return { cookie: values.map((s) => s.split(';')[0]).join('; '), csrf: values.find((s) => s.startsWith('teacher_csrf='))?.split(';')[0].slice('teacher_csrf='.length) }; }
async function publicState() { const tables = await admin.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`; const out = []; for (const { tablename } of tables) { if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(tablename)) throw new Error('Untrusted table name'); const result = await admin.$queryRawUnsafe(`SELECT count(*)::int AS count, md5(COALESCE(string_agg(md5(row_to_json(t)::text),',' ORDER BY md5(row_to_json(t)::text)),'')) AS digest FROM public."${tablename}" t`); out.push({ table: tablename, ...result[0] }); } return out; }
before(async () => {
  url = approvedTestDatabaseUrl(process.env.TEST_DATABASE_URL).toString();
  admin = new PrismaClient({ datasources: { db: { url } } }); await assertLiveTestDatabase(admin); publicSnapshot = await publicState();
  schema = generateTestSchema('task090'); const scopedUrl = await createOwnedTestSchema(admin, url, schema);
  const migrated = spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', schemaPath], { env: { ...process.env, DATABASE_URL: scopedUrl }, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (migrated.status !== 0) throw new Error('Clean isolated migration deployment failed (output withheld to protect connection credentials).');
  db = new PrismaClient({ datasources: { db: { url: scopedUrl } } });
  district = await db.district.create({ data: { name: 'Synthetic District A' } }); otherDistrict = await db.district.create({ data: { name: 'Synthetic District B' } });
  inspector = await db.inspector.create({ data: { email: `inspector-${randomUUID()}@example.invalid`, status: 'ACTIVE', passwordHash: 'synthetic-not-used' } });
  await db.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date('2020-01-01') } });
  institution = await db.institution.create({ data: { name: 'Synthetic School', districtId: district.id, municipality: 'Synthetic Municipality' } });
  teacher = await db.teacher.create({ data: { name: 'Synthetic', surname: 'Teacher', districtId: district.id, institutionId: institution.id, professionalStatus: 'TRAINEE', administrativeNote: 'NEVER_DISCLOSE_PRIVATE_NOTE' } });
  otherTeacher = await db.teacher.create({ data: { name: 'Other', surname: 'Teacher', districtId: otherDistrict.id } });
  const token = randomBytes(32).toString('base64url'); inspectorCsrf = createHmac('sha256', token).update('inspector-platform-csrf-v1').digest('base64url');
  inspectorCookie = `inspector_session=${token}; inspector_csrf=${inspectorCsrf}`;
  await db.session.create({ data: { inspectorId: inspector.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 3600000) } });
  const app = createApp((app) => { const guard = requireAuthenticatedInspector(db); registerTeacherAuth(app, db, guard); registerTeacherPortal(app, db, guard); registerTeacherPhotos(app, db, guard, privateStore); registerTeacherSchedules(app, db, guard); registerEvolutionWorkspace(app, db, guard); registerTeacherDirectoryRoutes(app, db, guard); registerWeeklyScheduleRoutes(app, db, guard); registerPedagogicalVisitRoutes(app, db, guard); });
  server = app.listen(0, '127.0.0.1'); await new Promise((done) => server.once('listening', done)); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise((done) => server.close(done)); if (db) await db.$disconnect(); try { if (admin && schema) await dropOwnedTestSchema(admin, url, schema); if (admin && publicSnapshot) assert.deepEqual(await publicState(), publicSnapshot, 'Persistent public/UAT data must not change'); } finally { if (admin) await admin.$disconnect(); } });

test('district-bound single-use invitation and Teacher login, independent of Inspector role', async () => {
  assert.equal((await call(`/teachers/${otherTeacher.id}/account-invitation`, 'POST', { email: 'other@example.invalid', identityConfirmed: true }, 'inspector')).status, 404);
  const issued = await call(`/teachers/${teacher.id}/account-invitation`, 'POST', { email: 'teacher-evolution@example.invalid', identityConfirmed: true }, 'inspector'); assert.equal(issued.status, 201);
  const { data } = await issued.json(); assert.equal(data.activationToken.length, 43);
  const initial = cookies(await call('/teacher/auth/csrf', 'GET', undefined, 'anonymous')); teacherCookie = initial.cookie; teacherCsrf = initial.csrf;
  assert.equal((await call('/teacher/auth/activate', 'POST', { token: data.activationToken, password })).status, 201);
  assert.equal((await call('/teacher/auth/activate', 'POST', { token: data.activationToken, password })).status, 400);
  const signedIn = await call('/teacher/auth/login', 'POST', { email: 'teacher-evolution@example.invalid', password }); assert.equal(signedIn.status, 200);
  assert.match(signedIn.headers.getSetCookie().find((s) => s.startsWith('teacher_session=')), /HttpOnly/); assert.match(signedIn.headers.getSetCookie().join(';'), /SameSite=Strict/);
  const signed = cookies(signedIn); teacherCookie = signed.cookie; teacherCsrf = signed.csrf;
  const session = await db.teacherSession.findFirst(); assert.equal(session.expiresAt.getTime() - session.createdAt.getTime(), 8 * 3600000);
  assert.equal((await call('/teacher/auth/login', 'POST', { email: 'teacher-evolution@example.invalid', password: 'wrong-credential' })).status, 401);
  const me = await call('/teacher/me'); assert.equal(me.status, 200); const own = await me.json(); assert.equal(own.data.teacher.id, teacher.id); assert.equal(JSON.stringify(own).includes('NEVER_DISCLOSE_PRIVATE_NOTE'), false);
  assert.equal((await call('/teachers')).status, 401); assert.equal((await call('/teacher/me', 'GET', undefined, 'inspector')).status, 401);
});
test('own profile denies arbitrary IDs, missing CSRF and sensitive status override; requests remain proposals', async () => {
  assert.equal((await call(`/teacher/me/${otherTeacher.id}`)).status, 404);
  const before = await db.teacher.findUnique({ where: { id: teacher.id } });
  assert.equal((await call('/teacher/requests', 'POST', { kind: 'CONTACT', payload: { email: 'new@example.invalid' } }, 'teacher', false)).status, 403);
  const bad = await call('/teacher/requests', 'POST', { kind: 'CONTACT', payload: { email: 'new@example.invalid', recordStatus: 'ACTIVE' } }); assert.equal(bad.status, 400); assert.equal((await bad.text()).includes('new@example.invalid'), false);
  const created = await call('/teacher/requests', 'POST', { kind: 'CONTACT', payload: { email: 'new@example.invalid' } }); assert.equal(created.status, 201);
  const { data } = await created.json(); assert.equal((await db.teacher.findUnique({ where: { id: teacher.id } })).email, before.email);
  assert.equal((await call(`/teacher-requests/${data.id}/decision`, 'POST', { decision: 'ACCEPT', expectedRevision: 1 })).status, 401);
  assert.equal((await call(`/teacher-requests/${data.id}/decision`, 'POST', { decision: 'ACCEPT', expectedRevision: 1 }, 'inspector')).status, 200);
  assert.equal((await db.teacher.findUnique({ where: { id: teacher.id } })).email, 'new@example.invalid');
  assert.equal((await call(`/teacher-requests/${data.id}/decision`, 'POST', { decision: 'ACCEPT', expectedRevision: 1 }, 'inspector')).status, 409);
});
test('training completion remains unverified and cannot silently grant tenure eligibility', async () => {
  const proposed = await call('/teacher/requests', 'POST', { kind: 'TRAINING', payload: { status: 'COMPLETED' } }); assert.equal(proposed.status, 201); const { data } = await proposed.json();
  assert.equal((await call(`/teacher-requests/${data.id}/decision`, 'POST', { decision: 'ACCEPT', expectedRevision: 1 }, 'inspector')).status, 409);
  assert.equal((await db.teacher.findUnique({ where: { id: teacher.id } })).trainingVerifiedAt, null);
  const visit = await call('/visits', 'POST', { teacherId: teacher.id, institutionId: institution.id, academicYear: '2026-2027', visitType: 'TENURE_CONFIRMATION', scheduledStartAt: '2027-01-04T08:00:00Z', scheduledEndAt: '2027-01-04T09:00:00Z' }, 'inspector'); assert.equal(visit.status, 409); assert.equal((await visit.json()).error.code, 'TENURE_ELIGIBILITY_REQUIRED');
});
test('professional proposals reject impossible dates and Inspector-only administrative fields, then approve atomically', async () => {
  assert.equal((await call('/teacher/requests', 'POST', { kind: 'PROFILE', payload: { administrativeNote: 'not-allowed' } })).status, 400);
  assert.equal((await call('/teacher/requests', 'POST', { kind: 'PROFILE', payload: { employedAt: '2099-01-01' } })).status, 400);
  const proposed = await call('/teacher/requests', 'POST', { kind: 'PROFILE', payload: { placeOfBirth: 'Synthetic approved place' } }); assert.equal(proposed.status, 201); const { data } = await proposed.json();
  assert.notEqual((await db.teacher.findUnique({ where: { id: teacher.id } })).placeOfBirth, 'Synthetic approved place');
  assert.equal((await call(`/teacher-requests/${data.id}/decision`, 'POST', { decision: 'ACCEPT', expectedRevision: 1 }, 'inspector')).status, 200);
  assert.equal((await db.teacher.findUnique({ where: { id: teacher.id } })).placeOfBirth, 'Synthetic approved place');
});
test('location requires own approved institution, six-place precision and explicit Inspector decision', async () => {
  assert.equal((await call('/teacher/requests', 'POST', { kind: 'LOCATION', payload: { institutionId: institution.id, latitude: 36.1234567, longitude: 3 } })).status, 400);
  assert.equal((await call('/teacher/requests', 'POST', { kind: 'LOCATION', payload: { institutionId: randomUUID(), latitude: 36, longitude: 3 } })).status, 404);
  const created = await call('/teacher/requests', 'POST', { kind: 'LOCATION', payload: { institutionId: institution.id, latitude: 36.123456, longitude: 3.123456 } }); assert.equal(created.status, 201); const { data } = await created.json();
  assert.equal((await db.institution.findUnique({ where: { id: institution.id } })).latitude, null);
  const review = await call('/teacher-requests?kind=LOCATION', 'GET', undefined, 'inspector'); const view = await review.json(); assert.equal(view.data[0].institutionContext.name, institution.name); assert.equal(view.data[0].institutionContext.location, null);
  assert.equal((await call(`/teacher-requests/${data.id}/decision`, 'POST', { decision: 'ACCEPT', expectedRevision: 1 }, 'inspector')).status, 200);
  const place = await db.institution.findUnique({ where: { id: institution.id } }); assert.equal(place.latitude.toFixed(6), '36.123456'); assert.equal(place.locationSource, 'TEACHER_PROPOSED_APPROVED');
});
test('workplace declaration cannot auto-create/match Institution or Assignment; explicit approved resolution is required', async () => {
  const before = await db.institution.count(); const created = await call('/teacher/requests', 'POST', { kind: 'WORKPLACE', payload: { institutionName: 'Synthetic declared place only' } }); assert.equal(created.status, 201); const { data } = await created.json();
  assert.equal((await call(`/teacher-requests/${data.id}/decision`, 'POST', { decision: 'ACCEPT', expectedRevision: 1 }, 'inspector')).status, 409);
  assert.equal((await call(`/teacher-requests/${data.id}/decision`, 'POST', { decision: 'ACCEPT', expectedRevision: 1, resolvedInstitutionId: randomUUID() }, 'inspector')).status, 404);
  assert.equal((await call(`/teacher-requests/${data.id}/decision`, 'POST', { decision: 'ACCEPT', expectedRevision: 1, resolvedInstitutionId: institution.id }, 'inspector')).status, 200);
  assert.equal(await db.institution.count(), before);
  const event = await db.auditLog.findFirst({ where: { entityId: data.id, action: 'TEACHER_REQUEST_DECIDED' } }); assert.equal(event.metadata.resolvedInstitutionId, institution.id);
});
test('transfer source decision is non-effective and preserves canonical district and identity', async () => {
  const proposed = await call('/teacher/requests', 'POST', { kind: 'TRANSFER', payload: { destinationDistrictId: otherDistrict.id, reason: 'Synthetic transfer request' } }); assert.equal(proposed.status, 201); const { data } = await proposed.json();
  const decided = await call(`/teacher-requests/${data.id}/decision`, 'POST', { decision: 'ACCEPT', expectedRevision: 1 }, 'inspector'); assert.equal(decided.status, 200); assert.equal((await decided.json()).data.status, 'APPROVED_PENDING_DESTINATION');
  assert.equal((await db.teacher.findUnique({ where: { id: teacher.id } })).districtId, district.id);
});
test('initial schedule -> requested correction -> proposed replacement -> atomic acceptance, canonical preserved until acceptance', async () => {
  const prospectiveDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date(Date.now() + 86_400_000));
  const slot = { institutionId: institution.id, validFrom: prospectiveDate, dayOfWeek: 1, startMinute: 480, endMinute: 540 };
  assert.equal((await call(`/teachers/${teacher.id}/schedules`, 'POST', { academicYear: '2026-2027', slots: [slot] }, 'inspector')).status, 409);
  const created = await call('/teacher/schedules', 'POST', { academicYear: '2026-2027', slots: [slot] }); assert.equal(created.status, 201); const initial = (await created.json()).data.schedule;
  assert.equal((await call('/teacher/schedules', 'POST', { academicYear: '2026-2027', slots: [slot] })).status, 409);
  const request = await call(`/teachers/${teacher.id}/schedule-corrections`, 'POST', { academicYear: '2026-2027', note: 'Synthetic correction: start time', expectedRevision: initial.revision }, 'inspector'); assert.equal(request.status, 201); const correction = (await request.json()).data;
  assert.equal((await call(`/teacher/schedule-corrections/${correction.id}`, 'POST', { academicYear: '2026-2027', slots: [{ ...slot, startMinute: 600, endMinute: 660 }], expectedRevision: 1 })).status, 200);
  assert.equal((await db.weeklyScheduleSlot.findFirst({ where: { scheduleId: initial.id } })).startMinute, 480);
  const accepted = await call(`/schedule-corrections/${correction.id}/accept`, 'POST', { expectedRevision: 2 }, 'inspector'); assert.equal(accepted.status, 200);
  assert.equal((await db.weeklyScheduleSlot.findFirst({ where: { scheduleId: initial.id } })).startMinute, 600);
  assert.equal((await db.scheduleCorrection.findUnique({ where: { id: correction.id } })).previousSlots[0].startMinute, 480);
  assert.equal((await call(`/schedule-corrections/${correction.id}/accept`, 'POST', { expectedRevision: 2 }, 'inspector')).status, 409);
});
test('R2 schedule ownership, independent review, rejection recovery and atomic concurrency', async (t) => {
  const year = '2045-2046'; let canonical; let proposal;
  const slot = { institutionId: institution.id, validFrom: '2045-09-01', dayOfWeek: 4, startMinute: 480, endMinute: 540 };
  const proposalBody = () => ({ academicYear: year, slots: [{ ...slot, startMinute: 600, endMinute: 660 }], expectedRevision: canonical.revision });
  const propose = async () => { const response = await call('/teacher/schedules', 'POST', proposalBody()); assert.equal(response.status, 201); return (await response.json()).data.correction; };
  const reject = (p, reason = 'راجع الحصة — سبب اصطناعي') => call(`/schedule-corrections/${p.id}/reject`, 'POST', { expectedRevision: p.revision, reason }, 'inspector');
  await t.test('SCHEDULE-01 Inspector cannot create for an unonboarded Teacher', async () => {
    const unonboarded = await db.teacher.create({ data: { districtId: district.id, name: 'Unonboarded', surname: 'No account' } });
    assert.equal((await call(`/teachers/${unonboarded.id}/schedules`, 'POST', { academicYear: year, slots: [] }, 'inspector')).status, 409);
    assert.equal(await db.weeklySchedule.count({ where: { teacherId: unonboarded.id } }), 0);
  });
  await t.test('SCHEDULE-03 initial Teacher submission is canonical without approval', async () => {
    const response = await call('/teacher/schedules', 'POST', { academicYear: year, slots: [slot] }); assert.equal(response.status, 201); canonical = (await response.json()).data.schedule;
    assert.equal(canonical.revision, 1); assert.equal(await db.scheduleCorrection.count({ where: { teacherId: teacher.id, academicYear: year } }), 0);
  });
  await t.test('SCHEDULE-02 all four Inspector write routes preserve canonical and audit', async () => {
    const before = await db.weeklySchedule.findUniqueOrThrow({ where: { id: canonical.id }, include: { slots: true } }); const auditCount = await db.auditLog.count();
    for (const [path, method, payload] of [
      [`/teachers/${teacher.id}/schedules`, 'POST', { academicYear: '2046-2047', slots: [] }],
      [`/schedules/${canonical.id}/slots`, 'POST', { expectedRevision: 1, slot }],
      [`/slots/${canonical.slots[0].id}`, 'PATCH', { expectedRevision: 1, changes: { startMinute: 490 } }],
      [`/slots/${canonical.slots[0].id}`, 'DELETE', { expectedRevision: 1 }],
    ]) assert.equal((await call(path, method, payload, 'inspector')).status, 409);
    assert.deepEqual(await db.weeklySchedule.findUniqueOrThrow({ where: { id: canonical.id }, include: { slots: true } }), before); assert.equal(await db.auditLog.count(), auditCount);
  });
  await t.test('SCHEDULE-04 independent update is pending, bounded alerts include it, duplicate denied', async () => {
    const competing = await Promise.all([call('/teacher/schedules', 'POST', proposalBody()), call('/teacher/schedules', 'POST', proposalBody())]);
    assert.deepEqual(competing.map(response => response.status).sort(), [201,409]);
    proposal = (await competing.find(response => response.status === 201).json()).data.correction; assert.equal(proposal.origin, 'TEACHER_UPDATE'); assert.equal(proposal.inspectorId, null); assert.equal(proposal.status, 'SUBMITTED');
    assert.equal((await db.weeklyScheduleSlot.findFirst({ where: { scheduleId: canonical.id } })).startMinute, 480);
    assert.equal((await call('/teacher/schedules', 'POST', proposalBody())).status, 409);
    assert.ok((await (await call('/me/work-alerts', 'GET', undefined, 'inspector')).json()).data.corrections >= 1);
  });
  await t.test('schedule review enforces role, object scope and CSRF without changing pending or canonical data', async () => {
    const before = await db.weeklySchedule.findUniqueOrThrow({ where: { id: canonical.id }, include: { slots: true } });
    for (const action of ['accept','reject']) {
      const payload = { expectedRevision: proposal.revision, ...(action === 'reject' ? { reason: 'سبب اختبار' } : {}) };
      assert.equal((await call(`/schedule-corrections/${proposal.id}/${action}`, 'POST', payload)).status, 401);
      assert.equal((await call(`/schedule-corrections/${proposal.id}/${action}`, 'POST', payload, 'inspector', false)).status, 403);
    }
    assert.equal((await call('/teacher/schedules', 'POST', proposalBody(), 'teacher', false)).status, 403);
    assert.equal((await call('/teacher/schedules', 'POST', { ...proposalBody(), teacherId: otherTeacher.id })).status, 400);
    assert.equal((await call(`/teacher/schedules?academicYear=${year}&teacherId=${otherTeacher.id}`)).status, 400);
    assert.equal((await call(`/teachers/${otherTeacher.id}/schedule-corrections`, 'GET', undefined, 'inspector')).status, 404);
    const outsider = await db.inspector.create({ data: { email: `schedule-outsider-${randomUUID()}@example.invalid`, passwordHash: 'synthetic-unused', status: 'ACTIVE' } });
    await db.inspectorDistrictMembership.create({ data: { inspectorId: outsider.id, districtId: otherDistrict.id, role: 'INSPECTOR', validFrom: new Date('2020-01-01') } });
    const token = randomBytes(32).toString('base64url'); const csrf = createHmac('sha256', token).update('inspector-platform-csrf-v1').digest('base64url');
    await db.session.create({ data: { inspectorId: outsider.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 3600000) } });
    const headers = { cookie: `inspector_session=${token}; inspector_csrf=${csrf}`, 'x-csrf-token': csrf, 'content-type': 'application/json' };
    for (const action of ['accept','reject']) assert.equal((await fetch(`${base}/api/v1/schedule-corrections/${proposal.id}/${action}`, { method: 'POST', headers, body: JSON.stringify({ expectedRevision: proposal.revision, ...(action === 'reject' ? { reason: 'سبب اختبار' } : {}) }) })).status, 404);
    assert.deepEqual(await db.weeklySchedule.findUniqueOrThrow({ where: { id: canonical.id }, include: { slots: true } }), before);
    assert.equal((await db.scheduleCorrection.findUniqueOrThrow({ where: { id: proposal.id } })).status, 'SUBMITTED');
  });
  await t.test('SCHEDULE-05 accept updates canonical once and snapshots/audits atomically', async () => {
    const accepted = await call(`/schedule-corrections/${proposal.id}/accept`, 'POST', { expectedRevision: proposal.revision }, 'inspector'); assert.equal(accepted.status, 200); canonical = (await accepted.json()).data.schedule;
    assert.equal(canonical.revision, 2); assert.equal(canonical.slots[0].startMinute, 600);
    const history = await db.scheduleCorrection.findUniqueOrThrow({ where: { id: proposal.id } }); assert.equal(history.previousSlots[0].startMinute, 480); assert.equal(history.decisionInspectorId, inspector.id);
    assert.equal(await db.auditLog.count({ where: { entityId: proposal.id, action: 'TEACHER_SCHEDULE_UPDATE_ACCEPTED' } }), 1);
  });
  await t.test('SCHEDULE-06 reject requires reason and keeps canonical/proposal/history', async () => {
    proposal = await propose(); const before = await db.weeklySchedule.findUniqueOrThrow({ where: { id: canonical.id }, include: { slots: true } });
    assert.equal((await reject(proposal, '   ')).status, 400); assert.equal((await reject(proposal)).status, 200);
    assert.deepEqual(await db.weeklySchedule.findUniqueOrThrow({ where: { id: canonical.id }, include: { slots: true } }), before);
    const own = (await (await call(`/teacher/schedules?academicYear=${year}`)).json()).data; assert.equal(own.correction, null); assert.equal(own.reviews[0].status, 'REJECTED'); assert.equal(own.reviews[0].decisionNote, 'راجع الحصة — سبب اصطناعي'); assert.ok(own.reviews[0].proposedSlots);
    assert.equal((await reject(proposal)).status, 409);
  });
  await t.test('SCHEDULE-07 Inspector requests a specific correction', async () => {
    const response = await call(`/teachers/${teacher.id}/schedule-corrections`, 'POST', { academicYear: year, note: 'راجع توقيت الحصة', expectedRevision: canonical.revision }, 'inspector'); assert.equal(response.status, 201); proposal = (await response.json()).data; assert.equal(proposal.origin, 'INSPECTOR_CORRECTION');
  });
  await t.test('SCHEDULE-08 Teacher resubmits, canonical remains effective', async () => {
    const response = await call(`/teacher/schedule-corrections/${proposal.id}`, 'POST', { academicYear: year, slots: [slot], expectedRevision: proposal.revision }); assert.equal(response.status, 200); proposal = await db.scheduleCorrection.findUniqueOrThrow({ where: { id: proposal.id } }); assert.equal(proposal.status, 'SUBMITTED');
    assert.equal((await db.weeklyScheduleSlot.findFirst({ where: { scheduleId: canonical.id } })).startMinute, 600);
  });
  await t.test('SCHEDULE-09 accept correction retains prior canonical snapshot', async () => {
    const response = await call(`/schedule-corrections/${proposal.id}/accept`, 'POST', { expectedRevision: proposal.revision }, 'inspector'); assert.equal(response.status, 200); canonical = (await response.json()).data.schedule; assert.equal(canonical.slots[0].startMinute, 480);
    assert.equal((await db.scheduleCorrection.findUniqueOrThrow({ where: { id: proposal.id } })).previousSlots[0].startMinute, 600);
  });
  await t.test('SCHEDULE-10 reject correction then allow a fresh independent revision', async () => {
    const created = await call(`/teachers/${teacher.id}/schedule-corrections`, 'POST', { academicYear: year, note: 'راجع مرة ثانية', expectedRevision: canonical.revision }, 'inspector'); proposal = (await created.json()).data;
    assert.equal((await call(`/teacher/schedule-corrections/${proposal.id}`, 'POST', { academicYear: year, slots: [slot], expectedRevision: 1 })).status, 200); proposal = await db.scheduleCorrection.findUniqueOrThrow({ where: { id: proposal.id } });
    assert.equal((await reject(proposal)).status, 200); proposal = await propose(); assert.equal(proposal.origin, 'TEACHER_UPDATE');
  });
  await t.test('SCHEDULE-11 stale workplace conflict -> explicit rejection -> fresh valid revision', async () => {
    const newHome = await db.institution.create({ data: { districtId: district.id, name: 'Synthetic new home R2' } }); await db.teacher.update({ where: { id: teacher.id }, data: { institutionId: newHome.id } });
    try {
      assert.equal((await call(`/schedule-corrections/${proposal.id}/accept`, 'POST', { expectedRevision: proposal.revision }, 'inspector')).status, 409);
      assert.equal((await db.scheduleCorrection.findUniqueOrThrow({ where: { id: proposal.id } })).status, 'SUBMITTED');
      assert.equal((await reject(proposal)).status, 200);
      const fresh = await call('/teacher/schedules', 'POST', { ...proposalBody(), slots: [{ ...slot, institutionId: newHome.id }] }); assert.equal(fresh.status, 201); const pending = (await fresh.json()).data.correction; assert.equal((await reject(pending)).status, 200);
      assert.equal((await db.weeklyScheduleSlot.findFirst({ where: { scheduleId: canonical.id } })).institutionId, institution.id);
    } finally { await db.teacher.update({ where: { id: teacher.id }, data: { institutionId: institution.id } }); }
  });
  await t.test('SCHEDULE-12 racing terminal decisions have one winner; stale revision cannot overwrite', async () => {
    proposal = await propose(); const race = await Promise.all([call(`/schedule-corrections/${proposal.id}/accept`, 'POST', { expectedRevision: proposal.revision }, 'inspector'), reject(proposal)]); assert.deepEqual(race.map((r) => r.status).sort(), [200,409]);
    const read = (await (await call(`/teacher/schedules?academicYear=${year}`)).json()).data; canonical = read.schedule; proposal = await propose();
    await db.weeklySchedule.update({ where: { id: canonical.id }, data: { revision: { increment: 1 } } });
    assert.equal((await call(`/schedule-corrections/${proposal.id}/accept`, 'POST', { expectedRevision: proposal.revision }, 'inspector')).status, 409); assert.equal((await reject(proposal)).status, 200);
  });
  await t.test('required review audit failure rolls accept and rejection back without sensitive leakage', async () => {
    canonical = (await (await call(`/teacher/schedules?academicYear=${year}`)).json()).data.schedule; proposal = await propose();
    const before = await db.weeklySchedule.findUniqueOrThrow({ where: { id: canonical.id }, include: { slots: true } });
    await db.$executeRaw`CREATE FUNCTION r2_fail_schedule_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('TEACHER_SCHEDULE_UPDATE_ACCEPTED','TEACHER_SCHEDULE_UPDATE_REJECTED') THEN RAISE EXCEPTION 'private synthetic failure'; END IF; RETURN NEW; END $$`;
    await db.$executeRaw`CREATE TRIGGER r2_fail_schedule_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION r2_fail_schedule_audit()`;
    try {
      for (const response of [await call(`/schedule-corrections/${proposal.id}/accept`, 'POST', { expectedRevision: proposal.revision }, 'inspector'), await reject(proposal)]) { assert.equal(response.status, 500); assert.ok(response.headers.get('x-request-id')); assert.equal((await response.text()).includes('private synthetic failure'), false); }
      assert.deepEqual(await db.weeklySchedule.findUniqueOrThrow({ where: { id: canonical.id }, include: { slots: true } }), before); assert.equal((await db.scheduleCorrection.findUniqueOrThrow({ where: { id: proposal.id } })).status, 'SUBMITTED');
    } finally { await db.$executeRaw`DROP TRIGGER r2_fail_schedule_audit ON "AuditLog"`; await db.$executeRaw`DROP FUNCTION r2_fail_schedule_audit()`; }
    assert.equal((await reject(proposal)).status, 200);
  });
});

test('private photo upload/read is own-account/district-authorized and never exposes storage keys', async () => {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const created = await call('/teacher/photo', 'POST', png); assert.equal(created.status, 201); assert.equal((await created.text()).includes('storageKey'), false);
  const stored = await db.teacherPhoto.findFirstOrThrow({ where: { teacherId: teacher.id } }); assert.equal(stored.sanitizationVersion, 1); assert.equal((await sharp(storage.get(stored.storageKey)).metadata()).exif, undefined);
  assert.equal((await call('/teacher/photo')).status, 200); assert.equal((await call(`/teachers/${teacher.id}/photo`, 'GET', undefined, 'inspector')).status, 200);
  assert.equal((await call(`/teachers/${otherTeacher.id}/photo`, 'GET', undefined, 'inspector')).status, 404);
  assert.equal((await call(`/teachers/${teacher.id}/photo`)).status, 401);
  assert.equal((await call('/teacher/photo', 'GET', undefined, 'anonymous')).status, 401);
  const beforeReplacement = await db.teacherPhoto.findFirst({ where: { teacherId: teacher.id } });
  assert.equal((await call('/teacher/photo', 'POST', png)).status, 201);
  assert.equal(await db.teacherPhoto.count({ where: { teacherId: teacher.id } }), 2);
  assert.ok(storage.has(beforeReplacement.storageKey), 'Replacement cannot silently delete the prior asset');
  const simultaneous = await Promise.all([call('/teacher/photo', 'POST', png), call('/teacher/photo', 'POST', png)]);
  assert.ok(simultaneous.every((response) => response.status === 201));
  const ordered = await db.teacherPhoto.findMany({ where: { teacherId: teacher.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  assert.equal(ordered.length, 4);
  for (let index = 1; index < ordered.length; index++) assert.ok(ordered[index].createdAt > ordered[index - 1].createdAt, 'Serialized replacements must have an unambiguous current asset');
  assert.equal((await call('/teacher/photo', 'POST', png, 'teacher', false)).status, 403);
});

test('PHOTO-05/06/07 stored and served JPEG is sanitized; Teacher object and Inspector district authorization fail closed', async () => {
  const jpeg = withSyntheticGpsExif(await sharp({ create: { width: 16, height: 12, channels: 3, background: '#ffffff' } }).jpeg().toBuffer());
  const uploaded = await fetch(`${base}/api/v1/teacher/photo`, { method: 'POST', headers: { cookie: teacherCookie, 'x-csrf-token': teacherCsrf, 'content-type': 'image/jpeg' }, body: jpeg });
  assert.equal(uploaded.status, 201);
  const latest = await db.teacherPhoto.findFirstOrThrow({ where: { teacherId: teacher.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const saved = storage.get(latest.storageKey); const metadata = await sharp(saved).metadata();
  assert.equal(latest.sanitizationVersion, 1); assert.equal(latest.contentType, 'image/jpeg'); assert.equal(latest.byteLength, saved.length);
  assert.equal(metadata.exif, undefined); assert.equal(metadata.xmp, undefined); assert.equal(metadata.orientation, undefined); assert.deepEqual([metadata.width, metadata.height], [12,16]);
  for (const [path, actor] of [['/teacher/photo', 'teacher'], ['/teacher/photo?v=1', 'teacher'], [`/teachers/${teacher.id}/photo`, 'inspector']]) {
    const served = await call(path, 'GET', undefined, actor); assert.equal(served.status, 200); assert.equal(served.headers.get('content-type'), 'image/jpeg'); assert.equal(served.headers.get('cache-control'), 'no-store'); assert.equal(served.headers.get('x-content-type-options'), 'nosniff'); assert.match(served.headers.get('content-disposition'), /^inline/u);
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), saved);
  }
  const accountB = await db.teacherAccount.create({ data: { teacherId: otherTeacher.id, loginEmail: 'photo-other@example.invalid', passwordHash: 'synthetic-unused' } });
  const tokenB = randomBytes(32).toString('base64url'); await db.teacherSession.create({ data: { accountId: accountB.id, tokenHash: hash(tokenB), expiresAt: new Date(Date.now() + 3600000) } });
  const otherOwn = await fetch(`${base}/api/v1/teacher/photo`, { headers: { cookie: `teacher_session=${tokenB}` } }); assert.equal(otherOwn.status, 404);
  assert.equal((await call(`/teacher/photo?teacherId=${otherTeacher.id}`)).status, 400);
  assert.equal((await call('/teacher/photo?v=identity')).status, 400);
  assert.equal((await call(`/teacher/photos/${otherTeacher.id}`)).status, 404);
  const outsider = await db.inspector.create({ data: { email: `photo-outsider-${randomUUID()}@example.invalid`, passwordHash: 'synthetic-unused', status: 'ACTIVE' } });
  await db.inspectorDistrictMembership.create({ data: { inspectorId: outsider.id, districtId: otherDistrict.id, role: 'INSPECTOR', validFrom: new Date('2020-01-01') } });
  const outsideToken = randomBytes(32).toString('base64url'); await db.session.create({ data: { inspectorId: outsider.id, tokenHash: hash(outsideToken), expiresAt: new Date(Date.now() + 3600000) } });
  assert.equal((await fetch(`${base}/api/v1/teachers/${teacher.id}/photo`, { headers: { cookie: `inspector_session=${outsideToken}` } })).status, 404);
  const legacyKey = randomUUID(); storage.set(legacyKey, jpeg);
  await db.teacherPhoto.create({ data: { teacherId: otherTeacher.id, contentType: 'image/jpeg', byteLength: jpeg.length, storageKey: legacyKey } });
  assert.equal((await fetch(`${base}/api/v1/teacher/photo`, { headers: { cookie: `teacher_session=${tokenB}` } })).status, 404, 'legacy unsanitized asset must not be served');
  assert.equal(await db.teacherPhoto.count({ where: { teacherId: otherTeacher.id } }), 1, 'legacy metadata remains retained');
});

test('proposal decision concurrency, stale baseline and audit failure cannot partially change canonical data', async () => {
  const submitted = await call('/teacher/requests', 'POST', { kind: 'CONTACT', payload: { email: 'concurrency@example.invalid' } }); const request = (await submitted.json()).data;
  const responses = await Promise.all([call(`/teacher-requests/${request.id}/decision`, 'POST', { decision: 'ACCEPT', expectedRevision: 1 }, 'inspector'), call(`/teacher-requests/${request.id}/decision`, 'POST', { decision: 'REJECT', expectedRevision: 1 }, 'inspector')]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await db.auditLog.count({ where: { entityId: request.id, action: 'TEACHER_REQUEST_DECIDED' } }), 1);
  const stale = (await (await call('/teacher/requests', 'POST', { kind: 'CONTACT', payload: { email: 'stale@example.invalid' } })).json()).data;
  await db.teacher.update({ where: { id: teacher.id }, data: { phone: '+213555123456' } });
  assert.equal((await call(`/teacher-requests/${stale.id}/decision`, 'POST', { decision: 'ACCEPT', expectedRevision: 1 }, 'inspector')).status, 409);
  assert.notEqual((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).email, 'stale@example.invalid');
  assert.equal((await call(`/teacher-requests/${stale.id}/decision`, 'POST', { decision: 'REJECT', expectedRevision: 1 }, 'inspector')).status, 200);
  const rollback = (await (await call('/teacher/requests', 'POST', { kind: 'CONTACT', payload: { email: 'rollback@example.invalid' } })).json()).data;
  const before = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
  await db.$executeRawUnsafe(`CREATE FUNCTION "${schema}".evolution_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='TEACHER_REQUEST_DECIDED' THEN RAISE EXCEPTION 'synthetic private error'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER evolution_audit_fail BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${schema}".evolution_audit_fail()`);
  try {
    const failed = await call(`/teacher-requests/${rollback.id}/decision`, 'POST', { decision: 'ACCEPT', expectedRevision: 1 }, 'inspector');
    assert.equal(failed.status, 500); assert.ok(failed.headers.get('x-request-id')); const error = await failed.text(); assert.equal(error.includes('synthetic private error'), false); assert.equal(error.includes('rollback@example.invalid'), false);
    assert.deepEqual(await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } }), before);
    assert.equal((await db.teacherChangeRequest.findUniqueOrThrow({ where: { id: rollback.id } })).status, 'PENDING');
    assert.equal(await db.auditLog.count({ where: { entityId: rollback.id, action: 'TEACHER_REQUEST_DECIDED' } }), 0);
  } finally { await db.$executeRaw`DROP TRIGGER evolution_audit_fail ON "AuditLog"`; await db.$executeRawUnsafe(`DROP FUNCTION "${schema}".evolution_audit_fail()`); }
});

test('verified trainee eligibility is prospective and own supplementary timetable input preserves dated workplace rules', async () => {
  const supplementary = await db.institution.create({ data: { districtId: district.id, name: 'Synthetic supplementary home' } });
  await db.teacherSupplementaryWorkplace.create({ data: { teacherId: teacher.id, institutionId: supplementary.id, districtId: district.id, validFrom: new Date('2026-01-01') } });
  const slot = { institutionId: supplementary.id, validFrom: '2027-10-05', dayOfWeek: 2, startMinute: 600, endMinute: 660 };
  assert.equal((await call('/teacher/schedules', 'POST', { academicYear: '2027-2028', slots: [slot] })).status, 201);
  assert.equal((await db.weeklyScheduleSlot.findFirst({ where: { institutionId: supplementary.id } })).workplaceBasis, 'SUPPLEMENTARY');
  await db.teacher.update({ where: { id: teacher.id }, data: { trainingStatus: 'COMPLETED', trainingVerifiedAt: new Date() } });
  const visit = { teacherId: teacher.id, institutionId: institution.id, academicYear: '2026-2027', visitType: 'TENURE_CONFIRMATION', scheduledStartAt: '2027-01-04T09:00:00Z', scheduledEndAt: '2027-01-04T10:00:00Z' };
  const accepted = await call('/visits', 'POST', visit, 'inspector'); assert.equal(accepted.status, 201); const previous = await db.pedagogicalVisit.findFirstOrThrow({ where: { teacherId: teacher.id } });
  await db.teacher.update({ where: { id: teacher.id }, data: { professionalStatus: 'CONTRACT' } });
  const rejected = await call('/visits', 'POST', { ...visit, scheduledStartAt: '2027-01-11T09:00:00Z', scheduledEndAt: '2027-01-11T10:00:00Z' }, 'inspector'); assert.equal(rejected.status, 409); assert.equal((await rejected.json()).error.code, 'TENURE_ELIGIBILITY_REQUIRED');
  assert.deepEqual(await db.pedagogicalVisit.findUniqueOrThrow({ where: { id: previous.id } }), previous);
  await db.teacher.update({ where: { id: teacher.id }, data: { professionalStatus: 'TRAINEE', trainingStatus: null, trainingVerifiedAt: null } });
  const ownHistory = await call(`/teachers/${teacher.id}/evolution-history`, 'GET', undefined, 'inspector'); assert.equal(ownHistory.status, 200); assert.equal((await ownHistory.json()).data.visits[0].id, previous.id);
  assert.equal((await call(`/teachers/${otherTeacher.id}/evolution-history`, 'GET', undefined, 'inspector')).status, 404);
});
test('geography/directory/search counts are scoped, supporting municipality and bounded pagination', async () => {
  const geo = await call('/me/geography', 'GET', undefined, 'inspector'); assert.equal(geo.status, 200); assert.equal(JSON.stringify(await geo.json()).includes(otherDistrict.id), false);
  const list = await call('/teachers?municipality=Synthetic%20Municipality&limit=1', 'GET', undefined, 'inspector'); assert.equal(list.status, 200); const value = await list.json(); assert.equal(value.data.length, 1); assert.equal(value.data[0].id, teacher.id); assert.equal(value.data[0].hasSupplementaryWorkplaces, true);
  assert.equal((await call(`/institutions/${institution.id}/workspace`, 'GET', undefined, 'inspector')).status, 200);
});
test('database rejects verified unknown/incomplete training and preserves nullable legacy state', async () => {
  for (const status of [null, 'NOT_STARTED', 'IN_PROGRESS', 'INCOMPLETE']) {
    await assert.rejects(db.teacher.update({ where: { id: teacher.id }, data: { trainingStatus: status, trainingVerifiedAt: new Date() } }));
  }
  const row = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
  assert.equal(row.trainingStatus, null); assert.equal(row.trainingVerifiedAt, null);
});

test('audit records state changes without PII, secrets or raw payloads', async () => {
  const rows = await db.auditLog.findMany({ where: { action: { startsWith: 'TEACHER_' } } }); assert.ok(rows.length >= 8);
  for (const row of rows) { const json = JSON.stringify(row.metadata); for (const forbidden of ['example.invalid', 'Synthetic correction', password, 'password', 'tokenHash', 'storageKey', 'cookie']) assert.equal(json.includes(forbidden), false); assert.notEqual(row.actorTeacherId !== null, row.actorInspectorId !== null); }
});
test('inactive teacher/account, expiry, revoked session and logout deny access', async () => {
  await db.teacherAccount.update({ where: { teacherId: teacher.id }, data: { status: 'INACTIVE' } }); assert.equal((await call('/teacher/me')).status, 401);
  await db.teacherAccount.update({ where: { teacherId: teacher.id }, data: { status: 'ACTIVE' } });
  await db.teacher.update({ where: { id: teacher.id }, data: { recordStatus: 'INACTIVE' } }); assert.equal((await call('/teacher/me')).status, 401);
  await db.teacher.update({ where: { id: teacher.id }, data: { recordStatus: 'ACTIVE' } });
  const token = teacherCookie.split(';').find((s) => s.trim().startsWith('teacher_session=')).trim().slice('teacher_session='.length); const session = await db.teacherSession.findUnique({ where: { tokenHash: hash(token) } });
  await db.teacherSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } }); assert.equal((await call('/teacher/me')).status, 401);
  await db.teacherSession.update({ where: { id: session.id }, data: { revokedAt: null, createdAt: new Date('2020-01-01'), expiresAt: new Date('2020-01-02') } }); assert.equal((await call('/teacher/me')).status, 401);
  await db.teacherSession.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + 3600000) } });
  assert.equal((await call('/teacher/auth/logout', 'POST', {})).status, 200); assert.equal((await call('/teacher/me')).status, 401);
});

test('production Teacher cookie attributes are Secure and burst login attempts are bounded', async () => {
  const previous = process.env.NODE_ENV; const trusted = process.env.TRUSTED_CLIENT_IP_SOURCE;
  try {
    process.env.NODE_ENV = 'production'; process.env.TRUSTED_CLIENT_IP_SOURCE = 'cloudflare';
    const setup = cookies(await call('/teacher/auth/csrf', 'GET', undefined, 'anonymous'));
    const login = await fetch(`${base}/api/v1/teacher/auth/login`, { method: 'POST', headers: { cookie: setup.cookie, 'x-csrf-token': setup.csrf, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.20' }, body: JSON.stringify({ email: 'teacher-evolution@example.invalid', password }) });
    assert.equal(login.status, 200); assert.match(login.headers.getSetCookie().find((s) => s.startsWith('teacher_session=')), /; Secure;/); assert.match(login.headers.getSetCookie().find((s) => s.startsWith('teacher_session=')), /; HttpOnly;/);
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; if (trusted === undefined) delete process.env.TRUSTED_CLIENT_IP_SOURCE; else process.env.TRUSTED_CLIENT_IP_SOURCE = trusted; }
  let limited;
  for (let i = 0; i < 12; i += 1) { const result = await call('/teacher/auth/login', 'POST', { email: 'absent@example.invalid', password: 'invalid' }); if (result.status === 429) { limited = result; break; } assert.equal(result.status, 401); }
  assert.ok(limited); assert.ok(Number(limited.headers.get('retry-after')) > 0); assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
});
