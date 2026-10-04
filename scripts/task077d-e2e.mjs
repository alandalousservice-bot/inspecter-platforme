import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { assertLiveTestDatabase, createOwnedTestSchema, dropOwnedTestSchema, generateTestSchema } from './test-schema-safety.mjs';

const root = process.cwd();
const credentialText = readFileSync('D:\\pg-task020-temp\\task020-test-url.secret', 'utf8').trim();
const rawUrl = credentialText.match(/^(?:TEST_DATABASE_URL|DATABASE_URL)=(.*)$/u)?.[1]?.trim() ?? credentialText;
const parsed = new URL(rawUrl);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.hostname !== '127.0.0.1' || parsed.port !== '55432'
  || decodeURIComponent(parsed.username) !== 'task020_test_user' || parsed.pathname !== '/task020_test') throw new Error('Refusing an unapproved TASK-077D test database.');

const apiRequire = createRequire(resolve(root, 'packages/api/package.json'));
const prismaPackagePath = apiRequire.resolve('prisma/package.json');
const prismaPath = resolve(dirname(prismaPackagePath), JSON.parse(readFileSync(prismaPackagePath, 'utf8')).bin.prisma);
const { PrismaClient } = apiRequire('@prisma/client');
const schema = generateTestSchema('task077_e2e');
let admin; let schemaCreated = false; let exitCode = 1; let databaseUrl;
const environmentNames = [
  'G3_E2E_DATABASE_URL', 'TASK077D_E2E', 'TASK077D_E2E_EMAIL', 'TASK077D_E2E_PASSWORD',
  'TASK077D_E2E_SUBMISSION_ID', 'TASK077D_E2E_INSTITUTION_ID', 'TASK077F_ZERO_SUBMISSION_ID',
  'TASK077F_ZERO_INSTITUTION_ID', 'TASK077F_STALE_SUBMISSION_ID', 'TASK077F_STALE_INSTITUTION_ID',
  'TASK077F_NO_PROPOSAL_SUBMISSION_ID', 'TASK077F_DISTRICT_ID', 'TASK077F_PUBLIC_EMAIL',
];
function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw new Error('Could not start TASK-077D verification.');
  return result.status ?? 1;
}

