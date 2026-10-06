import type { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { appendAuditEvent } from '../audit/append.js';

const actions = z.enum(['TEACHER_INVITATION_ISSUED', 'TEACHER_ACCOUNT_ACTIVATED', 'TEACHER_REQUEST_CREATED', 'TEACHER_REQUEST_DECIDED', 'TEACHER_PHOTO_REPLACED', 'TEACHER_SCHEDULE_SUBMITTED', 'TEACHER_SCHEDULE_CORRECTION_REQUESTED', 'TEACHER_SCHEDULE_CORRECTION_SUBMITTED', 'TEACHER_SCHEDULE_CORRECTION_ACCEPTED', 'TEACHER_SCHEDULE_CORRECTION_REJECTED', 'TEACHER_SCHEDULE_UPDATE_SUBMITTED', 'TEACHER_SCHEDULE_UPDATE_ACCEPTED', 'TEACHER_SCHEDULE_UPDATE_REJECTED']);
const metadataSchema = z.object({ kind: z.enum(['PROFILE', 'CONTACT', 'TRAINING', 'TRANSFER', 'WORKPLACE', 'LOCATION']).optional(), status: z.enum(['ACCEPTED', 'REJECTED', 'APPROVED_PENDING_DESTINATION']).optional(), resolvedInstitutionId: z.string().uuid().optional() }).strict();
export async function appendPortalAudit(tx: Prisma.TransactionClient, response: Response, teacher: { id: string; districtId: string }, action: z.infer<typeof actions>, entityId: string, metadata: z.input<typeof metadataSchema> = {}, actorTeacherId?: string) {
  const requestId = z.string().uuid().parse(response.locals.requestId);
  const inspectorId = actorTeacherId ? null : z.string().uuid().parse(response.locals.inspectorId);
  const entityType = action.startsWith('TEACHER_REQUEST_') ? 'TeacherChangeRequest' : action === 'TEACHER_PHOTO_REPLACED' ? 'TeacherPhoto'
    : action.startsWith('TEACHER_SCHEDULE_CORRECTION_') || action.startsWith('TEACHER_SCHEDULE_UPDATE_') ? 'ScheduleCorrection' : action === 'TEACHER_SCHEDULE_SUBMITTED' ? 'WeeklySchedule' : 'Teacher';
  return appendAuditEvent(tx, { source: actorTeacherId ? 'TEACHER_HTTP' : 'HTTP', actorInspectorId: inspectorId, ...(actorTeacherId ? { actorTeacherId } : {}), districtId: teacher.districtId,
    action: actions.parse(action), entityType, entityId: z.string().uuid().parse(entityId), requestId, metadata: metadataSchema.parse(metadata) });
}
