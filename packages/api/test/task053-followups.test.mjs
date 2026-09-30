import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alertState, dayInAlgiers } from '../dist/followups/routes.js';

test('TASK-053 derives the calendar day at the UTC/Africa-Algiers boundary', () => {
  const justBeforeUtcMidnight = new Date('2026-09-30T23:30:00.000Z');
  const algeriaDay = dayInAlgiers(justBeforeUtcMidnight);
  assert.equal(justBeforeUtcMidnight.toISOString().slice(0, 10), '2026-09-30');
  assert.equal(algeriaDay.toISOString().slice(0, 10), '2026-10-01');
  assert.equal(alertState('OPEN', new Date('2026-09-30T00:00:00.000Z'), algeriaDay), 'OVERDUE');
  assert.equal(alertState('OPEN', new Date('2026-10-01T00:00:00.000Z'), algeriaDay), 'DUE_TODAY');
  assert.equal(alertState('COMPLETED', new Date('2026-09-30T00:00:00.000Z'), algeriaDay), 'NONE');
});
