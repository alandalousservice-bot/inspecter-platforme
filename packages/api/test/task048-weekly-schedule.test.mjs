import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { isOverlapConstraint } from '../dist/schedules/routes.js';

test('TASK-048 maps only the known PostgreSQL slot exclusion failure to safe overlap semantics', () => {
  const known = new Prisma.PrismaClientKnownRequestError('database detail is internal', {
    code: 'P2004', clientVersion: '6.12.0', meta: { database_error: 'constraint WeeklyScheduleSlot_legacy_no_overlapping_same_day' },
  });
  assert.equal(isOverlapConstraint(known), true);
  assert.equal(isOverlapConstraint(new Prisma.PrismaClientKnownRequestError('other', {
    code: 'P2004', clientVersion: '6.12.0', meta: { database_error: 'some unrelated constraint' },
  })), false);
  assert.equal(isOverlapConstraint(new Error('WeeklyScheduleSlot overlap but no exact constraint identifier')), false);
  const connectorError = new Error('conflicting key value violates exclusion constraint "WeeklyScheduleSlot_temporal_no_overlapping_teacher_slots"');
  connectorError.name = 'PrismaClientUnknownRequestError';
  assert.equal(isOverlapConstraint(connectorError), true);
  const unrelatedConnectorError = new Error('constraint "Teacher_name_key"');
  unrelatedConnectorError.name = 'PrismaClientUnknownRequestError';
  assert.equal(isOverlapConstraint(unrelatedConnectorError), false);
});
