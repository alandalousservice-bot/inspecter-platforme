import { Prisma, type AuditLog } from '@prisma/client';
import { z } from 'zod';

export const AuditAction = {
  TEACHER_INVITATION_ISSUED: 'TEACHER_INVITATION_ISSUED',
  TEACHER_ACCOUNT_ACTIVATED: 'TEACHER_ACCOUNT_ACTIVATED',
  TEACHER_REQUEST_CREATED: 'TEACHER_REQUEST_CREATED',
  TEACHER_REQUEST_DECIDED: 'TEACHER_REQUEST_DECIDED',
  TEACHER_PHOTO_REPLACED: 'TEACHER_PHOTO_REPLACED',
  TEACHER_SCHEDULE_SUBMITTED: 'TEACHER_SCHEDULE_SUBMITTED',
  TEACHER_SCHEDULE_CORRECTION_REQUESTED: 'TEACHER_SCHEDULE_CORRECTION_REQUESTED',
  TEACHER_SCHEDULE_CORRECTION_SUBMITTED: 'TEACHER_SCHEDULE_CORRECTION_SUBMITTED',
  TEACHER_SCHEDULE_CORRECTION_ACCEPTED: 'TEACHER_SCHEDULE_CORRECTION_ACCEPTED',
  TEACHER_SCHEDULE_CORRECTION_REJECTED: 'TEACHER_SCHEDULE_CORRECTION_REJECTED',
  TEACHER_SCHEDULE_UPDATE_SUBMITTED: 'TEACHER_SCHEDULE_UPDATE_SUBMITTED',
  TEACHER_SCHEDULE_UPDATE_ACCEPTED: 'TEACHER_SCHEDULE_UPDATE_ACCEPTED',
  TEACHER_SCHEDULE_UPDATE_REJECTED: 'TEACHER_SCHEDULE_UPDATE_REJECTED',
  TEACHER_SUBMISSION_ACCEPTED: 'TEACHER_SUBMISSION_ACCEPTED',
  TEACHER_SUBMISSION_REJECTED: 'TEACHER_SUBMISSION_REJECTED',
  TEACHER_SUBMISSION_INTERNAL_REVIEW: 'TEACHER_SUBMISSION_INTERNAL_REVIEW',
  TEACHER_PROFILE_UPDATED: 'TEACHER_PROFILE_UPDATED',
  TEACHER_QUALIFICATION_CREATED: 'TEACHER_QUALIFICATION_CREATED',
  TEACHER_QUALIFICATION_UPDATED: 'TEACHER_QUALIFICATION_UPDATED',
  TEACHER_QUALIFICATION_DELETED: 'TEACHER_QUALIFICATION_DELETED',
  TEACHER_SUPPLEMENTARY_WORKPLACE_CREATED: 'TEACHER_SUPPLEMENTARY_WORKPLACE_CREATED',
  TEACHER_SUPPLEMENTARY_WORKPLACE_UPDATED: 'TEACHER_SUPPLEMENTARY_WORKPLACE_UPDATED',
  TEACHER_SUPPLEMENTARY_WORKPLACE_CLOSED: 'TEACHER_SUPPLEMENTARY_WORKPLACE_CLOSED',
  INSPECTOR_PROFESSIONAL_IDENTITY_UPDATED: 'INSPECTOR_PROFESSIONAL_IDENTITY_UPDATED',
  INSPECTION_REPORT_FINALIZED: 'INSPECTION_REPORT_FINALIZED',
  FOLLOW_UP_STATE_CHANGED: 'FOLLOW_UP_STATE_CHANGED',
  INSPECTOR_PROPOSAL_CREATED: 'INSPECTOR_PROPOSAL_CREATED',
  INSPECTOR_PROPOSAL_UPDATED: 'INSPECTOR_PROPOSAL_UPDATED',
  INSPECTOR_PROPOSAL_CLONED: 'INSPECTOR_PROPOSAL_CLONED',
  INSPECTOR_PROPOSAL_ARCHIVED: 'INSPECTOR_PROPOSAL_ARCHIVED',
  INSTITUTION_CREATED: 'INSTITUTION_CREATED',
  INSTITUTION_UPDATED: 'INSTITUTION_UPDATED',
  INSTITUTION_LOCATION_PROPOSAL_ACCEPTED: 'INSTITUTION_LOCATION_PROPOSAL_ACCEPTED',
  INSTITUTION_LOCATION_PROPOSAL_REJECTED: 'INSTITUTION_LOCATION_PROPOSAL_REJECTED',
  TEACHER_INSTITUTION_LINKED: 'TEACHER_INSTITUTION_LINKED',
  TEACHER_INSTITUTION_CHANGED: 'TEACHER_INSTITUTION_CHANGED',
  WEEKLY_SCHEDULE_CREATED: 'WEEKLY_SCHEDULE_CREATED',
  WEEKLY_SCHEDULE_UPDATED: 'WEEKLY_SCHEDULE_UPDATED',
  PEDAGOGICAL_VISIT_CREATED: 'PEDAGOGICAL_VISIT_CREATED',
  PEDAGOGICAL_VISIT_UPDATED: 'PEDAGOGICAL_VISIT_UPDATED',
  PEDAGOGICAL_VISIT_COMPLETED: 'PEDAGOGICAL_VISIT_COMPLETED',
  PEDAGOGICAL_VISIT_CANCELLED: 'PEDAGOGICAL_VISIT_CANCELLED',
} as const;

