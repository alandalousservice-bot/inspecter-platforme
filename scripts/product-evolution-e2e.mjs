import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { approvedTestDatabaseUrl, assertLiveTestDatabase, createOwnedTestSchema, dropOwnedTestSchema, generateTestSchema } from './test-schema-safety.mjs';

// No public/UAT migration or seed: every write is to this run's owned schema.
const require = createRequire(resolve('packages/api/package.json')); const { PrismaClient } = require('@prisma/client');
const prismaPackage = require.resolve('prisma/package.json'); const cli = resolve(dirname(prismaPackage), JSON.parse(readFileSync(prismaPackage, 'utf8')).bin.prisma);
const raw = process.env.TEST_DATABASE_URL ?? readFileSync('D:\\pg-task020-temp\\task020-test-url.secret', 'utf8').trim();
const url = approvedTestDatabaseUrl(raw); const schema = generateTestSchema('task090_e2e');
let admin; let database; let owned = false; let assetDirectory; let exitCode = 1; let before;
async function fingerprint() {
  const tables = await admin.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const rows = [];
  for (const { tablename } of tables) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(tablename)) throw new Error('Unsafe table name');
    const [result] = await admin.$queryRawUnsafe(`SELECT count(*)::int AS count, md5(COALESCE(string_agg(md5(row_to_json(t)::text),',' ORDER BY md5(row_to_json(t)::text)),'')) AS digest FROM public."${tablename}" t`);
    rows.push({ table: tablename, ...result });
  }
  return JSON.stringify(rows);
}
try {
  admin = new PrismaClient({ datasources: { db: { url } } }); await assertLiveTestDatabase(admin); before = await fingerprint();
  const scoped = await createOwnedTestSchema(admin, url, schema); owned = true;
  const migration = spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', resolve('packages/api/prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL: scoped }, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (migration.status !== 0) throw new Error('Isolated migration failed (credential-bearing tool output withheld).');
  database = new PrismaClient({ datasources: { db: { url: scoped } } });
  const { hashPassword } = await import('../packages/api/dist/identity/password.js');
  const password = `Synthetic-${randomUUID()}`; const district = await database.district.create({ data: { name: 'مقاطعة اختبار معزول' } });
  const inspector = await database.inspector.create({ data: { email: `evolution-${randomUUID()}@example.invalid`, passwordHash: await hashPassword(password), status: 'ACTIVE' } });
  await database.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: district.id, role: 'INSPECTOR', validFrom: new Date('2020-01-01') } });
  const destination = await database.district.create({ data: { name: 'المقاطعة المستقبلة التجريبية' } });
  await database.inspectorDistrictMembership.create({ data: { inspectorId: inspector.id, districtId: destination.id, role: 'INSPECTOR', validFrom: new Date('2020-01-01') } });
  const institution = await database.institution.create({ data: { districtId: district.id, name: 'ابتدائية الاختبار المعزول', municipality: 'بلدية اختبار معزول' } });
  const teacher = await database.teacher.create({ data: { districtId: district.id, institutionId: institution.id, name: 'أستاذ', surname: 'المساحة المهنية', professionalStatus: 'TRAINEE' } });
  await database.teacher.createMany({ data: Array.from({ length: 205 }, (_, i) => ({ districtId: district.id, institutionId: institution.id, name: `أستاذ تجريبي ${i}`, surname: 'الكثافة', professionalStatus: 'PERMANENT' })) });
  const longTeacher = await database.teacher.findFirstOrThrow({ where: { name: 'أستاذ تجريبي 0' } });
  await database.teacher.update({ where: { id: longTeacher.id }, data: { name: 'أستاذ تجريبي باسم عربي طويل للتحقق من وضوح الهوية دون اقتطاع', surname: 'ملف الإشراف والتكوين والمرافقة البيداغوجية' } });
  await database.institution.create({ data: { districtId: district.id, name: 'ابتدائية تجريبية باسم عربي طويل للتحقق من قابلية القراءة في التنقل المؤسسي والمقاطعة', municipality: 'بلدية اختبار معزول' } });
  const sharp = require('sharp');
  const photo = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#ffffff' } }).png().toBuffer();
  assetDirectory = await mkdtemp(join(tmpdir(), 'inspector-evolution-photos-'));
  const result = spawnSync(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.config.ts'], {
    env: { ...process.env, PRODUCT_EVOLUTION_E2E: '1', G3_E2E_DATABASE_URL: scoped, PRIVATE_ASSET_DIR: assetDirectory, E2E_WEB_PORT: '5273', E2E_API_PORT: '3201',
      EVOLUTION_INSPECTOR_EMAIL: inspector.email, EVOLUTION_PASSWORD: password, EVOLUTION_TEACHER_ID: teacher.id, EVOLUTION_INSTITUTION_ID: institution.id, EVOLUTION_DESTINATION_ID: destination.id, EVOLUTION_PHOTO_BASE64: photo.toString('base64') },
    stdio: 'inherit', windowsHide: true,
  });
  exitCode = result.status ?? 1;
} catch {
  console.error('Product evolution E2E could not complete; secrets and tool connection output are withheld.');
} finally {
  if (database) await database.$disconnect();
  try {
    if (admin && owned) await dropOwnedTestSchema(admin, url, schema);
    if (admin && before !== undefined && before !== await fingerprint()) { exitCode = 1; console.error('Persistent UAT preservation check failed.'); }
    else if (admin && before !== undefined) console.log('PERSISTENT_UAT_PRESERVED: YES');
  } finally {
    if (admin) await admin.$disconnect();
    // This directory was generated by mkdtemp in this process, never an operator path.
    if (assetDirectory) await rm(assetDirectory, { recursive: true });
  }
}
process.exitCode = exitCode;
