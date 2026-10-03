import type { Express, RequestHandler } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { appendAuditEvent, AuditAction } from '../audit/append.js';
import { ApiError } from '../http/api-error.js';
import { validateBody } from '../http/validate-body.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';
import { teacherSubmissionSchema } from './submission-schema.js';

const decisionSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT', 'INTERNAL_REVIEW']),
  expectedStatus: z.enum(['PENDING', 'INTERNAL_REVIEW']),
}).strict();

const resultStatus = {
  ACCEPT: 'ACCEPTED',
  REJECT: 'REJECTED',
  INTERNAL_REVIEW: 'INTERNAL_REVIEW',
} as const;

const auditAction = {
  ACCEPT: AuditAction.TEACHER_SUBMISSION_ACCEPTED,
  REJECT: AuditAction.TEACHER_SUBMISSION_REJECTED,
  INTERNAL_REVIEW: AuditAction.TEACHER_SUBMISSION_INTERNAL_REVIEW,
} as const;

const scopedNotFound = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
const conflict = () => new ApiError(409, 'CONFLICT', 'تغيّرت حالة الطلب. أعد تحميله.');
const calendarDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const locationValueSchema = z.object({
  latitude: z.string().regex(/^-?(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/u).refine((value) => Number(value) >= -90 && Number(value) <= 90),
  longitude: z.string().regex(/^-?(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/u).refine((value) => Number(value) >= -180 && Number(value) <= 180),
  source: z.enum(['MANUAL_INSPECTOR', 'TEACHER_PROPOSED_APPROVED']),
}).strict();
const locationProposalDecisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ACCEPT_PROPOSED'), expectedCanonicalLocation: locationValueSchema.nullable() }).strict(),
  z.object({ action: z.literal('REJECT') }).strict(),
  z.object({ action: z.literal('KEEP_CURRENT'), expectedCanonicalLocation: locationValueSchema }).strict(),
]);

function sameCanonicalLocation(current: { latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null; locationSource: string | null }, expected: z.infer<typeof locationValueSchema> | null) {
  if (expected === null) return current.latitude === null && current.longitude === null && current.locationSource === null;
  return current.latitude !== null && current.longitude !== null
    && current.latitude.equals(expected.latitude) && current.longitude.equals(expected.longitude)
    && current.locationSource === expected.source;
}

