import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { assertTarget, parseApprovedUrl } from './local-uat.mjs';

const root = process.cwd();
const raw = readFileSync('D:\\pg-task020-temp\\task020-test-url.secret', 'utf8').trim();
const assigned = raw.match(/^(?:TEST_DATABASE_URL|DATABASE_URL)=(.*)$/u)?.[1]?.trim() ?? raw;
const url = parseApprovedUrl(assigned);
const require = createRequire(resolve(root, 'packages/api/package.json'));
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url } } });
try {
  await db.$connect();
  await assertTarget(db);
  const state = await db.$queryRaw`SELECT
    (SELECT jsonb_build_array("id"::text,"status","email") FROM "Inspector" WHERE "id"='84000000-0000-4000-8000-000000000001') AS inspector,
    (SELECT jsonb_agg(jsonb_build_array("id"::text,"name","externalCode") ORDER BY "id") FROM "District" WHERE "id"='84000000-0000-4000-8000-000000000001') AS district,
    (SELECT jsonb_agg(jsonb_build_array("id"::text,"name","archivedAt"::text) ORDER BY "id") FROM "Institution" WHERE "id" BETWEEN '84000000-0000-4000-8000-000000000010'::uuid AND '84000000-0000-4000-8000-000000000015'::uuid) AS institutions,
    (SELECT jsonb_agg(jsonb_build_array("id"::text,"professionalStatus","institutionId"::text) ORDER BY "id") FROM "Teacher" WHERE "id" BETWEEN '84000000-0000-4000-8000-000000000100'::uuid AND '84000000-0000-4000-8000-000000000109'::uuid) AS teachers,
    (SELECT jsonb_agg(jsonb_build_array("id"::text,"visitType","status","scheduledStartAt"::text) ORDER BY "id") FROM "PedagogicalVisit" WHERE "id" BETWEEN '84000000-0000-4000-8000-000000000600'::uuid AND '84000000-0000-4000-8000-000000000605'::uuid) AS visits,
    (SELECT jsonb_agg(jsonb_build_array("id"::text,"reportType","status","revision") ORDER BY "id") FROM "InspectionReport" WHERE "id" BETWEEN '84000000-0000-4000-8000-000000000700'::uuid AND '84000000-0000-4000-8000-000000000702'::uuid) AS reports,
    (SELECT jsonb_agg(jsonb_build_array("id"::text,"status","dueDate"::text) ORDER BY "id") FROM "FollowUp" WHERE "id" BETWEEN '84000000-0000-4000-8000-000000000800'::uuid AND '84000000-0000-4000-8000-000000000801'::uuid) AS followups,
    (SELECT jsonb_agg(jsonb_build_array("id"::text,"status","acceptedTeacherId"::text) ORDER BY "id") FROM "TeacherSubmission" WHERE "id" BETWEEN '84000000-0000-4000-8000-000000000900'::uuid AND '84000000-0000-4000-8000-000000000903'::uuid) AS submissions,
    (SELECT jsonb_agg(jsonb_build_array("id"::text,"inspectorId"::text,"districtId"::text,"validFrom"::text,"validTo"::text) ORDER BY "id") FROM "InspectorDistrictMembership" WHERE "inspectorId"='84000000-0000-4000-8000-000000000001') AS memberships`;
  const canonical = JSON.stringify(state[0]);
  const digest = createHash('sha256').update(canonical).digest('hex');
  if (process.argv.includes('--list-test-schemas')) {
    const schemas = await db.$queryRaw`SELECT nspname FROM pg_catalog.pg_namespace
      WHERE nspname ~ '^(task[0-9]{3}a?(_(clean|upgrade|e2e))?|g3_e2e)_[0-9]+_[a-f0-9]{10,16}$'
      ORDER BY nspname`;
    console.log(JSON.stringify(schemas.map(({ nspname }) => nspname)));
  }
  const row = state[0];
  if (!row.inspector || row.inspector[1] !== 'ACTIVE' || row.institutions?.length !== 6
    || row.teachers?.length !== 10 || row.visits?.length !== 6 || row.reports?.length !== 3
    || row.followups?.length !== 2 || row.submissions?.length !== 4 || !row.memberships?.some((membership) => membership[4] === null)) {
    throw new Error('Persistent UAT sentinel preconditions are not satisfied.');
  }
  console.log(digest);
} finally { await db.$disconnect(); }
