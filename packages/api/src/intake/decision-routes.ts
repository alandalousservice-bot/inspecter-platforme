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
}
