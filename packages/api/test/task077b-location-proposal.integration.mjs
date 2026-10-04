import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, URL } from 'node:url';
import { assertLiveTestDatabase, createOwnedTestSchema, dropOwnedTestSchema, generateTestSchema } from '../../../scripts/test-schema-safety.mjs';

const require = createRequire(import.meta.url);
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(apiDir, '../..');
const migrationName = '20261003160000_task_077b_institution_location_proposal';
const schemaPath = join(apiDir, 'prisma', 'schema.prisma');
const migrationDir = join(apiDir, 'prisma', 'migrations');
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, 'utf8'));
const prismaCliPath = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
const password = 'task077b-synthetic-password';
let baseUrl; let admin; let db; let upgradeDb; let server; let appUrl; let ownedSchema; let upgradeSchema;
let schemaCreated = false; let upgradeSchemaCreated = false; let tempRoot;
let inspector; let inactiveInspector; let district; let otherDistrict; let institution; let cookies; let csrf;

function approvedUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('Isolated test target is required; refusing database access.');
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55432'
    || decodeURIComponent(url.username) !== 'task020_test_user' || url.pathname !== '/task020_test'
    || url.searchParams.get('schema') !== 'public') throw new Error('Unapproved isolated database target.');
  return raw;
}

function runPrisma(args, url, selectedSchema = schemaPath) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args, '--schema', selectedSchema], {
    cwd: rootDir, encoding: 'utf8', timeout: 180000, windowsHide: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error || result.status !== 0) throw new Error(`Isolated migration ${args[0]} failed.`);
}

