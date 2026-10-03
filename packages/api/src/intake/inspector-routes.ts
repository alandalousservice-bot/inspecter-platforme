import type { Express, Request, Response, RequestHandler } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../http/api-error.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';
import { serializeCanonicalInstitutionLocation } from '../institutions/location-serialization.js';
import { findPotentialDuplicateCandidates, hasPotentialDuplicateCandidates, type SubmissionSnapshot } from './duplicate-candidates.js';
import { projectDeclaredWorkplace } from './declared-workplace.js';

type InspectorIntakeDatabase = Pick<PrismaClient, 'inspectorDistrictMembership' | 'teacherSubmission'>;

const submissionStatuses = ['PENDING', 'INTERNAL_REVIEW', 'ACCEPTED', 'REJECTED'] as const;
const listQuerySchema = z.object({
  status: z.enum(submissionStatuses).default('PENDING'),
  districtId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
}).strict();

function parseListQuery(request: Request) {
  const parsed = listQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    const fields = parsed.error.issues.reduce<Record<string, string[]>>((result, issue) => {
      const key = issue.path.join('.') || '_form';
      (result[key] ??= []).push('قيمة غير صالحة.');
      return result;
    }, {});
    throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', fields);
  }
  return parsed.data;
}

function setNoStore(_request: Request, response: Response, next: (error?: unknown) => void): void {
  response.setHeader('Cache-Control', 'no-store');
  next();
}

function profileValue(profile: Prisma.JsonValue, key: string): string {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return '';
  const value = (profile as Prisma.JsonObject)[key];
  return typeof value === 'string' ? value : '';
}

function toSnapshot(row: {
  id: string;
  districtId: string;
  status: string;
  submittedAt: Date;
  submittedProfile: Prisma.JsonValue;
}): SubmissionSnapshot {
  return row;
}

function toListItem(row: SubmissionSnapshot, hasDuplicates: boolean) {
  const profile = row.submittedProfile;
  const declaredWorkplace = projectDeclaredWorkplace(profile);
  return {
    id: row.id,
    firstName: profileValue(profile as Prisma.JsonValue, 'firstName'),
    lastName: profileValue(profile as Prisma.JsonValue, 'lastName'),
    dateOfBirth: profileValue(profile as Prisma.JsonValue, 'dateOfBirth'),
    submittedAt: row.submittedAt,
    primaryInstitutionName: declaredWorkplace?.institutionName ?? '',
    status: row.status,
    hasPotentialDuplicates: hasDuplicates,
  };
}

function candidateSummary(candidate: SubmissionSnapshot, reasons: string[]) {
  const profile = candidate.submittedProfile as Prisma.JsonValue;
  return {
    id: candidate.id,
    firstName: profileValue(profile, 'firstName'),
    lastName: profileValue(profile, 'lastName'),
    dateOfBirth: profileValue(profile, 'dateOfBirth'),
    placeOfBirth: profileValue(profile, 'placeOfBirth'),
    status: candidate.status,
    submittedAt: candidate.submittedAt,
    matchReasons: reasons,
  };
}

const scopedNotFound = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');

