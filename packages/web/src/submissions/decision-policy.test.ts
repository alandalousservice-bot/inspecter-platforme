import { describe, expect, it } from 'vitest';
import { getAvailableDecisionActions, isDecisionAllowed } from './decision-policy';

describe('TASK-033 decision action matrix', () => {
  it('offers all decisions for pending submissions', () => {
    expect(getAvailableDecisionActions('PENDING')).toEqual(['ACCEPT', 'REJECT', 'INTERNAL_REVIEW']);
  });

  it('offers only final decisions for internal review', () => {
    expect(getAvailableDecisionActions('INTERNAL_REVIEW')).toEqual(['ACCEPT', 'REJECT']);
    expect(isDecisionAllowed('INTERNAL_REVIEW', 'INTERNAL_REVIEW')).toBe(false);
  });

  it('offers no actions for terminal statuses', () => {
    expect(getAvailableDecisionActions('ACCEPTED')).toEqual([]);
    expect(getAvailableDecisionActions('REJECTED')).toEqual([]);
  });
});