export function registerSubmissionDecisionRoute(
  app: Express,
  database: PrismaClient,
  requireInspector: RequestHandler,
): void {
  app.post('/api/v1/submissions/:id/decision', requireInspector, validateBody(decisionSchema), async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    requireAuthenticatedMutationCsrf(request);
    const parsedId = z.string().uuid().safeParse(request.params.id);
    if (!parsedId.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { id: ['قيمة غير صالحة.'] });
    }
    const { action, expectedStatus } = request.body as z.infer<typeof decisionSchema>;
    const inspectorId = response.locals.inspectorId as string;
    const requestId = response.locals.requestId as string;

    let outcome: { id: string; status: string };
    try {
      outcome = await database.$transaction(async (transaction) => {
        const submission = await transaction.teacherSubmission.findUnique({ where: { id: parsedId.data } });
        if (!submission) throw scopedNotFound();
        await requireInspectorDistrictMembership(transaction, inspectorId, submission.districtId);
        if (submission.status !== expectedStatus) throw conflict();
        if (expectedStatus === 'INTERNAL_REVIEW' && action === 'INTERNAL_REVIEW') throw conflict();

        const now = new Date();
        const status = resultStatus[action];
        const claim = await transaction.teacherSubmission.updateMany({
          where: { id: submission.id, status: expectedStatus, acceptedTeacherId: null },
          data: { status, decidedAt: now, decidedByInspectorId: inspectorId },
        });
        if (claim.count !== 1) throw conflict();

        let teacherId: string | undefined;
        if (action === 'ACCEPT') {
          const parsed = teacherSubmissionSchema.safeParse(submission.submittedProfile);
          if (!parsed.success) throw new Error('Persisted intake snapshot is invalid.');
          const profile = parsed.data;
          const teacher = await transaction.teacher.create({
            data: {
              districtId: submission.districtId,
              name: profile.firstName,
              surname: profile.lastName,
              birthDate: calendarDate(profile.dateOfBirth),
              placeOfBirth: profile.placeOfBirth,
              phone: profile.phone,
              email: profile.email,
              professionalStatus: profile.professionalStatus,
              employedAt: calendarDate(profile.employmentDate),
              confirmedAt: profile.confirmationDate ? calendarDate(profile.confirmationDate) : null,
              qualifications: profile.qualifications ?? null,
              birthProvince: submission.birthProvince,
              professionalFramework: submission.professionalFramework,
              firstEducationAppointmentDate: submission.firstEducationAppointmentDate,
              firstInstallationDate: submission.firstInstallationDate,
              traineeshipDate: submission.traineeshipDate,
              administrativeCategory: submission.administrativeCategory,
              administrativeSection: submission.administrativeSection,
              administrativeGrade: submission.administrativeGrade,
              administrativeClassificationEffectiveDate: submission.administrativeClassificationEffectiveDate,
              personalAddress: submission.personalAddress,
              recordStatus: 'ACTIVE',
              archivedAt: null,
            },
          });
          teacherId = teacher.id;
          await transaction.teacherSubmission.update({
            where: { id: submission.id },
            data: { acceptedTeacherId: teacher.id },
          });
        }

        await appendAuditEvent(transaction, {
          source: 'HTTP',
          actorInspectorId: inspectorId,
          districtId: submission.districtId,
          action: auditAction[action],
          entityType: 'TeacherSubmission',
          entityId: submission.id,
          requestId,
          metadata: teacherId ? { resultingTeacherId: teacherId } : {},
        });
        return { id: submission.id, status };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw conflict();
      throw error;
    }
    response.json({ data: outcome });
  });

  app.post('/api/v1/submissions/:id/location-proposal-decision', requireInspector,
    validateBody(locationProposalDecisionSchema), async (request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      requireAuthenticatedMutationCsrf(request);
      const parsedId = z.string().uuid().safeParse(request.params.id);
      if (!parsedId.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { id: ['قيمة غير صالحة.'] });
      const input = request.body as z.infer<typeof locationProposalDecisionSchema>;
      const inspectorId = response.locals.inspectorId as string;
      const requestId = response.locals.requestId as string;
      const conflict = () => new ApiError(409, 'CONFLICT', 'تغيّرت حالة المقترح أو موقع المؤسسة. أعد تحميل البيانات.');
      const scopedNotFound = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');

      try {
        const result = await database.$transaction(async (transaction) => {
          await transaction.$queryRaw`SELECT id FROM "TeacherSubmission" WHERE id = ${parsedId.data}::uuid FOR UPDATE`;
          const submission = await transaction.teacherSubmission.findUnique({
            where: { id: parsedId.data },
            select: {
              id: true, districtId: true, status: true, acceptedTeacherId: true,
              proposedInstitutionLatitude: true, proposedInstitutionLongitude: true, locationProposalStatus: true,
            },
          });
          if (!submission) throw scopedNotFound();
          await requireInspectorDistrictMembership(transaction, inspectorId, submission.districtId);
          if (submission.locationProposalStatus !== 'PENDING' || !submission.proposedInstitutionLatitude || !submission.proposedInstitutionLongitude) throw conflict();

          if (input.action === 'REJECT') {
            const changed = await transaction.teacherSubmission.updateMany({
              where: { id: submission.id, locationProposalStatus: 'PENDING' },
              data: { locationProposalStatus: 'REJECTED', locationProposalDecidedAt: new Date(), locationProposalDecidedByInspectorId: inspectorId },
            });
            if (changed.count !== 1) throw conflict();
            await appendAuditEvent(transaction, {
              source: 'HTTP', actorInspectorId: inspectorId, districtId: submission.districtId,
              action: AuditAction.INSTITUTION_LOCATION_PROPOSAL_REJECTED, entityType: 'TeacherSubmission', entityId: submission.id,
              requestId, metadata: {},
            });
            return { status: 'REJECTED' };
          }

          if (submission.status !== 'ACCEPTED' || !submission.acceptedTeacherId) throw conflict();
          const teacher = await transaction.teacher.findUnique({
            where: { id: submission.acceptedTeacherId }, select: { institutionId: true, districtId: true },
          });
          if (!teacher || teacher.districtId !== submission.districtId || !teacher.institutionId) throw conflict();
          await transaction.$queryRaw`SELECT id FROM "Institution" WHERE id = ${teacher.institutionId}::uuid FOR UPDATE`;
          const institution = await transaction.institution.findUnique({
            where: { id: teacher.institutionId },
            select: { id: true, districtId: true, archivedAt: true, latitude: true, longitude: true, locationSource: true },
          });
          if (!institution || institution.districtId !== submission.districtId) throw scopedNotFound();
          if (input.action === 'ACCEPT_PROPOSED' && institution.archivedAt !== null) throw new ApiError(409, 'CONFLICT', 'لا يمكن اعتماد موقع مؤسسة مؤرشفة.');
          if (!sameCanonicalLocation(institution, input.expectedCanonicalLocation)) throw conflict();
          if (input.action === 'KEEP_CURRENT' && (institution.latitude === null || institution.longitude === null)) throw conflict();

          const accepted = input.action === 'ACCEPT_PROPOSED';
          const updateInstitution = accepted && (!institution.latitude?.equals(submission.proposedInstitutionLatitude!)
            || !institution.longitude?.equals(submission.proposedInstitutionLongitude!) || institution.locationSource !== 'TEACHER_PROPOSED_APPROVED');
          const now = new Date();
          const changed = await transaction.teacherSubmission.updateMany({
            where: { id: submission.id, locationProposalStatus: 'PENDING' },
            data: {
              locationProposalStatus: accepted ? 'ACCEPTED' : 'REJECTED', locationProposalDecidedAt: now,
              locationProposalDecidedByInspectorId: inspectorId,
              locationProposalInstitutionId: institution.id,
              locationProposalDecisionReason: accepted ? null : 'KEEP_CURRENT',
            },
          });
          if (changed.count !== 1) throw conflict();
          if (updateInstitution) {
            const updated = await transaction.institution.updateMany({
              where: {
                id: institution.id, districtId: institution.districtId, archivedAt: null,
                latitude: institution.latitude, longitude: institution.longitude, locationSource: institution.locationSource,
              },
              data: {
                latitude: submission.proposedInstitutionLatitude, longitude: submission.proposedInstitutionLongitude,
                locationSource: 'TEACHER_PROPOSED_APPROVED', updatedAt: now,
              },
            });
            if (updated.count !== 1) throw conflict();
            await appendAuditEvent(transaction, {
              source: 'HTTP', actorInspectorId: inspectorId, districtId: institution.districtId,
              action: AuditAction.INSTITUTION_UPDATED, entityType: 'Institution', entityId: institution.id,
              requestId, metadata: { changedFields: ['location'], locationChange: institution.latitude === null ? 'SET' : 'UPDATE' },
            });
          }
          await appendAuditEvent(transaction, {
            source: 'HTTP', actorInspectorId: inspectorId, districtId: submission.districtId,
            action: accepted ? AuditAction.INSTITUTION_LOCATION_PROPOSAL_ACCEPTED : AuditAction.INSTITUTION_LOCATION_PROPOSAL_REJECTED,
            entityType: 'TeacherSubmission', entityId: submission.id, requestId,
            metadata: accepted ? { institutionId: institution.id } : { institutionId: institution.id, decisionReason: 'KEEP_CURRENT' },
          });
          return { status: accepted ? 'ACCEPTED' : 'REJECTED', institutionId: institution.id };
        });
        response.json({ data: result });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
          throw new ApiError(409, 'CONFLICT', 'تغيّرت حالة المقترح أو موقع المؤسسة. أعد تحميل البيانات.');
        }
        throw error;
      }
    });
}
