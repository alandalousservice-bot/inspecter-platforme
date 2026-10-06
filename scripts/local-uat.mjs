import { spawnSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

export const UAT_DATABASE = Object.freeze({ host: '127.0.0.1', port: 55432, database: 'task020_test', user: 'task020_test_user' });
export const UAT_INSPECTOR = Object.freeze({ id: '84000000-0000-4000-8000-000000000001', email: 'local-uat-inspector@example.invalid' });
const root = process.cwd();
const secretPath = 'D:\\pg-task020-temp\\task020-test-url.secret';
const uatIds = (n) => `84000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function parseApprovedUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid database URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || url.hostname !== UAT_DATABASE.host || url.port !== String(UAT_DATABASE.port)
    || decodeURIComponent(url.username) !== UAT_DATABASE.user
    || url.pathname !== `/${UAT_DATABASE.database}`) throw new Error('Refusing a database target outside approved local UAT.');
  if (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public') throw new Error('Local UAT uses public schema only.');
  url.searchParams.set('schema', 'public');
  return url.toString();
}

function getUrl() {
  const text = readFileSync(secretPath, 'utf8').trim();
  const assigned = text.match(/^(?:TEST_DATABASE_URL|DATABASE_URL)=(.*)$/u)?.[1]?.trim();
  return parseApprovedUrl(assigned ?? text);
}

function getPrisma() {
  const require = createRequire(resolve(root, 'packages/api/package.json'));
  return { require, PrismaClient: require('@prisma/client').PrismaClient };
}

export async function assertTarget(db) {
  const rows = await db.$queryRawUnsafe('SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address,inet_server_port() AS port');
  const target = rows[0];
  if (target?.database !== UAT_DATABASE.database || target?.role !== UAT_DATABASE.user
    || !/^127\.0\.0\.1(?:\/\d+)?$/u.test(target?.address ?? '') || target?.port !== UAT_DATABASE.port) {
    throw new Error('Live PostgreSQL identity guard failed.');
  }
  return target;
}

function prismaCli(require) {
  const packagePath = require.resolve('prisma/package.json');
  return resolve(dirname(packagePath), JSON.parse(readFileSync(packagePath, 'utf8')).bin.prisma);
}

async function init() {
  const url = getUrl();
  const { require, PrismaClient } = getPrisma();
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await db.$connect();
    const target = await assertTarget(db);
    const tables = await db.$queryRawUnsafe("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename !~ '^pg_'");
    const hasMigrations = tables.some((row) => row.tablename === '_prisma_migrations');
    if (tables.length && !hasMigrations) throw new Error('Non-Prisma public objects found; refusing migration deployment.');
    const result = spawnSync(process.execPath, [prismaCli(require), 'migrate', 'deploy', '--schema', resolve(root, 'packages/api/prisma/schema.prisma')], {
      cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit', windowsHide: true,
    });
    if (result.error || result.status !== 0) throw new Error('Committed migration deployment failed.');
    await assertTarget(db);
    const migrations = await db.$queryRawUnsafe('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    const expected = (await import('node:fs')).readdirSync(resolve(root, 'packages/api/prisma/migrations'), { withFileTypes: true }).filter((item) => item.isDirectory()).length;
    if (migrations[0]?.count !== expected) throw new Error('Applied migration count does not match repository history.');
    console.log(`Local UAT schema ready; committed migrations applied: ${expected}; database ${target.database}@${target.address}:${target.port}.`);
  } finally { await db.$disconnect(); }
}

async function seed() {
  const password = process.env.LOCAL_UAT_INSPECTOR_PASSWORD;
  if (!password || password.length < 20) throw new Error('Set LOCAL_UAT_INSPECTOR_PASSWORD from the documented local secret file.');
  const url = getUrl();
  const { PrismaClient } = getPrisma();
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await db.$connect();
    await assertTarget(db);
    const migrationRows = await db.$queryRawUnsafe('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    const expectedMigrations = readdirSync(resolve(root, 'packages/api/prisma/migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^\d{14}_/u.test(entry.name)).length;
    if (migrationRows[0]?.count !== expectedMigrations) throw new Error('Expected all repository migrations before seed.');
    const { hashPassword } = await import('../packages/api/dist/identity/password.js');
    const passwordHash = await hashPassword(password);
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const date = (days) => new Date(today.getTime() + days * 86400000);
    const academicStart = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const academicYear = `${academicStart}-${academicStart + 1}`;
    await db.$transaction(async (tx) => {
      await tx.district.upsert({ where: { id: uatIds(1) }, create: { id: uatIds(1), name: 'مقاطعة محلية تجريبية — بيانات اصطناعية', externalCode: 'LOCAL-UAT' }, update: {} });
      await tx.inspector.upsert({ where: { id: UAT_INSPECTOR.id }, create: { id: UAT_INSPECTOR.id, email: UAT_INSPECTOR.email, passwordHash, status: 'ACTIVE', name: 'مفتش تجريبي', surname: 'للاختبار المحلي' }, update: {} });
      const inspector = await tx.inspector.findUniqueOrThrow({ where: { id: UAT_INSPECTOR.id } });
      if (inspector.email !== UAT_INSPECTOR.email || inspector.status !== 'ACTIVE') throw new Error('Deterministic UAT inspector identity conflicts with existing data.');
      await tx.inspectorDistrictMembership.upsert({ where: { id: uatIds(2) }, create: { id: uatIds(2), inspectorId: UAT_INSPECTOR.id, districtId: uatIds(1), role: 'INSPECTOR', validFrom: date(-365) }, update: {} });
      const institutionSpecs = [
        ['ابتدائية محلية النخيل', 'بلدية النخيل', null],
        ['ابتدائية محلية الينبوع', 'بلدية الينبوع', null],
        ['ابتدائية محلية طويلة الاسم لمراجعة التفاف النصوص في الجداول وبطاقات المعلومات', 'بلدية الاختبار', null],
        ['ابتدائية ملحقة محلية أ', 'بلدية النخيل', null],
        ['ابتدائية ملحقة محلية ب', 'بلدية الينبوع', null],
        ['ابتدائية محلية مؤرشفة', 'بلدية الاختبار', date(-1)],
      ];
      for (let i = 0; i < institutionSpecs.length; i += 1) {
        const [name, municipality, archivedAt] = institutionSpecs[i];
        await tx.institution.upsert({ where: { id: uatIds(10 + i) }, create: { id: uatIds(10 + i), districtId: uatIds(1), name, municipality, email: i === 0 ? 'school@example.invalid' : null, archivedAt }, update: {} });
      }
      const statuses = ['PERMANENT', 'TRAINEE', 'CONTRACT', 'TEMPORARY_CONTRACT', 'SUBSTITUTE', 'PERMANENT', 'CONTRACT', 'TRAINEE', 'SUBSTITUTE', 'TEMPORARY_CONTRACT'];
      for (let i = 0; i < statuses.length; i += 1) {
        const rich = i === 1 || i === 8;
        const noHome = i === 2;
        await tx.teacher.upsert({ where: { id: uatIds(100 + i) }, create: {
          id: uatIds(100 + i), districtId: uatIds(1), institutionId: noHome ? null : uatIds(10 + (i % 3)),
          name: i === 9 ? 'أستاذ ذو بيانات عربية طويلة لاختبار عرض الواجهة والطباعة دون اقتطاع' : `أستاذ تجريبي ${String(i + 1).padStart(2, '0')}`,
          surname: `عينة محلية ${i + 1}`, birthDate: rich ? date(-14000) : null, placeOfBirth: rich ? 'مدينة تجريبية' : null,
          phone: rich ? `+213555000${String(i + 1).padStart(3, '0')}` : null, email: rich ? `teacher${i + 1}@example.invalid` : null,
          professionalStatus: statuses[i], employedAt: rich ? date(-5000) : null, confirmedAt: i === 0 ? date(-1000) : null,
          qualifications: [1, 8].includes(i) ? 'نص مؤهل قديم مستقل لأغراض الاختبار' : null,
          professionalFramework: rich ? 'إطار تعليمي تجريبي' : null,
          administrativeCategory: i === 8 ? 'تصنيف اصطناعي للاختبار' : null,
          administrativeSection: i === 8 ? 'قسم تجريبي' : null, administrativeGrade: i === 8 ? 'رتبة تجريبية' : null,
          personalAddress: rich ? 'عنوان اصطناعي محلي غير حقيقي' : null,
        }, update: {} });
      }
      for (const [teacherIndex, instIndex] of [[1, 13], [8, 13], [8, 14]]) {
        const id = uatIds(200 + teacherIndex * 10 + instIndex);
        await tx.teacherSupplementaryWorkplace.upsert({ where: { id }, create: { id, teacherId: uatIds(100 + teacherIndex), institutionId: uatIds(instIndex), districtId: uatIds(1), validFrom: date(-180) }, update: {} });
      }
      for (const teacherIndex of [1, 8]) {
        await tx.teacherQualification.upsert({ where: { id: uatIds(300 + teacherIndex) }, create: { id: uatIds(300 + teacherIndex), teacherId: uatIds(100 + teacherIndex), name: 'شهادة اصطناعية منظمة', issuingBody: 'جهة محلية تجريبية', qualificationDate: date(-2500) }, update: {} });
      }
      const schedulableTeachers = [1, 8, 9];
      for (const teacherIndex of schedulableTeachers) {
        const scheduleId = uatIds(400 + teacherIndex);
        await tx.weeklySchedule.upsert({ where: { teacherId_academicYear: { teacherId: uatIds(100 + teacherIndex), academicYear } }, create: { id: scheduleId, teacherId: uatIds(100 + teacherIndex), academicYear }, update: {} });
        const homeInstitution = teacherIndex === 2 ? uatIds(10) : uatIds(10 + teacherIndex % 3);
        const slotRows = [
          { id: uatIds(500 + teacherIndex * 10), scheduleId, teacherId: uatIds(100 + teacherIndex), districtId: uatIds(1), institutionId: homeInstitution, validFrom: date(-120), workplaceBasis: 'HOME', dayOfWeek: 1, startMinute: 480, endMinute: 540, levelLabel: 'قسم تجريبي', groupLabel: 'فوج أ' },
          { id: uatIds(501 + teacherIndex * 10), scheduleId, teacherId: uatIds(100 + teacherIndex), districtId: uatIds(1), institutionId: uatIds(13), validFrom: date(-120), workplaceBasis: 'SUPPLEMENTARY', dayOfWeek: 3, startMinute: 600, endMinute: 660, levelLabel: 'قسم تجريبي', groupLabel: 'فوج ب' },
        ];
        await tx.weeklyScheduleSlot.createMany({ data: slotRows, skipDuplicates: true });
      }
      const visitSpecs = [
        [600, 1, 'GUIDANCE', 'PLANNED', -2], [601, 0, 'TENURE_CONFIRMATION', 'COMPLETED', -35],
        [602, 4, 'PROMOTION_EVALUATION', 'COMPLETED', -28], [603, 5, 'MONITORING_FOLLOW_UP', 'PLANNED', 5],
        [604, 8, 'EXCEPTIONAL', 'COMPLETED', -14], [605, 9, 'GUIDANCE', 'COMPLETED', -7],
      ];
      for (const [visitId, ti, visitType, status, days] of visitSpecs) {
        const id = uatIds(visitId); const start = date(days); start.setUTCHours(8 + (visitId % 3), 0, 0, 0);
        const end = new Date(start.getTime() + 3600000);
        await tx.pedagogicalVisit.upsert({ where: { id }, create: { id, districtId: uatIds(1), inspectorId: UAT_INSPECTOR.id,
          teacherId: uatIds(100 + ti), institutionId: uatIds(10 + (ti % 3)), institutionNameSnapshot: institutionSpecs[ti % 3][0],
          academicYear, visitType, status, scheduledStartAt: start, scheduledEndAt: end, occurredAt: status === 'COMPLETED' ? end : null }, update: {} });
      }
      const reportBase = { reportType: 'INSPECTOR_VISIT', templateSource: 'PRODUCT_OWNER_ADOPTED', templateVersion: 1 };
      await tx.inspectionReport.upsert({ where: { visitId: uatIds(602) }, create: { id: uatIds(700), visitId: uatIds(602), ...reportBase,
        status: 'FINAL', revision: 1, levelClass: 'قسم تجريبي', lessonTopic: 'نشاط حركي اصطناعي', inspectorConclusion: 'خلاصة تجريبية محلية',
        finalizedAt: date(-27), finalizedByInspectorId: UAT_INSPECTOR.id, finalizedInspectorNameSnapshot: inspector.name, finalizedInspectorSurnameSnapshot: inspector.surname,
        finalizedTeacherNameSnapshot: 'أستاذ تجريبي 05', finalizedTeacherSurnameSnapshot: 'عينة محلية 5', finalizedTeacherBirthDateSnapshot: date(-14000),
        finalizedTeacherPlaceOfBirthSnapshot: 'مدينة تجريبية', finalizedDistrictNameSnapshot: 'مقاطعة محلية تجريبية — بيانات اصطناعية', finalizedInstitutionMunicipalitySnapshot: 'بلدية الينبوع',
        studentCount: 24, studentsPresentCount: 22, studentsAbsentCount: 2, pedagogicalMark: '15.50', visitStrengthsText: 'قوة تجريبية', visitImprovementAreasText: 'مجال تحسين اصطناعي' }, update: {} });
      await tx.inspectionReport.upsert({ where: { visitId: uatIds(600) }, create: { id: uatIds(701), visitId: uatIds(600), ...reportBase,
        status: 'DRAFT', revision: 1, levelClass: 'قسم تجريبي', lessonTopic: 'مسودة نشاط', inspectorConclusion: 'خلاصة مسودة تجريبية' }, update: {} });
      await tx.inspectionReport.upsert({ where: { visitId: uatIds(601) }, create: { id: uatIds(702), visitId: uatIds(601), reportType: 'PEDAGOGICAL_ACCOMPANIMENT', templateSource: 'INSPECTOR_AUTHORED', templateVersion: 1,
        status: 'FINAL', revision: 1, levelClass: 'قسم تجريبي', lessonTopic: 'مرافقة قديمة تجريبية', inspectorConclusion: 'خلاصة قديمة', finalizedAt: date(-34), finalizedByInspectorId: UAT_INSPECTOR.id,
        finalizedInspectorNameSnapshot: inspector.name, finalizedInspectorSurnameSnapshot: inspector.surname, finalizedTeacherNameSnapshot: 'أستاذ تجريبي 01', finalizedTeacherSurnameSnapshot: 'عينة محلية 1' }, update: {} });
      await tx.followUp.upsert({ where: { id: uatIds(800) }, create: { id: uatIds(800), reportId: uatIds(700), ownerInspectorId: UAT_INSPECTOR.id, note: 'متابعة اصطناعية مفتوحة', dueDate: date(7) }, update: {} });
      await tx.followUp.upsert({ where: { id: uatIds(801) }, create: { id: uatIds(801), reportId: uatIds(702), ownerInspectorId: UAT_INSPECTOR.id, status: 'COMPLETED', note: 'متابعة اصطناعية مكتملة', dueDate: date(-5), completionNote: 'إتمام محلي تجريبي', completedAt: date(-4) }, update: {} });
      const submissionSpecs = [
        [900, 'PENDING', null, null], [901, 'ACCEPTED', uatIds(101), date(-3)], [902, 'REJECTED', null, date(-2)],
        [903, 'PENDING', null, null],
      ];
      for (const [idNum, status, acceptedTeacherId, decidedAt] of submissionSpecs) {
        const id = uatIds(idNum);
        await tx.teacherSubmission.upsert({ where: { id }, create: { id, districtId: uatIds(1), status, acceptedTeacherId,
          decidedAt, decidedByInspectorId: decidedAt ? UAT_INSPECTOR.id : null,
          ...(idNum === 903 ? {
            firstEducationAppointmentDecisionNumber: 'تصريح قرار توظيف غير معتمد',
            institutionAppointmentDate: date(-2000),
            institutionAppointmentNumber: 'تصريح تعيين مؤسسة غير معتمد',
            declaredHomeInstitutionEmail: 'declared-only@example.invalid',
          } : {}),
          submittedProfile: { firstName: `مصرح ${idNum}`, lastName: 'بيانات اصطناعية', dateOfBirth: '1988-04-12', placeOfBirth: 'مكان تجريبي', phone: '+213555000999', email: `submission${idNum}@example.invalid`, professionalStatus: 'CONTRACT', employmentDate: '2010-09-01', workplace: { institutionName: 'مؤسسة مصرح بها فقط', municipality: 'بلدية تجريبية', institutionAddress: 'عنوان تصريح فقط', directorPhone: '+213555000998' } } }, update: {} });
      }
      await tx.teacherSubmissionQualificationDeclaration.upsert({ where: { id: uatIds(910) }, create: { id: uatIds(910), submissionId: uatIds(903), position: 0, name: 'مؤهل مصرح به غير معتمد', issuingBody: 'جهة مصرح بها' }, update: {} });
      await tx.teacherSubmissionSupplementaryWorkplaceDeclaration.upsert({ where: { id: uatIds(911) }, create: { id: uatIds(911), submissionId: uatIds(903), position: 0, institutionName: 'مؤسسة إضافية مصرح بها فقط', municipality: 'بلدية تصريح' }, update: {} });
      await tx.teacherSubmissionQualificationDeclaration.upsert({ where: { id: uatIds(912) }, create: { id: uatIds(912), submissionId: uatIds(903), position: 1, name: 'مؤهل مصرح به غير معتمد', issuingBody: 'جهة مصرح بها' }, update: {} });
      await tx.teacherSubmissionSupplementaryWorkplaceDeclaration.upsert({ where: { id: uatIds(913) }, create: { id: uatIds(913), submissionId: uatIds(903), position: 1, institutionName: 'مؤسسة إضافية مصرح بها فقط', municipality: 'بلدية تصريح' }, update: {} });
    });
    await assertTarget(db);
    const counts = await db.$queryRawUnsafe(`SELECT (SELECT count(*)::int FROM "Teacher" WHERE "id" BETWEEN '${uatIds(100)}'::uuid AND '${uatIds(109)}'::uuid) AS teachers,(SELECT count(*)::int FROM "Institution" WHERE "id" BETWEEN '${uatIds(10)}'::uuid AND '${uatIds(15)}'::uuid) AS institutions`);
    console.log(`Persistent LOCAL UAT seed complete; synthetic teachers=${counts[0].teachers}, institutions=${counts[0].institutions}; inspector=${UAT_INSPECTOR.email}.`);
  } finally { await db.$disconnect(); }
}

async function startApi() {
  const url = getUrl();
  const { PrismaClient } = getPrisma();
  const guard = new PrismaClient({ datasources: { db: { url } } });
  try { await guard.$connect(); await assertTarget(guard); }
  finally { await guard.$disconnect(); }
  const child = spawn(process.execPath, [resolve(root, 'packages/api/dist/main.js')], {
    cwd: root, env: { ...process.env, DATABASE_URL: url, PORT: '3001', LOCAL_UAT_INSPECTOR_PASSWORD: '' }, stdio: 'inherit', windowsHide: true,
  });
  const stop = () => child.kill();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const command = process.argv[2];
  if (command === 'init') await init();
  else if (command === 'seed') await seed();
  else if (command === 'api') await startApi();
  else throw new Error('Usage: node scripts/local-uat.mjs <init|seed|api>');
}
