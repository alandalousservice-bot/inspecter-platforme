import type { SubmissionDecisionAction, SubmissionStatus } from '../auth/client';

const actionsByStatus: Partial<Record<SubmissionStatus, readonly SubmissionDecisionAction[]>> = {
  PENDING: ['ACCEPT', 'REJECT', 'INTERNAL_REVIEW'],
  INTERNAL_REVIEW: ['ACCEPT', 'REJECT'],
};

export function getAvailableDecisionActions(status: SubmissionStatus): readonly SubmissionDecisionAction[] {
  return actionsByStatus[status] ?? [];
}

export function isDecisionAllowed(status: SubmissionStatus, action: SubmissionDecisionAction): boolean {
  return getAvailableDecisionActions(status).includes(action);
}