export function registerInspectorSubmissionRoutes(
  app: Express,
  database: InspectorIntakeDatabase,
  requireInspector: RequestHandler,
): void {
  app.use('/api/v1/submissions', setNoStore, requireInspector);

  app.get('/api/v1/submissions', async (request, response) => {
    const query = parseListQuery(request);
    const inspectorId = response.locals.inspectorId as string;
    let districtIds: string[];
    if (query.districtId) {
      await requireInspectorDistrictMembership(database, inspectorId, query.districtId);
      districtIds = [query.districtId];
    } else {
      const now = new Date();
      const memberships = await database.inspectorDistrictMembership.findMany({
        where: {
          inspectorId,
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gt: now } }],
        },
        select: { districtId: true },
        distinct: ['districtId'],
      });
      districtIds = memberships.map(({ districtId }) => districtId);
    }

    const normalizedQuery = query.q?.replace(/\s+/gu, ' ').trim();
    const profileSearchFields: Prisma.TeacherSubmissionWhereInput[] = [
      ...['firstName', 'lastName', 'primaryInstitutionName'].map((field) => ({
        submittedProfile: { path: [field], string_contains: normalizedQuery ?? '', mode: 'insensitive' as const },
      })),
      { submittedProfile: { path: ['workplace', 'institutionName'], string_contains: normalizedQuery ?? '', mode: 'insensitive' } },
    ];
    const where: Prisma.TeacherSubmissionWhereInput = {
      districtId: { in: districtIds },
      status: query.status,
      ...(normalizedQuery ? {
        OR: profileSearchFields,
      } : {}),
    };
    if (query.cursor) {
      const cursorRecord = await database.teacherSubmission.findFirst({
        where: { ...where, id: query.cursor },
        select: { id: true },
      });
      if (!cursorRecord) throw scopedNotFound();
    }
    const [rows, total] = districtIds.length === 0 ? [[], 0] as const : await Promise.all([
      database.teacherSubmission.findMany({
        where,
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        take: query.limit + 1,
        select: { id: true, districtId: true, status: true, submittedAt: true, submittedProfile: true },
      }),
      database.teacherSubmission.count({ where }),
    ]);
    const hasNext = rows.length > query.limit;
    const pageRows = hasNext ? rows.slice(0, query.limit) : rows;

    const pageDistrictIds = [...new Set(pageRows.map(({ districtId }) => districtId))];
    const candidates = pageDistrictIds.length === 0 ? [] : await database.teacherSubmission.findMany({
      where: { districtId: { in: pageDistrictIds }, status: { in: ['PENDING', 'INTERNAL_REVIEW'] } },
      select: { id: true, districtId: true, status: true, submittedAt: true, submittedProfile: true },
    });
    const duplicateFlags = hasPotentialDuplicateCandidates(pageRows.map(toSnapshot), candidates.map(toSnapshot));

    response.json({
      data: pageRows.map((row) => toListItem(toSnapshot(row), duplicateFlags.get(row.id) ?? false)),
      page: {
        limit: query.limit,
        nextCursor: hasNext ? pageRows.at(-1)?.id ?? null : null,
        total,
      },
    });
  });

  app.get('/api/v1/submissions/:id', async (request, response) => {
    const idResult = z.string().uuid().safeParse(request.params.id);
    if (!idResult.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { id: ['قيمة غير صالحة.'] });
    const submission = await database.teacherSubmission.findUnique({
      where: { id: idResult.data },
      select: {
        id: true, districtId: true, status: true, submittedAt: true, submittedProfile: true, acceptedTeacherId: true,
        proposedInstitutionLatitude: true, proposedInstitutionLongitude: true, locationProposalStatus: true,
        locationProposalDecidedAt: true, locationProposalDecidedByInspectorId: true,
        locationProposalDecisionReason: true,
        locationProposalInstitution: { select: {
          id: true, districtId: true, name: true, municipality: true,
          latitude: true, longitude: true, locationSource: true,
        } },
        acceptedTeacher: { select: { institution: { select: {
          id: true, districtId: true, name: true, municipality: true,
          latitude: true, longitude: true, locationSource: true,
        } } } },
        birthProvince: true, professionalFramework: true, firstEducationAppointmentDate: true,
        firstEducationAppointmentDecisionNumber: true, firstInstallationDate: true, traineeshipDate: true,
        institutionAppointmentDate: true, institutionAppointmentNumber: true, administrativeCategory: true,
        administrativeSection: true, administrativeGrade: true, administrativeClassificationEffectiveDate: true,
        personalAddress: true, declaredHomeInstitutionEmail: true,
        qualificationDeclarations: { orderBy: { position: 'asc' }, select: { name: true, issuingBody: true, qualificationDate: true } },
        supplementaryWorkplaceDeclarations: {
          orderBy: { position: 'asc' },
          select: { institutionName: true, municipality: true, institutionAddress: true, directorPhone: true },
        },
      },
    });
    if (!submission) throw scopedNotFound();

    const inspectorId = response.locals.inspectorId as string;
    await requireInspectorDistrictMembership(database, inspectorId, submission.districtId);

    const candidates = await database.teacherSubmission.findMany({
      where: { districtId: submission.districtId, status: { in: ['PENDING', 'INTERNAL_REVIEW'] } },
      select: { id: true, districtId: true, status: true, submittedAt: true, submittedProfile: true },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
    });
    const potentialDuplicates = findPotentialDuplicateCandidates(toSnapshot(submission), candidates.map(toSnapshot))
      .map(({ candidate, matchReasons }) => candidateSummary(candidate, matchReasons));
    const profile = submission.submittedProfile;
    const declaredWorkplace = projectDeclaredWorkplace(profile);
    const submittedProfileFields = [
      'firstName', 'lastName', 'dateOfBirth', 'placeOfBirth', 'phone', 'email',
      'professionalStatus', 'employmentDate', 'confirmationDate', 'qualifications', 'notes',
    ];
    const submittedProfile = Object.fromEntries(submittedProfileFields.flatMap((field) => {
      const value = profileValue(profile, field);
      if (!value && field !== 'notes' && field !== 'qualifications' && field !== 'confirmationDate') return [];
      return value ? [[field, value]] : [];
    }));

    const proposalInstitution = submission.locationProposalInstitution
      ?? (submission.acceptedTeacher?.institution?.districtId === submission.districtId
        ? submission.acceptedTeacher.institution
        : null);
    response.json({
      data: {
        id: submission.id,
        districtId: submission.districtId,
        status: submission.status,
        submittedAt: submission.submittedAt,
        acceptedTeacherId: submission.status === 'ACCEPTED' ? submission.acceptedTeacherId : null,
        locationProposal: submission.proposedInstitutionLatitude === null || submission.proposedInstitutionLongitude === null
          ? null
          : {
            status: submission.locationProposalStatus,
            latitude: submission.proposedInstitutionLatitude.toFixed(6),
            longitude: submission.proposedInstitutionLongitude.toFixed(6),
            decidedAt: submission.locationProposalDecidedAt,
            decidedByInspectorId: submission.locationProposalDecidedByInspectorId,
            decisionReason: submission.locationProposalDecisionReason,
            institution: proposalInstitution === null ? null : {
              id: proposalInstitution.id,
              name: proposalInstitution.name,
              municipality: proposalInstitution.municipality,
              location: serializeCanonicalInstitutionLocation(proposalInstitution),
            },
          },
        submittedProfile,
        declaredAdministrative: {
          birthProvince: submission.birthProvince,
          professionalFramework: submission.professionalFramework,
          firstEducationAppointmentDate: submission.firstEducationAppointmentDate?.toISOString().slice(0, 10) ?? null,
          firstEducationAppointmentDecisionNumber: submission.firstEducationAppointmentDecisionNumber,
          firstInstallationDate: submission.firstInstallationDate?.toISOString().slice(0, 10) ?? null,
          traineeshipDate: submission.traineeshipDate?.toISOString().slice(0, 10) ?? null,
          institutionAppointmentDate: submission.institutionAppointmentDate?.toISOString().slice(0, 10) ?? null,
          institutionAppointmentNumber: submission.institutionAppointmentNumber,
          administrativeCategory: submission.administrativeCategory,
          administrativeSection: submission.administrativeSection,
          administrativeGrade: submission.administrativeGrade,
          administrativeClassificationEffectiveDate: submission.administrativeClassificationEffectiveDate?.toISOString().slice(0, 10) ?? null,
          personalAddress: submission.personalAddress,
        },
        declaredWorkplace: declaredWorkplace
          ? { ...declaredWorkplace, institutionEmail: submission.declaredHomeInstitutionEmail }
          : null,
        structuredQualifications: submission.qualificationDeclarations.map((item) => ({
          name: item.name, issuingBody: item.issuingBody,
          qualificationDate: item.qualificationDate?.toISOString().slice(0, 10) ?? null,
        })),
        supplementaryWorkplaces: submission.supplementaryWorkplaceDeclarations,
        potentialDuplicates,
      },
    });
  });
}
