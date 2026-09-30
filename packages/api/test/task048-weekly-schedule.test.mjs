import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { isOverlapConstraint } from '../dist/schedules/routes.js';

test('TASK-048 maps only the known PostgreSQL slot exclusion failure to safe overlap semantics', () => {
  const known = new Prisma.PrismaClientKnownRequestError('database detail is internal', {
    code: 'P2004', clientVersion: '6.12.0', meta: { database_error: 'constraint WeeklyScheduleSlot_no_overlapping_same_day' },
  });
  assert.equal(isOverlapConstraint(known), true);
  assert.equal(isOverlapConstraint(new Prisma.PrismaClientKnownRequestError('other', {
    code: 'P2004', clientVersion: '6.12.0', meta: { database_error: 'some unrelated constraint' },
  })), false);
  assert.equal(isOverlapConstraint(new Error('WeeklyScheduleSlot_no_overlapping_same_day')), false);
});