try {
  if (!process.env.npm_execpath || run([process.env.npm_execpath, 'run', 'build']) !== 0) throw new Error('Repository build failed before TASK-077D E2E.');
  admin = new PrismaClient({ datasources: { db: { url: rawUrl } } });
  await admin.$connect();
  const identity = await admin.$queryRaw`SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port`;
  if (identity[0]?.database !== 'task020_test' || identity[0]?.role !== 'task020_test_user' || !/^127\.0\.0\.1(?:\/\d+)?$/u.test(identity[0]?.address ?? '') || identity[0]?.port !== 55432) throw new Error('Isolated DB identity mismatch.');
  databaseUrl = await createOwnedTestSchema(admin, rawUrl, schema); schemaCreated = true;
  const migration = spawnSync(process.execPath, [prismaPath, 'migrate', 'deploy', '--schema', resolve(root, 'packages/api/prisma/schema.prisma')], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit', windowsHide: true,
  });
  if (migration.error || migration.status !== 0) throw new Error('TASK-077D isolated migration failed.');

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const tag = randomBytes(5).toString('hex');
  const password = `task077d-${randomUUID()}-synthetic`;
  try {
    const district = await db.district.create({ data: { name: `مقاطعة اختبار ${tag}` } });
    const { hashPassword } = await import('../packages/api/dist/identity/password.js');
    const inspector = await db.inspector.create({ data: { email: `task077d-${tag}@example.invalid`, passwordHash: await hashPassword(password), status: 'ACTIVE', name: 'مفتش', surname: 'اختبار' } });
    await db.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date('2020-01-01T00:00:00.000Z') } });
    const institution = await db.institution.create({ data: { districtId: district.id, name: `مؤسسة اختبار ${tag}`, municipality: 'وهران', latitude: '35.123456', longitude: '-0.123456', locationSource: 'MANUAL_INSPECTOR' } });
    const teacher = await db.teacher.create({ data: { districtId: district.id, institutionId: institution.id, name: 'معلمة', surname: `اختبار ${tag}`, professionalStatus: 'PERMANENT', recordStatus: 'ACTIVE' } });
    const submission = await db.teacherSubmission.create({ data: {
      districtId: district.id,
      status: 'ACCEPTED',
      acceptedTeacherId: teacher.id,
      submittedProfile: {
        firstName: 'معلمة', lastName: `اختبار ${tag}`, dateOfBirth: '1985-03-04', placeOfBirth: 'وهران', phone: '05550000001',
        email: `teacher-${tag}@example.invalid`, professionalStatus: 'PERMANENT', employmentDate: '2005-09-01',
        workplace: { institutionName: institution.name, municipality: 'وهران', institutionAddress: 'عنوان اختبار', directorPhone: '021234567' },
      },
      proposedInstitutionLatitude: '35.654321', proposedInstitutionLongitude: '-0.654321', locationProposalStatus: 'PENDING',
    } });
    const acceptedProfile = (suffix) => ({
      firstName: 'معلمة', lastName: `اختبار ${tag} ${suffix}`, dateOfBirth: '1985-03-04', placeOfBirth: 'وهران', phone: '05550000001',
      email: `teacher-${tag}-${suffix}@example.invalid`, professionalStatus: 'PERMANENT', employmentDate: '2005-09-01',
      workplace: { institutionName: `مؤسسة اختبار ${suffix}`, municipality: 'وهران', institutionAddress: 'عنوان اختبار', directorPhone: '021234567' },
    });
    const zeroInstitution = await db.institution.create({ data: { districtId: district.id, name: `مؤسسة الصفر ${tag}` } });
    const zeroTeacher = await db.teacher.create({ data: { districtId: district.id, institutionId: zeroInstitution.id, name: 'معلمة', surname: `صفر ${tag}`, professionalStatus: 'PERMANENT', recordStatus: 'ACTIVE' } });
    const zeroSubmission = await db.teacherSubmission.create({ data: {
      districtId: district.id, status: 'ACCEPTED', acceptedTeacherId: zeroTeacher.id, submittedProfile: acceptedProfile('zero'),
      proposedInstitutionLatitude: '0', proposedInstitutionLongitude: '0', locationProposalStatus: 'PENDING',
    } });
    const staleInstitution = await db.institution.create({ data: {
      districtId: district.id, name: `مؤسسة stale ${tag}`, latitude: '11', longitude: '22', locationSource: 'MANUAL_INSPECTOR',
    } });
    const staleTeacher = await db.teacher.create({ data: { districtId: district.id, institutionId: staleInstitution.id, name: 'معلمة', surname: `قديم ${tag}`, professionalStatus: 'PERMANENT', recordStatus: 'ACTIVE' } });
    const staleSubmission = await db.teacherSubmission.create({ data: {
      districtId: district.id, status: 'ACCEPTED', acceptedTeacherId: staleTeacher.id, submittedProfile: acceptedProfile('stale'),
      proposedInstitutionLatitude: '33', proposedInstitutionLongitude: '44', locationProposalStatus: 'PENDING',
    } });
    const noProposalInstitution = await db.institution.create({ data: { districtId: district.id, name: `مؤسسة بلا مقترح ${tag}` } });
    const noProposalTeacher = await db.teacher.create({ data: { districtId: district.id, institutionId: noProposalInstitution.id, name: 'معلمة', surname: `بدون ${tag}`, professionalStatus: 'PERMANENT', recordStatus: 'ACTIVE' } });
    const noProposalSubmission = await db.teacherSubmission.create({ data: {
      districtId: district.id, status: 'ACCEPTED', acceptedTeacherId: noProposalTeacher.id, submittedProfile: acceptedProfile('none'),
    } });
    process.env.G3_E2E_DATABASE_URL = databaseUrl;
    process.env.TASK077D_E2E = '1';
    process.env.TASK077D_E2E_EMAIL = inspector.email;
    process.env.TASK077D_E2E_PASSWORD = password;
    process.env.TASK077D_E2E_SUBMISSION_ID = submission.id;
    process.env.TASK077D_E2E_INSTITUTION_ID = institution.id;
    process.env.TASK077F_ZERO_SUBMISSION_ID = zeroSubmission.id;
    process.env.TASK077F_ZERO_INSTITUTION_ID = zeroInstitution.id;
    process.env.TASK077F_STALE_SUBMISSION_ID = staleSubmission.id;
    process.env.TASK077F_STALE_INSTITUTION_ID = staleInstitution.id;
    process.env.TASK077F_NO_PROPOSAL_SUBMISSION_ID = noProposalSubmission.id;
    process.env.TASK077F_DISTRICT_ID = district.id;
    process.env.TASK077F_PUBLIC_EMAIL = `task077f-public-${tag}@example.invalid`;
    exitCode = run([resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.config.ts']);
  } finally { await db.$disconnect(); }
} finally {
  for (const name of environmentNames) delete process.env[name];
  if (admin && schemaCreated) await dropOwnedTestSchema(admin, rawUrl, schema);
  await admin?.$disconnect();
}
process.exitCode = exitCode;
