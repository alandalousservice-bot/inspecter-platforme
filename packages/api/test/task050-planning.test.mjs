import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOffsetTimestamp, scheduleWarning, yearSchemaValid } from '../dist/visits/planning.js';

test('TASK-050 academic years are explicit consecutive canonical years', () => {
  assert.equal(yearSchemaValid('2026-2027'), true);
  for (const value of ['2026-2026', '2026-2028', '26-27', '2026/2027']) assert.equal(yearSchemaValid(value), false);
});

test('TASK-050 timestamps require valid explicit offsets', () => {
  assert.equal(parseOffsetTimestamp('2026-09-28T08:30:00+01:00').toISOString(), '2026-09-28T07:30:00.000Z');
  for (const value of ['2026-09-28T08:30:00', 'not-a-date', '2026-02-30T08:30:00Z']) assert.throws(() => parseOffsetTimestamp(value));
});

test('TASK-050 advisory handles adjacent slots, gaps, missing schedules and local midnight', () => {
  const start = new Date('2026-09-28T07:30:00Z'); // Monday, 08:30 Africa/Algiers
  const end = new Date('2026-09-28T08:30:00Z'); // Monday, 09:30
  assert.equal(scheduleWarning(start, end, true, [
    { dayOfWeek: 1, startMinute: 480, endMinute: 540 },
    { dayOfWeek: 1, startMinute: 540, endMinute: 600 },
  ]), undefined);
  assert.equal(scheduleWarning(start, end, true, [
    { dayOfWeek: 1, startMinute: 480, endMinute: 535 },
    { dayOfWeek: 1, startMinute: 540, endMinute: 600 },
  ]), 'VISIT_OUTSIDE_WEEKLY_SCHEDULE');
  assert.equal(scheduleWarning(start, end, false, []), 'VISIT_WEEKLY_SCHEDULE_MISSING');

  const crossingStart = new Date('2026-09-28T22:30:00Z'); // Monday 23:30 local
  const crossingEnd = new Date('2026-09-28T23:30:00Z'); // Tuesday 00:30 local
  assert.equal(scheduleWarning(crossingStart, crossingEnd, true, [
    { dayOfWeek: 1, startMinute: 1380, endMinute: 1440 },
    { dayOfWeek: 2, startMinute: 0, endMinute: 60 },
  ]), undefined);
  assert.equal(scheduleWarning(crossingStart, crossingEnd, true, [
    { dayOfWeek: 1, startMinute: 1380, endMinute: 1440 },
  ]), 'VISIT_OUTSIDE_WEEKLY_SCHEDULE');
});
