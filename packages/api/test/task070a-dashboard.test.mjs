import assert from 'node:assert/strict';
import test from 'node:test';
import { algiersCalendarDate } from '../dist/dashboard/routes.js';

test('TASK-070A calendar day uses Africa/Algiers at UTC date boundaries', () => {
  assert.equal(algiersCalendarDate(new Date('2026-10-01T22:59:59.999Z')), '2026-10-01');
  assert.equal(algiersCalendarDate(new Date('2026-10-01T23:00:00.000Z')), '2026-10-02');
  assert.equal(algiersCalendarDate(new Date('2026-10-02T00:00:00.000Z')), '2026-10-02');
});
