import { Prisma, type AuditLog } from '@prisma/client';
import { z } from 'zod';

export const AuditAction = {
  TEACHER_SUBMISSION_ACCEPTED: 'TEACHER_SUBMISSION_ACCEPTED',
  TEACHER_SUBMISSION_REJECTED: 'TEACHER_SUBMISSION_REJECTED',
  TEACHER_SUBMISSION_INTERNAL_REVIEW: 'TEACHER_SUBMISSION_INTERNAL_REVIEW',
  TEACHER_PROFILE_UPDATED: 'TEACHER_PROFILE_UPDATED',
  TEACHER_QUALIFICATION_CREATED: 'TEACHER_QUALIFICATION_CREATED',
  TEACHER_QUALIFICATION_UPDATED: 'TEACHER_QUALIFICATION_UPDATED',
  TEACHER_QUALIFICATION_DELETED: 'TEACHER_QUALIFICATION_DELETED',
  INSPECTOR_PROFESSIONAL_IDENTITY_UPDATED: 'INSPECTOR_PROFESSIONAL_IDENTITY_UPDATED',
  INSPECTION_REPORT_FINALIZED: 'INSPECTION_REPORT_FINALIZED',
  FOLLOW_UP_STATE_CHANGED: 'FOLLOW_UP_STATE_CHANGED',
  INSPECTOR_PROPOSAL_CREATED: 'INSPECTOR_PROPOSAL_CREATED',
  INSPECTOR_PROPOSAL_UPDATED: 'INSPECTOR_PROPOSAL_UPDATED',
  INSPECTOR_PROPOSAL_CLONED: 'INSPECTOR_PROPOSAL_CLONED',
  INSPECTOR_PROPOSAL_ARCHIVED: 'INSPECTOR_PROPOSAL_ARCHIVED',
  INSTITUTION_CREATED: 'INSTITUTION_CREATED',
  INSTITUTION_UPDATED: 'INSTITUTION_UPDATED',
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
  [AuditAction.INSTITUTION_CREATED]: { entityType: 'Institution', metadata: z.object({}).strict() },
  [AuditAction.INSTITUTION_UPDATED]: {
    entityType: 'Institution',
    metadata: z.object({ changedFields: z.array(z.enum(['name', 'municipality', 'address', 'directorPhone', 'email'])).min(1) }).strict(),
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
      changedFields: z.array(z.enum(['scheduledStartAt', 'scheduledEndAt', 'academicYear', 'visitType'])).min(1),
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
  source: z.enum(['HTTP', 'SYSTEM']),
  actorInspectorId: z.string().uuid().nullable(),
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
  const contract = eventContracts[parsed.action];
  if (parsed.entityType !== contract.entityType) throw new Error('Audit event entity type does not match its action.');
  if (parsed.districtId === null && parsed.action !== AuditAction.INSPECTOR_PROFESSIONAL_IDENTITY_UPDATED) {
    throw new Error('A district-scoped audit event requires its resource district.');
  }
  const metadata = parsed.metadata === undefined ? undefined : contract.metadata.parse(parsed.metadata);
  return transaction.auditLog.create({
    data: {
      actorInspectorId: parsed.actorInspectorId,
      districtId: parsed.districtId,
      action: parsed.action,
      entityType: parsed.entityType,
      entityId: parsed.entityId,
      requestId: parsed.requestId,
      ...(metadata === undefined ? {} : { metadata: metadata as Prisma.InputJsonValue }),
    },
  });
}
