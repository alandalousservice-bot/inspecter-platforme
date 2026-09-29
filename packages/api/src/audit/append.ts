import { Prisma, type AuditLog } from '@prisma/client';
import { z } from 'zod';

export const AuditAction = {
  TEACHER_SUBMISSION_ACCEPTED: 'TEACHER_SUBMISSION_ACCEPTED',
  TEACHER_SUBMISSION_REJECTED: 'TEACHER_SUBMISSION_REJECTED',
  TEACHER_SUBMISSION_INTERNAL_REVIEW: 'TEACHER_SUBMISSION_INTERNAL_REVIEW',
  TEACHER_PROFILE_UPDATED: 'TEACHER_PROFILE_UPDATED',
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
    ])).min(1) }).strict(),
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
    metadata: z.object({ changedFields: z.array(z.enum(['name', 'municipality', 'address', 'directorPhone'])).min(1) }).strict(),
  },
  [AuditAction.TEACHER_INSTITUTION_LINKED]: {
    entityType: 'Teacher',
    metadata: z.object({ institutionId: z.string().uuid() }).strict(),
  },
  [AuditAction.TEACHER_INSTITUTION_CHANGED]: {
    entityType: 'Teacher',
    metadata: z.object({ previousInstitutionId: z.string().uuid(), institutionId: z.string().uuid() }).strict(),
  },
} as const;

const inputSchema = z.object({
  source: z.enum(['HTTP', 'SYSTEM']),
  actorInspectorId: z.string().uuid().nullable(),
  districtId: z.string().uuid(),
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