function cookieParts(response) { return (response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']).filter(Boolean); }
function cookieHeader(parts) { return parts.map((part) => part.split(';', 1)[0]).join('; '); }
function cookieValue(parts, name) {
  const part = parts.find((value) => value.startsWith(`${name}=`)); assert.ok(part);
  return decodeURIComponent(part.split(';', 1)[0].slice(name.length + 1));
}
async function req(path, { method = 'GET', body, useAuth = true, useCsrf = true, authCookies = cookies } = {}) {
  const headers = {};
  if (useAuth && authCookies) headers.cookie = cookieHeader(authCookies);
  if (method !== 'GET') headers['content-type'] = 'application/json';
  if (useCsrf && method !== 'GET' && authCookies) headers['x-csrf-token'] = csrf;
  return fetch(`${appUrl}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

const workplace = { institutionName: 'ابتدائية الاختبار', municipality: 'وهران', institutionAddress: 'عنوان', directorPhone: '+21321234567' };
function profile(proposal) { return {
  firstName: 'أمينة', lastName: 'بن صالح', dateOfBirth: '1985-03-04', placeOfBirth: 'وهران', phone: '+213555123456',
  email: `teacher-${randomUUID()}@example.invalid`, professionalStatus: 'PERMANENT', employmentDate: '2005-09-01',
  workplace: { ...workplace, ...(proposal === undefined ? {} : { locationProposal: proposal }) },
}; }
async function publicSubmission(proposal) {
  return req(`/api/v1/public/districts/${district.id}/submissions`, { method: 'POST', useAuth: false, body: profile(proposal) });
}
async function makeAcceptedProposal(coords = { latitude: '36', longitude: '3' }, target = institution) {
  const response = await publicSubmission(coords); assert.equal(response.status, 202);
  const receipt = await response.json();
  const teacher = await db.teacher.create({ data: { districtId: district.id, name: 'A', surname: 'B', institutionId: target.id, professionalStatus: 'PERMANENT', recordStatus: 'ACTIVE' } });
  await db.teacherSubmission.update({ where: { id: receipt.data.receiptId }, data: { status: 'ACCEPTED', acceptedTeacherId: teacher.id } });
  return { id: receipt.data.receiptId, teacher };
}

before(async () => {
  baseUrl = approvedUrl();
  admin = new (await import('@prisma/client')).PrismaClient({ datasources: { db: { url: baseUrl } } });
  await admin.$connect(); await assertLiveTestDatabase(admin);
  const migrations = readdirSync(migrationDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map(({ name }) => name).sort();
  assert.equal(migrations.filter((name) => name === migrationName).length, 1);
  ownedSchema = generateTestSchema('task077');
  const scopedUrl = await createOwnedTestSchema(admin, baseUrl, ownedSchema); schemaCreated = true;
  runPrisma(['migrate', 'deploy'], scopedUrl); runPrisma(['migrate', 'status'], scopedUrl);
  db = new (await import('@prisma/client')).PrismaClient({ datasources: { db: { url: scopedUrl } } }); await db.$connect();

  upgradeSchema = generateTestSchema('task077');
  const upgradeUrl = await createOwnedTestSchema(admin, baseUrl, upgradeSchema); upgradeSchemaCreated = true;
  tempRoot = mkdtempSync(join(tmpdir(), 'task077b-upgrade-'));
  const tempMigrations = join(tempRoot, 'migrations'); mkdirSync(tempMigrations);
  cpSync(join(migrationDir, 'migration_lock.toml'), join(tempRoot, 'migration_lock.toml'));
  for (const name of migrations.filter((name) => name < migrationName)) cpSync(join(migrationDir, name), join(tempMigrations, name), { recursive: true });
  const tempSchema = join(tempRoot, 'schema.prisma'); cpSync(schemaPath, tempSchema);
  runPrisma(['migrate', 'deploy'], upgradeUrl, tempSchema);
  const oldDb = new (await import('@prisma/client')).PrismaClient({ datasources: { db: { url: upgradeUrl } } }); await oldDb.$connect();
  const oldDistrictId = randomUUID(); const oldInstitutionId = randomUUID(); const oldSubmissionId = randomUUID();
  const targetSchema = new URL(upgradeUrl).searchParams.get('schema');
  await oldDb.$executeRawUnsafe(`INSERT INTO "${targetSchema}"."District" ("id","name","createdAt","updatedAt") VALUES ('${oldDistrictId}','Legacy district',now(),now())`);
  await oldDb.$executeRawUnsafe(`INSERT INTO "${targetSchema}"."Institution" ("id","districtId","name","latitude","longitude","locationSource","createdAt","updatedAt") VALUES ('${oldInstitutionId}','${oldDistrictId}','Legacy institution',12.5,4.25,'MANUAL_INSPECTOR',now(),now())`);
  await oldDb.$executeRawUnsafe(`INSERT INTO "${targetSchema}"."TeacherSubmission" ("id","districtId","submittedProfile","status","submittedAt") VALUES ('${oldSubmissionId}','${oldDistrictId}','{"workplace":{"institutionName":"old snapshot"}}'::jsonb,'PENDING',now())`);
  await oldDb.$disconnect();
  cpSync(join(migrationDir, migrationName), join(tempMigrations, migrationName), { recursive: true });
  runPrisma(['migrate', 'deploy'], upgradeUrl, tempSchema);
  upgradeDb = new (await import('@prisma/client')).PrismaClient({ datasources: { db: { url: upgradeUrl } } }); await upgradeDb.$connect();
  const legacySubmission = await upgradeDb.teacherSubmission.findUniqueOrThrow({ where: { id: oldSubmissionId } });
  assert.equal(legacySubmission.locationProposalStatus, null); assert.equal(legacySubmission.proposedInstitutionLatitude, null);
  const legacyInstitution = await upgradeDb.institution.findUniqueOrThrow({ where: { id: oldInstitutionId } });
  assert.equal(legacyInstitution.latitude.toFixed(6), '12.500000'); assert.equal(legacyInstitution.longitude.toFixed(6), '4.250000');
  assert.equal(legacyInstitution.locationSource, 'MANUAL_INSPECTOR');
  const identity = await db.$queryRaw`SELECT current_database() AS db, current_user AS role, inet_server_addr()::text AS address, inet_server_port() AS port`;
  assert.equal(identity[0].db, 'task020_test'); assert.equal(identity[0].role, 'task020_test_user');
  assert.equal(identity[0].port, 55432); assert.match(identity[0].address, /^127\.0\.0\.1/u);

  const { hashPassword } = await import('../dist/identity/password.js');
  inspector = await db.inspector.create({ data: { email: `task077b-${randomUUID()}@example.invalid`, passwordHash: await hashPassword(password), status: 'ACTIVE' } });
  inactiveInspector = await db.inspector.create({ data: { email: `task077b-inactive-${randomUUID()}@example.invalid`, passwordHash: await hashPassword(password), status: 'INACTIVE' } });
  district = await db.district.create({ data: { name: 'TASK-077B district' } });
  otherDistrict = await db.district.create({ data: { name: 'TASK-077B other district' } });
  await db.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date('2020-01-01') } });
  otherDistrict = await db.district.create({ data: { name: 'TASK-077B other district' } });
  const otherInspector = await db.inspector.create({ data: { email: `task077b-other-${randomUUID()}@example.invalid`, passwordHash: await hashPassword(password), status: 'ACTIVE' } });
  await db.inspectorDistrictMembership.create({ data: { inspectorId: otherInspector.id, districtId: otherDistrict.id, role: 'INSPECTOR', validFrom: new Date('2020-01-01') } });
  institution = await db.institution.create({ data: { districtId: district.id, name: 'المؤسسة المعتمدة' } });
  const { createApp } = await import('../dist/app.js');
  const { registerAuthRoutes, requireAuthenticatedInspector } = await import('../dist/identity/auth-routes.js');
  const { registerTeacherSubmissionRoutes } = await import('../dist/intake/routes.js');
  const { registerInspectorSubmissionRoutes } = await import('../dist/intake/inspector-routes.js');
  const { registerSubmissionDecisionRoute } = await import('../dist/intake/decision-routes.js');
  const { registerInstitutionRoutes } = await import('../dist/institutions/routes.js');
  const { createPublicSubmissionRateLimiter } = await import('../dist/intake/rate-limit.js');
  const app = createApp((instance) => {
    registerAuthRoutes(instance, db); const requireInspector = requireAuthenticatedInspector(db);
    registerInstitutionRoutes(instance, db, requireInspector); registerTeacherSubmissionRoutes(instance, db);
    registerInspectorSubmissionRoutes(instance, db, requireInspector); registerSubmissionDecisionRoute(instance, db, requireInspector);
  }, { publicSubmissionRateLimiter: createPublicSubmissionRateLimiter({ limit: 500, resolveClientIp: (request) => request.socket.remoteAddress }) });
  server = app.listen(0, '127.0.0.1'); await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  appUrl = `http://127.0.0.1:${server.address().port}`;
  const initial = cookieParts(await req('/api/v1/auth/me', { useAuth: false }));
  const initialCsrf = cookieValue(initial, 'inspector_csrf');
  const login = await fetch(`${appUrl}/api/v1/auth/login`, { method: 'POST', headers: { cookie: cookieHeader(initial), 'x-csrf-token': initialCsrf, 'content-type': 'application/json' }, body: JSON.stringify({ email: inspector.email, password }) });
  assert.equal(login.status, 200); cookies = cookieParts(login); csrf = cookieValue(cookies, 'inspector_csrf');
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db?.$disconnect(); await upgradeDb?.$disconnect();
  if (admin && schemaCreated) await dropOwnedTestSchema(admin, baseUrl, ownedSchema);
  if (admin && upgradeSchemaCreated) await dropOwnedTestSchema(admin, baseUrl, upgradeSchema);
  await admin?.$disconnect();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('public intake persists an optional proposal privately and keeps receipt-only behavior', async () => {
  const beforeInstitution = await db.institution.count(); const beforeAudit = await db.auditLog.count();
  const response = await publicSubmission({ latitude: '0.000000', longitude: '0' });
  assert.equal(response.status, 202); const body = await response.json(); assert.deepEqual(Object.keys(body.data), ['receiptId']);
  const saved = await db.teacherSubmission.findUniqueOrThrow({ where: { id: body.data.receiptId } });
  assert.equal(saved.locationProposalStatus, 'PENDING'); assert.equal(saved.proposedInstitutionLatitude.toFixed(6), '0.000000');
  assert.equal(saved.proposedInstitutionLongitude.toFixed(6), '0.000000');
  assert.equal(saved.locationProposalInstitutionId, null); assert.equal(await db.institution.count(), beforeInstitution);
  assert.equal(await db.auditLog.count(), beforeAudit);
  const noProposal = await publicSubmission(); assert.equal(noProposal.status, 202);
  const emptyReceipt = (await noProposal.json()).data.receiptId;
  const empty = await db.teacherSubmission.findUniqueOrThrow({ where: { id: emptyReceipt } });
  assert.equal(empty.locationProposalStatus, null); assert.equal(empty.proposedInstitutionLatitude, null);
});

test('public validation rejects malformed, out-of-range and privileged proposal fields', async () => {
  const before = await db.teacherSubmission.count();
  const invalid = [
    { latitude: '91', longitude: '0' }, { latitude: '-90.000001', longitude: '0' },
    { latitude: '0', longitude: '181' }, { latitude: '0', longitude: '-180.000001' },
    { latitude: '1.1234567', longitude: '0' }, { latitude: '1e1', longitude: '0' },
    { latitude: 1, longitude: '0' }, { latitude: '0' },
    { latitude: 'NaN', longitude: '0' }, { latitude: 'Infinity', longitude: '0' },
    { latitude: '1..2', longitude: '0' }, { latitude: ' ', longitude: '0' },
    { latitude: '0', longitude: ' ' }, { latitude: '0', longitude: '0', institutionId: randomUUID() },
  ];
  for (const locationProposal of invalid) {
    const response = await publicSubmission(locationProposal); assert.equal(response.status, 400);
    const errorText = await response.text();
    for (const value of [locationProposal.latitude, locationProposal.longitude]) {
      if (typeof value === 'string' && value.length > 4) assert.equal(errorText.includes(value), false);
    }
  }
  assert.equal(await db.teacherSubmission.count(), before, 'invalid coordinates must not create a submission or persisted proposal');
  for (const locationProposal of [
    { latitude: '-90', longitude: '-180' },
    { latitude: '90.000000', longitude: '180.000000' },
  ]) {
    const response = await publicSubmission(locationProposal); assert.equal(response.status, 202);
    const receipt = await response.json();
    const saved = await db.teacherSubmission.findUniqueOrThrow({ where: { id: receipt.data.receiptId } });
    assert.equal(saved.locationProposalStatus, 'PENDING');
    assert.ok(saved.proposedInstitutionLatitude !== null && saved.proposedInstitutionLongitude !== null);
  }
  for (const [field, value] of [['locationProposalStatus', 'ACCEPTED'], ['locationProposalInstitutionId', randomUUID()], ['locationSource', 'MANUAL_INSPECTOR']]) {
    const body = profile(); body.workplace[field] = value;
    const response = await req(`/api/v1/public/districts/${district.id}/submissions`, { method: 'POST', useAuth: false, body });
    assert.equal(response.status, 400);
  }
  assert.equal(await db.teacherSubmission.count(), before + 2, 'only the two valid boundary payloads should persist');
});

test('public receipt and anonymous review boundaries expose no personal or canonical location data', async () => {
  const response = await publicSubmission({ latitude: '0', longitude: '0' });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.deepEqual(body, { data: { receiptId: body.data.receiptId } });
  const publicText = JSON.stringify(body);
  for (const value of [workplace.institutionName, workplace.institutionAddress, '+213555123456', '0.000000']) {
    assert.equal(publicText.includes(value), false);
  }
  const anonymousDetail = await req(`/api/v1/submissions/${body.data.receiptId}`, { useAuth: false });
  assert.equal(anonymousDetail.status, 401);
  const anonymousDecision = await req(`/api/v1/submissions/${body.data.receiptId}/location-proposal-decision`, {
    method: 'POST', useAuth: false, body: { action: 'REJECT' },
  });
  assert.equal(anonymousDecision.status, 401);
  const missingCsrf = await req(`/api/v1/submissions/${body.data.receiptId}/location-proposal-decision`, {
    method: 'POST', useCsrf: false, body: { action: 'REJECT' },
  });
  assert.equal(missingCsrf.status, 403);
});

test('0,0 is a valid first canonical pair and remains available to the Inspector read model', async () => {
  const target = await db.institution.create({ data: { districtId: district.id, name: 'Zero zero target' } });
  const proposal = await makeAcceptedProposal({ latitude: '0', longitude: '0' }, target);
  assert.equal((await db.institution.findUniqueOrThrow({ where: { id: target.id } })).latitude, null);
  const response = await req(`/api/v1/submissions/${proposal.id}/location-proposal-decision`, {
    method: 'POST', body: { action: 'ACCEPT_PROPOSED', expectedCanonicalLocation: null },
  });
  assert.equal(response.status, 200);
  const canonical = await db.institution.findUniqueOrThrow({ where: { id: target.id } });
  assert.equal(canonical.latitude.toFixed(6), '0.000000');
  assert.equal(canonical.longitude.toFixed(6), '0.000000');
  assert.equal(canonical.locationSource, 'TEACHER_PROPOSED_APPROVED');
  const detail = (await (await req(`/api/v1/submissions/${proposal.id}`)).json()).data.locationProposal;
  assert.equal(detail.status, 'ACCEPTED');
  assert.deepEqual(detail.institution.location, { latitude: '0.000000', longitude: '0.000000', source: 'TEACHER_PROPOSED_APPROVED' });
});

test('submission decisions do not decide locations and unresolved/rejected submissions cannot accept proposals', async () => {
  const countBefore = await db.institution.count();
  const pendingResponse = await publicSubmission({ latitude: '12.25', longitude: '4.5' });
  const pendingId = (await pendingResponse.json()).data.receiptId;
  assert.equal(await db.institution.count(), countBefore, 'coordinates must not create or choose an Institution');
  const acceptedSubmission = await req(`/api/v1/submissions/${pendingId}/decision`, {
    method: 'POST', body: { action: 'ACCEPT', expectedStatus: 'PENDING' },
  });
  assert.equal(acceptedSubmission.status, 200);
  const acceptedRow = await db.teacherSubmission.findUniqueOrThrow({ where: { id: pendingId } });
  assert.equal(acceptedRow.locationProposalStatus, 'PENDING', 'submission acceptance must not accept its location proposal');
  const unresolvedTeacher = await db.teacher.findUniqueOrThrow({ where: { id: acceptedRow.acceptedTeacherId } });
  assert.equal(unresolvedTeacher.institutionId, null, 'acceptance must not infer or link an Institution from coordinates');
  const unresolvedAccept = await req(`/api/v1/submissions/${pendingId}/location-proposal-decision`, {
    method: 'POST', body: { action: 'ACCEPT_PROPOSED', expectedCanonicalLocation: null },
  });
  assert.equal(unresolvedAccept.status, 409);

  const rejectedSubmissionResponse = await publicSubmission({ latitude: '13', longitude: '5' });
  const rejectedId = (await rejectedSubmissionResponse.json()).data.receiptId;
  const rejected = await req(`/api/v1/submissions/${rejectedId}/decision`, {
    method: 'POST', body: { action: 'REJECT', expectedStatus: 'PENDING' },
  });
  assert.equal(rejected.status, 200);
  const rejectedAccept = await req(`/api/v1/submissions/${rejectedId}/location-proposal-decision`, {
    method: 'POST', body: { action: 'ACCEPT_PROPOSED', expectedCanonicalLocation: null },
  });
  assert.equal(rejectedAccept.status, 409);
  assert.equal((await db.teacherSubmission.findUniqueOrThrow({ where: { id: rejectedId } })).locationProposalStatus, 'PENDING');
});

test('Inspector detail scopes proposal and reports absence as null', async () => {
  const created = await publicSubmission({ latitude: '90', longitude: '-180' }); const id = (await created.json()).data.receiptId;
  const detail = await req(`/api/v1/submissions/${id}`); assert.equal(detail.status, 200);
  const proposal = (await detail.json()).data.locationProposal;
  assert.equal(proposal.status, 'PENDING'); assert.equal(proposal.latitude, '90.000000'); assert.equal(proposal.longitude, '-180.000000');
  const none = await publicSubmission(); const noneId = (await none.json()).data.receiptId;
  assert.equal((await (await req(`/api/v1/submissions/${noneId}`)).json()).data.locationProposal, null);
  assert.equal((await req(`/api/v1/submissions/${randomUUID()}/location-proposal-decision`, { method: 'POST', body: { action: 'REJECT' } })).status, 404);
  const outside = await req(`/api/v1/public/districts/${otherDistrict.id}/submissions`, { method: 'POST', useAuth: false, body: profile({ latitude: '1', longitude: '2' }) });
  const outsideId = (await outside.json()).data.receiptId;
  const outsideInstitution = await db.institution.create({ data: {
    districtId: otherDistrict.id, name: 'Cross district private location', latitude: '67.890123', longitude: '12.345678', locationSource: 'MANUAL_INSPECTOR',
  } });
  const outsideTeacher = await db.teacher.create({ data: {
    districtId: otherDistrict.id, institutionId: outsideInstitution.id, name: 'A', surname: 'B', professionalStatus: 'PERMANENT', recordStatus: 'ACTIVE',
  } });
  await db.teacherSubmission.update({ where: { id: outsideId }, data: { status: 'ACCEPTED', acceptedTeacherId: outsideTeacher.id } });
  const concealedDetail = await req(`/api/v1/submissions/${outsideId}`);
  assert.equal(concealedDetail.status, 404);
  const concealedBody = await concealedDetail.text();
  assert.doesNotMatch(concealedBody, /67\.890123|12\.345678|Cross district private location|locationSource/u);
  assert.equal((await req(`/api/v1/submissions/${outsideId}/location-proposal-decision`, {
    method: 'POST', body: { action: 'REJECT' },
  })).status, 404);
  const initial = cookieParts(await req('/api/v1/auth/me', { useAuth: false }));
  const login = await fetch(`${appUrl}/api/v1/auth/login`, { method: 'POST', headers: {
    cookie: cookieHeader(initial), 'x-csrf-token': cookieValue(initial, 'inspector_csrf'), 'content-type': 'application/json',
  }, body: JSON.stringify({ email: inactiveInspector.email, password }) });
  assert.equal(login.status, 401);
});

test('Inspector detail returns the linked canonical Institution location independently of the proposal', async () => {
  const target = await db.institution.create({ data: {
    districtId: district.id, name: 'Canonical detail target',
    latitude: '35.125', longitude: '2.5', locationSource: 'MANUAL_INSPECTOR',
  } });
  const proposed = await makeAcceptedProposal({ latitude: '36.5', longitude: '3.25' }, target);
  const auditCountBeforeRead = await db.auditLog.count();
  let detailResponse = await req(`/api/v1/submissions/${proposed.id}`);
  assert.equal(detailResponse.status, 200);
  let detail = (await detailResponse.json()).data.locationProposal;
  assert.deepEqual(detail.institution, {
    id: target.id, name: target.name, municipality: target.municipality,
    location: { latitude: '35.125000', longitude: '2.500000', source: 'MANUAL_INSPECTOR' },
  });
  assert.deepEqual({ latitude: detail.latitude, longitude: detail.longitude }, { latitude: '36.500000', longitude: '3.250000' });
  assert.equal(detail.status, 'PENDING');
  assert.equal(await db.auditLog.count(), auditCountBeforeRead, 'viewing canonical/proposed locations must not create an audit event');

  await db.institution.update({ where: { id: target.id }, data: {
    latitude: '47.75', longitude: '-11.125', locationSource: 'TEACHER_PROPOSED_APPROVED',
  } });
  detailResponse = await req(`/api/v1/submissions/${proposed.id}`);
  detail = (await detailResponse.json()).data.locationProposal;
  assert.deepEqual(detail.institution.location, {
    latitude: '47.750000', longitude: '-11.125000', source: 'TEACHER_PROPOSED_APPROVED',
  });
  assert.deepEqual({ latitude: detail.latitude, longitude: detail.longitude }, { latitude: '36.500000', longitude: '3.250000' });

  const same = await makeAcceptedProposal({ latitude: '47.75', longitude: '-11.125' }, target);
  detailResponse = await req(`/api/v1/submissions/${same.id}`);
  detail = (await detailResponse.json()).data.locationProposal;
  assert.deepEqual(detail.institution.location, {
    latitude: '47.750000', longitude: '-11.125000', source: 'TEACHER_PROPOSED_APPROVED',
  });
  assert.equal(detail.status, 'PENDING', 'matching coordinates do not imply a decision');

  const accepted = await req(`/api/v1/submissions/${same.id}/location-proposal-decision`, { method: 'POST', body: {
    action: 'ACCEPT_PROPOSED', expectedCanonicalLocation: { latitude: '47.75', longitude: '-11.125', source: 'TEACHER_PROPOSED_APPROVED' },
  } });
  assert.equal(accepted.status, 200);
  const laterInstitution = await db.institution.create({ data: { districtId: district.id, name: 'Later Teacher Institution' } });
  await db.teacher.update({ where: { id: same.teacher.id }, data: { institutionId: laterInstitution.id } });
  detailResponse = await req(`/api/v1/submissions/${same.id}`);
  detail = (await detailResponse.json()).data.locationProposal;
  assert.equal(detail.institution.id, target.id, 'recorded decision target remains authoritative after Teacher relinking');
  assert.deepEqual(detail.institution.location, {
    latitude: '47.750000', longitude: '-11.125000', source: 'TEACHER_PROPOSED_APPROVED',
  });
});

test('Inspector detail returns a null canonical location and does not infer an unresolved Institution', async () => {
  const noLocation = await db.institution.create({ data: { districtId: district.id, name: 'No canonical location' } });
  const unresolved = await makeAcceptedProposal({ latitude: '1', longitude: '2' }, noLocation);
  const unresolvedDetail = (await (await req(`/api/v1/submissions/${unresolved.id}`)).json()).data.locationProposal;
  assert.deepEqual(unresolvedDetail.institution.location, null);

  const withoutResolvedInstitution = await publicSubmission({ latitude: '3', longitude: '4' });
  const withoutResolvedId = (await withoutResolvedInstitution.json()).data.receiptId;
  const noInstitutionDetail = (await (await req(`/api/v1/submissions/${withoutResolvedId}`)).json()).data.locationProposal;
  assert.equal(noInstitutionDetail.institution, null);
});

test('ACCEPT sets canonical location, preserves the proposal and writes coordinate-free atomic audits', async () => {
  const proposal = await makeAcceptedProposal({ latitude: '36.5', longitude: '3.25' });
  const response = await req(`/api/v1/submissions/${proposal.id}/location-proposal-decision`, {
    method: 'POST', body: { action: 'ACCEPT_PROPOSED', expectedCanonicalLocation: null },
  });
  assert.equal(response.status, 200);
  const row = await db.teacherSubmission.findUniqueOrThrow({ where: { id: proposal.id } });
  assert.equal(row.locationProposalStatus, 'ACCEPTED'); assert.equal(row.locationProposalInstitutionId, institution.id);
  assert.equal(row.proposedInstitutionLatitude.toFixed(6), '36.500000');
  const canonical = await db.institution.findUniqueOrThrow({ where: { id: institution.id } });
  assert.equal(canonical.latitude.toFixed(6), '36.500000'); assert.equal(canonical.locationSource, 'TEACHER_PROPOSED_APPROVED');
  const audits = await db.auditLog.findMany({ where: { entityId: { in: [proposal.id, institution.id] }, action: { in: ['INSTITUTION_LOCATION_PROPOSAL_ACCEPTED', 'INSTITUTION_UPDATED'] } } });
  assert.equal(audits.length, 2); assert.ok(audits.every((event) => !JSON.stringify(event.metadata).includes('36.5')));
});

test('an audit append failure rolls back proposal and canonical Institution mutations atomically', async () => {
  await db.institution.update({ where: { id: institution.id }, data: { latitude: '21', longitude: '8', locationSource: 'MANUAL_INSPECTOR' } });
  const proposal = await makeAcceptedProposal({ latitude: '22.123456', longitude: '9.123456' });
  const before = await db.institution.findUniqueOrThrow({ where: { id: institution.id } });
  await db.$executeRawUnsafe(`CREATE FUNCTION "${ownedSchema}"."task077_fail_audit"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action" = 'INSTITUTION_UPDATED' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END; $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER "task077_fail_audit" BEFORE INSERT ON "${ownedSchema}"."AuditLog" FOR EACH ROW EXECUTE FUNCTION "${ownedSchema}"."task077_fail_audit"()`);
  try {
    const response = await req(`/api/v1/submissions/${proposal.id}/location-proposal-decision`, { method: 'POST', body: {
      action: 'ACCEPT_PROPOSED', expectedCanonicalLocation: { latitude: '21', longitude: '8', source: 'MANUAL_INSPECTOR' },
    } });
    assert.equal(response.status, 500);
    const errorBody = await response.text();
    assert.doesNotMatch(errorBody, /synthetic audit failure|22\.123456|9\.123456|stack|AuditLog/u);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "task077_fail_audit" ON "${ownedSchema}"."AuditLog"`);
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${ownedSchema}"."task077_fail_audit"()`);
  }
  const unchanged = await db.institution.findUniqueOrThrow({ where: { id: institution.id } });
  assert.equal(unchanged.latitude.toFixed(6), before.latitude.toFixed(6));
  assert.equal(unchanged.longitude.toFixed(6), before.longitude.toFixed(6));
  assert.equal(unchanged.locationSource, before.locationSource);
  assert.equal((await db.teacherSubmission.findUniqueOrThrow({ where: { id: proposal.id } })).locationProposalStatus, 'PENDING');
  assert.equal(await db.auditLog.count({ where: { entityId: proposal.id, action: 'INSTITUTION_LOCATION_PROPOSAL_ACCEPTED' } }), 0);
});

test('explicit replace is stale-safe; equal-coordinate accept records the proposal without fake Institution update', async () => {
  await db.institution.update({ where: { id: institution.id }, data: { latitude: '40', longitude: '4', locationSource: 'MANUAL_INSPECTOR' } });
  const stale = await makeAcceptedProposal({ latitude: '41', longitude: '5' });
  const changed = await db.institution.update({ where: { id: institution.id }, data: { latitude: '42', longitude: '6' } });
  const staleResponse = await req(`/api/v1/submissions/${stale.id}/location-proposal-decision`, { method: 'POST', body: {
    action: 'ACCEPT_PROPOSED', expectedCanonicalLocation: { latitude: '40', longitude: '4', source: 'MANUAL_INSPECTOR' },
  } });
  assert.equal(staleResponse.status, 409);
  assert.equal((await db.teacherSubmission.findUniqueOrThrow({ where: { id: stale.id } })).locationProposalStatus, 'PENDING');
  assert.equal((await db.institution.findUniqueOrThrow({ where: { id: institution.id } })).latitude.toFixed(6), changed.latitude.toFixed(6));

  const same = await makeAcceptedProposal({ latitude: '42', longitude: '6' });
  const before = await db.auditLog.count({ where: { entityId: institution.id, action: 'INSTITUTION_UPDATED' } });
  const response = await req(`/api/v1/submissions/${same.id}/location-proposal-decision`, { method: 'POST', body: {
    action: 'ACCEPT_PROPOSED', expectedCanonicalLocation: { latitude: '42', longitude: '6', source: 'MANUAL_INSPECTOR' },
  } });
  assert.equal(response.status, 200);
  assert.equal(await db.auditLog.count({ where: { entityId: institution.id, action: 'INSTITUTION_UPDATED' } }), before + 1);
  // The canonical provenance changes from MANUAL_INSPECTOR to TEACHER_PROPOSED_APPROVED even when coordinates match.
});

test('REJECT and KEEP_CURRENT affect only one proposal; repeated or racing decisions have one winner', async () => {
  await db.institution.update({ where: { id: institution.id }, data: { latitude: '42', longitude: '6', locationSource: 'MANUAL_INSPECTOR' } });
  const keep = await makeAcceptedProposal({ latitude: '43', longitude: '7' });
  const other = await makeAcceptedProposal({ latitude: '44', longitude: '8' });
  const before = await db.institution.findUniqueOrThrow({ where: { id: institution.id } });
  const keepResponse = await req(`/api/v1/submissions/${keep.id}/location-proposal-decision`, { method: 'POST', body: {
    action: 'KEEP_CURRENT', expectedCanonicalLocation: { latitude: '42', longitude: '6', source: 'MANUAL_INSPECTOR' },
  } }); assert.equal(keepResponse.status, 200);
  const kept = await db.teacherSubmission.findUniqueOrThrow({ where: { id: keep.id } });
  assert.equal(kept.locationProposalStatus, 'REJECTED'); assert.equal(kept.locationProposalDecisionReason, 'KEEP_CURRENT');
  assert.equal((await db.teacherSubmission.findUniqueOrThrow({ where: { id: other.id } })).locationProposalStatus, 'PENDING');
  const after = await db.institution.findUniqueOrThrow({ where: { id: institution.id } }); assert.equal(after.latitude.toFixed(6), before.latitude.toFixed(6));

  const ordinaryReject = await makeAcceptedProposal({ latitude: '43.5', longitude: '7.5' });
  const rejectCanonicalBefore = await db.institution.findUniqueOrThrow({ where: { id: institution.id } });
  const rejectAuditBefore = await db.auditLog.count({ where: { entityId: institution.id, action: 'INSTITUTION_UPDATED' } });
  const rejected = await req(`/api/v1/submissions/${ordinaryReject.id}/location-proposal-decision`, { method: 'POST', body: { action: 'REJECT' } });
  assert.equal(rejected.status, 200);
  const rejectCanonicalAfter = await db.institution.findUniqueOrThrow({ where: { id: institution.id } });
  assert.equal(rejectCanonicalAfter.latitude.toFixed(6), rejectCanonicalBefore.latitude.toFixed(6));
  assert.equal(rejectCanonicalAfter.longitude.toFixed(6), rejectCanonicalBefore.longitude.toFixed(6));
  assert.equal(rejectCanonicalAfter.locationSource, rejectCanonicalBefore.locationSource);
  assert.equal(await db.auditLog.count({ where: { entityId: institution.id, action: 'INSTITUTION_UPDATED' } }), rejectAuditBefore);
  assert.equal((await db.teacherSubmission.findUniqueOrThrow({ where: { id: ordinaryReject.id } })).locationProposalStatus, 'REJECTED');

  const race = await makeAcceptedProposal({ latitude: '45', longitude: '9' });
  const decisions = await Promise.all(['REJECT', 'REJECT'].map(() => req(`/api/v1/submissions/${race.id}/location-proposal-decision`, { method: 'POST', body: { action: 'REJECT' } })));
  assert.deepEqual(decisions.map(({ status }) => status).sort(), [200, 409]);
  assert.equal(await db.auditLog.count({ where: { entityId: race.id, action: 'INSTITUTION_LOCATION_PROPOSAL_REJECTED' } }), 1);

  const acceptedRace = await makeAcceptedProposal({ latitude: '46', longitude: '10' });
  const acceptVsReject = await Promise.all([
    req(`/api/v1/submissions/${acceptedRace.id}/location-proposal-decision`, { method: 'POST', body: { action: 'ACCEPT_PROPOSED', expectedCanonicalLocation: { latitude: '42', longitude: '6', source: 'MANUAL_INSPECTOR' } } }),
    req(`/api/v1/submissions/${acceptedRace.id}/location-proposal-decision`, { method: 'POST', body: { action: 'REJECT' } }),
  ]);
  assert.deepEqual(acceptVsReject.map(({ status }) => status).sort(), [200, 409]);
  assert.equal(await db.auditLog.count({ where: { entityId: acceptedRace.id, action: { in: ['INSTITUTION_LOCATION_PROPOSAL_ACCEPTED', 'INSTITUTION_LOCATION_PROPOSAL_REJECTED'] } } }), 1);
  const raceState = await db.teacherSubmission.findUniqueOrThrow({ where: { id: acceptedRace.id } });
  const raceInstitution = await db.institution.findUniqueOrThrow({ where: { id: institution.id } });
  if (raceState.locationProposalStatus === 'ACCEPTED') {
    assert.equal(raceState.locationProposalInstitutionId, institution.id);
    assert.equal(raceInstitution.latitude.toFixed(6), '46.000000');
    assert.equal(raceInstitution.longitude.toFixed(6), '10.000000');
    assert.equal(raceInstitution.locationSource, 'TEACHER_PROPOSED_APPROVED');
  } else {
    assert.equal(raceState.locationProposalStatus, 'REJECTED');
    assert.equal(raceInstitution.latitude.toFixed(6), '42.000000');
    assert.equal(raceInstitution.longitude.toFixed(6), '6.000000');
    assert.equal(raceInstitution.locationSource, 'MANUAL_INSPECTOR');
  }
});

test('matching accepted canonical coordinates and source finalize provenance without a fake Institution audit', async () => {
  await db.institution.update({ where: { id: institution.id }, data: { latitude: '47', longitude: '11', locationSource: 'TEACHER_PROPOSED_APPROVED' } });
  const target = await makeAcceptedProposal({ latitude: '47', longitude: '11' });
  const before = await db.auditLog.count({ where: { entityId: institution.id, action: 'INSTITUTION_UPDATED' } });
  const response = await req(`/api/v1/submissions/${target.id}/location-proposal-decision`, { method: 'POST', body: {
    action: 'ACCEPT_PROPOSED', expectedCanonicalLocation: { latitude: '47', longitude: '11', source: 'TEACHER_PROPOSED_APPROVED' },
  } });
  assert.equal(response.status, 200);
  assert.equal((await db.teacherSubmission.findUniqueOrThrow({ where: { id: target.id } })).locationProposalStatus, 'ACCEPTED');
  assert.equal(await db.auditLog.count({ where: { entityId: institution.id, action: 'INSTITUTION_UPDATED' } }), before);
});

test('database CHECKs reject invalid pairs, bounds and decision combinations; sources are restricted', async () => {
  const { Prisma } = await import('@prisma/client');
  const raw = (fields) => {
    const values = Object.entries(fields).map(([field, value]) => {
      const cast = /Latitude|Longitude/u.test(field) ? '::numeric' : /Id$/u.test(field) ? '::uuid' : /At$/u.test(field) ? '::timestamp' : '';
      return Prisma.sql`${value}${Prisma.raw(cast)}`;
    });
    return db.$executeRaw`INSERT INTO "TeacherSubmission" ("id","districtId","submittedProfile","status","submittedAt",${Prisma.raw(Object.keys(fields).map((key) => `"${key}"`).join(','))}) VALUES (${randomUUID()}::uuid,${district.id}::uuid,'{}'::jsonb,'PENDING',now(),${Prisma.join(values)})`;
  };
  // Check persisted invariants through direct SQL; API validation is not the database boundary.
  const oldRow = randomUUID();
  await db.$executeRaw`INSERT INTO "TeacherSubmission" ("id","districtId","submittedProfile","status","submittedAt") VALUES (${oldRow}::uuid,${district.id}::uuid,'{}'::jsonb,'PENDING',now())`;
  assert.equal((await db.teacherSubmission.findUniqueOrThrow({ where: { id: oldRow } })).locationProposalStatus, null);
  await raw({ proposedInstitutionLatitude: '1', proposedInstitutionLongitude: '2', locationProposalStatus: 'PENDING' });
  await assert.rejects(raw({ proposedInstitutionLatitude: '1' }));
  await assert.rejects(raw({ proposedInstitutionLatitude: '-90.000001', proposedInstitutionLongitude: '0', locationProposalStatus: 'PENDING' }));
  await assert.rejects(raw({ proposedInstitutionLatitude: '90.000001', proposedInstitutionLongitude: '0', locationProposalStatus: 'PENDING' }));
  await assert.rejects(raw({ proposedInstitutionLatitude: '0', proposedInstitutionLongitude: '-180.000001', locationProposalStatus: 'PENDING' }));
  await assert.rejects(raw({ proposedInstitutionLatitude: '0', proposedInstitutionLongitude: '180.000001', locationProposalStatus: 'PENDING' }));
  await assert.rejects(raw({ proposedInstitutionLatitude: '1', proposedInstitutionLongitude: '2', locationProposalStatus: 'BOGUS' }));
  await assert.rejects(raw({ proposedInstitutionLatitude: '1', proposedInstitutionLongitude: '2', locationProposalStatus: 'PENDING', locationProposalDecidedAt: new Date() }));
  await assert.rejects(raw({ proposedInstitutionLatitude: '1', proposedInstitutionLongitude: '2', locationProposalStatus: 'ACCEPTED' }));
  await assert.rejects(raw({ proposedInstitutionLatitude: '1', proposedInstitutionLongitude: '2', locationProposalStatus: 'REJECTED' }));
  await assert.rejects(db.institution.update({ where: { id: institution.id }, data: { locationSource: 'UNTRUSTED' } }));
  const manual = await db.institution.create({ data: { districtId: district.id, name: 'manual source', latitude: '1', longitude: '2', locationSource: 'MANUAL_INSPECTOR' } });
  assert.equal(manual.locationSource, 'MANUAL_INSPECTOR');
});
