import assert from 'node:assert/strict';
import { test } from 'node:test';
import { algiersCalendarDate, isValidSupplementaryPeriod, isValidWorkplaceAtDate, periodState } from '../dist/teachers/supplementary-workplaces-domain.js';

test('TASK-082 calendar and half-open period semantics use Algiers date', () => {
  assert.equal(algiersCalendarDate(new Date('2026-01-01T23:30:00.000Z')), '2026-01-02');
  assert.equal(periodState({ validFrom: '2026-01-02', validTo: null }, '2026-01-01'), 'FUTURE');
  assert.equal(periodState({ validFrom: '2025-01-01', validTo: '2026-01-02' }, '2026-01-02'), 'PAST');
  assert.equal(isValidSupplementaryPeriod({ validFrom: '2026-01-01', validTo: '2026-01-02' }, '2026-01-02'), false);
  assert.equal(isValidWorkplaceAtDate({ currentHomeInstitutionId: 'home', supplementary: [] }, 'home', '2026-01-02', '2026-01-02'), true);
  assert.equal(isValidWorkplaceAtDate({ currentHomeInstitutionId: 'home', supplementary: [] }, 'home', '2025-01-01', '2026-01-02'), false);
});