const eventContracts = {
  [AuditAction.TEACHER_INVITATION_ISSUED]: { entityType: 'Teacher', metadata: z.object({}).strict() },
  [AuditAction.TEACHER_ACCOUNT_ACTIVATED]: { entityType: 'Teacher', metadata: z.object({}).strict() },
  [AuditAction.TEACHER_REQUEST_CREATED]: { entityType: 'TeacherChangeRequest', metadata: z.object({ kind: z.enum(['PROFILE', 'CONTACT', 'TRAINING', 'TRANSFER', 'WORKPLACE', 'LOCATION']) }).strict() },
  [AuditAction.TEACHER_REQUEST_DECIDED]: { entityType: 'TeacherChangeRequest', metadata: z.object({ kind: z.enum(['PROFILE', 'CONTACT', 'TRAINING', 'TRANSFER', 'WORKPLACE', 'LOCATION']), status: z.enum(['ACCEPTED', 'REJECTED', 'APPROVED_PENDING_DESTINATION']), resolvedInstitutionId: z.string().uuid().optional() }).strict().refine((m) => m.resolvedInstitutionId === undefined || (m.kind === 'WORKPLACE' && m.status === 'ACCEPTED')) },
  [AuditAction.TEACHER_PHOTO_REPLACED]: { entityType: 'TeacherPhoto', metadata: z.object({}).strict() },
  [AuditAction.TEACHER_SCHEDULE_SUBMITTED]: { entityType: 'WeeklySchedule', metadata: z.object({}).strict() },
  [AuditAction.TEACHER_SCHEDULE_CORRECTION_REQUESTED]: { entityType: 'ScheduleCorrection', metadata: z.object({}).strict() },
  [AuditAction.TEACHER_SCHEDULE_CORRECTION_SUBMITTED]: { entityType: 'ScheduleCorrection', metadata: z.object({}).strict() },
  [AuditAction.TEACHER_SCHEDULE_CORRECTION_ACCEPTED]: { entityType: 'ScheduleCorrection', metadata: z.object({}).strict() },
  [AuditAction.TEACHER_SCHEDULE_CORRECTION_REJECTED]: { entityType: 'ScheduleCorrection', metadata: z.object({}).strict() },
  [AuditAction.TEACHER_SCHEDULE_UPDATE_SUBMITTED]: { entityType: 'ScheduleCorrection', metadata: z.object({}).strict() },
  [AuditAction.TEACHER_SCHEDULE_UPDATE_ACCEPTED]: { entityType: 'ScheduleCorrection', metadata: z.object({}).strict() },
  [AuditAction.TEACHER_SCHEDULE_UPDATE_REJECTED]: { entityType: 'ScheduleCorrection', metadata: z.object({}).strict() },
  [AuditAction.TEACHER_SUBMISSION_ACCEPTED]: {
    entityType: 'TeacherSubmission',
    metadata: z.object({ resultingTeacherId: z.string().uuid().optional() }).strict(),
  },
  [AuditAction.TEACHER_SUBMISSION_REJECTED]: { entityType: 'TeacherSubmission', metadata: z.object({}).strict() },
  [AuditAction.TEACHER_SUBMISSION_INTERNAL_REVIEW]: { entityType: 'TeacherSubmission', metadata: z.object({}).strict() },
  [AuditAction.TEACHER_PROFILE_UPDATED]: {
    entityType: 'Teacher',
    metadata: z.object({ changedFields: z.array(z.enum([
      'name', 'surname', 'birthDate', 'placeOfBirth', 'phone', 'email',
      'professionalStatus', 'employedAt', 'confirmedAt', 'qualifications',
      'professionalFramework', 'firstEducationAppointmentDate', 'firstEducationAppointmentDecisionNumber',
      'firstInstallationDate', 'traineeshipDate', 'institutionAppointmentDate', 'institutionAppointmentNumber',
      'financialControllerVisaNumber', 'administrativeCategory', 'administrativeSection', 'administrativeGrade',
      'administrativeClassificationEffectiveDate', 'birthProvince', 'personalAddress', 'administrativeNote',
    ])).min(1) }).strict(),
  },
  [AuditAction.TEACHER_QUALIFICATION_CREATED]: {
    entityType: 'TeacherQualification', metadata: z.object({ teacherId: z.string().uuid() }).strict(),
  },
  [AuditAction.TEACHER_QUALIFICATION_UPDATED]: {
    entityType: 'TeacherQualification',
    metadata: z.object({
      teacherId: z.string().uuid(),
      changedFields: z.array(z.enum(['name', 'issuingBody', 'qualificationDate'])).min(1).max(3),
    }).strict(),
  },
  [AuditAction.TEACHER_QUALIFICATION_DELETED]: {
    entityType: 'TeacherQualification', metadata: z.object({ teacherId: z.string().uuid() }).strict(),
  },
  [AuditAction.TEACHER_SUPPLEMENTARY_WORKPLACE_CREATED]: {
    entityType: 'TeacherSupplementaryWorkplace',
    metadata: z.object({ teacherId: z.string().uuid(), institutionId: z.string().uuid() }).strict(),
  },
  [AuditAction.TEACHER_SUPPLEMENTARY_WORKPLACE_UPDATED]: {
    entityType: 'TeacherSupplementaryWorkplace',
    metadata: z.object({
      teacherId: z.string().uuid(), institutionId: z.string().uuid(),
      changedFields: z.array(z.enum(['validFrom', 'validTo'])).min(1).max(2),
    }).strict(),
  },
  [AuditAction.TEACHER_SUPPLEMENTARY_WORKPLACE_CLOSED]: {
    entityType: 'TeacherSupplementaryWorkplace',
    metadata: z.object({ teacherId: z.string().uuid(), institutionId: z.string().uuid() }).strict(),
  },
  [AuditAction.INSPECTOR_PROFESSIONAL_IDENTITY_UPDATED]: {
    entityType: 'Inspector',
    metadata: z.object({ changedFields: z.array(z.enum(['name', 'surname'])).min(1).max(2) }).strict(),
  },
  [AuditAction.INSPECTION_REPORT_FINALIZED]: { entityType: 'InspectionReport', metadata: z.object({}).strict() },
  [AuditAction.FOLLOW_UP_STATE_CHANGED]: { entityType: 'FollowUp', metadata: z.object({}).strict() },
  [AuditAction.INSPECTOR_PROPOSAL_CREATED]: { entityType: 'InspectorProposal', metadata: z.object({}).strict() },
  [AuditAction.INSPECTOR_PROPOSAL_UPDATED]: { entityType: 'InspectorProposal', metadata: z.object({}).strict() },
  [AuditAction.INSPECTOR_PROPOSAL_CLONED]: { entityType: 'InspectorProposal', metadata: z.object({}).strict() },
  [AuditAction.INSPECTOR_PROPOSAL_ARCHIVED]: { entityType: 'InspectorProposal', metadata: z.object({}).strict() },
  [AuditAction.INSTITUTION_CREATED]: {
    entityType: 'Institution', metadata: z.object({ locationChange: z.literal('SET').optional() }).strict(),
  },
  [AuditAction.INSTITUTION_UPDATED]: {
    entityType: 'Institution',
    metadata: z.object({
      changedFields: z.array(z.enum(['name', 'municipality', 'address', 'directorPhone', 'email', 'location'])).min(1),
      locationChange: z.enum(['SET', 'UPDATE', 'CLEAR']).optional(),
    }).strict(),
  },
  [AuditAction.INSTITUTION_LOCATION_PROPOSAL_ACCEPTED]: {
    entityType: 'TeacherSubmission', metadata: z.object({ institutionId: z.string().uuid() }).strict(),
  },
  [AuditAction.INSTITUTION_LOCATION_PROPOSAL_REJECTED]: {
    entityType: 'TeacherSubmission',
    metadata: z.object({ institutionId: z.string().uuid().optional(), decisionReason: z.literal('KEEP_CURRENT').optional() }).strict(),
  },
  [AuditAction.TEACHER_INSTITUTION_LINKED]: {
    entityType: 'Teacher',
    metadata: z.object({ institutionId: z.string().uuid() }).strict(),
  },
  [AuditAction.TEACHER_INSTITUTION_CHANGED]: {
    entityType: 'Teacher',
    metadata: z.object({ previousInstitutionId: z.string().uuid(), institutionId: z.string().uuid() }).strict(),
  },
  [AuditAction.WEEKLY_SCHEDULE_CREATED]: { entityType: 'WeeklySchedule', metadata: z.object({}).strict() },
  [AuditAction.WEEKLY_SCHEDULE_UPDATED]: {
    entityType: 'WeeklySchedule',
    metadata: z.object({
      changedFields: z.tuple([z.literal('slots')]),
      affectedSlotIds: z.tuple([z.string().uuid()]),
      slotCount: z.number().int().nonnegative(),
    }).strict(),
  },
  [AuditAction.PEDAGOGICAL_VISIT_CREATED]: {
    entityType: 'PedagogicalVisit',
    metadata: z.object({
      visitType: z.enum(['GUIDANCE', 'TENURE_CONFIRMATION', 'PROMOTION_EVALUATION', 'MONITORING_FOLLOW_UP', 'EXCEPTIONAL']),
      intervalKind: z.literal('ACTUAL_RETROSPECTIVE').optional(),
      scheduleWarningCode: z.enum(['VISIT_WEEKLY_SCHEDULE_MISSING', 'VISIT_OUTSIDE_WEEKLY_SCHEDULE']).optional(),
    }).strict(),
  },
  [AuditAction.PEDAGOGICAL_VISIT_UPDATED]: {
    entityType: 'PedagogicalVisit',
    metadata: z.object({
      changedFields: z.array(z.enum(['scheduledStartAt', 'scheduledEndAt', 'academicYear', 'visitType', 'institutionId', 'institutionNameSnapshot'])).min(1),
      scheduleWarningCode: z.enum(['VISIT_WEEKLY_SCHEDULE_MISSING', 'VISIT_OUTSIDE_WEEKLY_SCHEDULE']).optional(),
    }).strict(),
  },
  [AuditAction.PEDAGOGICAL_VISIT_COMPLETED]: {
    entityType: 'PedagogicalVisit',
    metadata: z.object({ fromStatus: z.literal('PLANNED').nullable(), toStatus: z.literal('COMPLETED') }).strict(),
  },
  [AuditAction.PEDAGOGICAL_VISIT_CANCELLED]: {
    entityType: 'PedagogicalVisit',
    metadata: z.object({ fromStatus: z.literal('PLANNED'), toStatus: z.literal('CANCELLED') }).strict(),
  },
} as const;

const inputSchema = z.object({
  source: z.enum(['HTTP', 'SYSTEM', 'TEACHER_HTTP']),
  actorInspectorId: z.string().uuid().nullable(),
  actorTeacherId: z.string().uuid().optional(),
  districtId: z.string().uuid().nullable(),
  action: z.enum(AuditAction),
  entityType: z.string(),
  entityId: z.string().uuid(),
  requestId: z.string().uuid().nullable(),
  metadata: z.unknown().optional(),
}).strict();

export type AuditAppendInput = z.input<typeof inputSchema>;

export async function appendAuditEvent(transaction: Prisma.TransactionClient, input: AuditAppendInput): Promise<AuditLog> {
  const parsed = inputSchema.parse(input);
  if (parsed.source === 'HTTP' && (parsed.requestId === null || parsed.actorInspectorId === null)) {
    throw new Error('HTTP audit events require a request ID and an Inspector actor.');
  }
  if (parsed.source === 'TEACHER_HTTP' && (!parsed.actorTeacherId || parsed.actorInspectorId !== null || parsed.requestId === null)) throw new Error('Teacher HTTP audit requires one Teacher actor and a request ID.');
  if (parsed.source !== 'TEACHER_HTTP' && parsed.actorTeacherId !== undefined) throw new Error('Teacher actor is reserved for Teacher HTTP audit.');
  if (parsed.source === 'TEACHER_HTTP' && ![
    AuditAction.TEACHER_ACCOUNT_ACTIVATED, AuditAction.TEACHER_REQUEST_CREATED,
    AuditAction.TEACHER_PHOTO_REPLACED, AuditAction.TEACHER_SCHEDULE_SUBMITTED,
    AuditAction.TEACHER_SCHEDULE_CORRECTION_SUBMITTED, AuditAction.TEACHER_SCHEDULE_UPDATE_SUBMITTED,
  ].some((action) => action === parsed.action)) throw new Error('This audit action requires an Inspector actor.');
  const contract = eventContracts[parsed.action];
  if (parsed.entityType !== contract.entityType) throw new Error('Audit event entity type does not match its action.');
  if (parsed.districtId === null && parsed.action !== AuditAction.INSPECTOR_PROFESSIONAL_IDENTITY_UPDATED) {
    throw new Error('A district-scoped audit event requires its resource district.');
  }
  const metadata = parsed.metadata === undefined ? undefined : contract.metadata.parse(parsed.metadata);
  return transaction.auditLog.create({
    data: {
      actorInspectorId: parsed.actorInspectorId,
      ...(parsed.actorTeacherId ? { actorTeacherId: parsed.actorTeacherId } : {}),
      districtId: parsed.districtId,
      action: parsed.action,
      entityType: parsed.entityType,
      entityId: parsed.entityId,
      requestId: parsed.requestId,
      ...(metadata === undefined ? {} : { metadata: metadata as Prisma.InputJsonValue }),
    },
  });
}
