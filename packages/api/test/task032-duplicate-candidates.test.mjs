import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findPotentialDuplicateCandidates } from '../dist/intake/duplicate-candidates.js';

const base = {
  id: 'submission-a', districtId: 'district-a', status: 'PENDING', submittedAt: new Date('2026-01-01T00:00:00Z'),
  submittedProfile: {
    firstName: 'Alice', lastName: 'Smith', dateOfBirth: '1980-01-02', placeOfBirth: 'Algiers',
    phone: '+213555123456', email: 'Alice@example.dz', primaryInstitutionName: 'School A',
  },
};
const other = (changes = {}) => ({ ...base, id: 'submission-b', submittedProfile: { ...base.submittedProfile }, ...changes });
const reasons = (candidate) => findPotentialDuplicateCandidates(base, [candidate])[0]?.matchReasons ?? [];

test('TASK-032 exact phone, canonical stored email, and normalized full name with DOB match', () => {
  assert.deepEqual(reasons(other({ submittedProfile: { ...base.submittedProfile, phone: '+213555123456', email: 'different@example.dz', firstName: 'Other', lastName: 'Person' } })), ['SAME_PHONE']);
  assert.deepEqual(reasons(other({ submittedProfile: { ...base.submittedProfile, phone: '+213555000000', email: 'Alice@example.dz', firstName: 'Other', lastName: 'Person' } })), ['SAME_EMAIL']);
  assert.deepEqual(reasons(other({ submittedProfile: { ...base.submittedProfile, phone: '+213555000000', email: 'different@example.dz', firstName: '  ALICE  ', lastName: 'Smith', dateOfBirth: '1980-01-02' } })), ['SAME_NAME_AND_DOB']);
});

test('one candidate returns every applicable reason in stable contract order', () => {
  assert.deepEqual(reasons(other()), ['SAME_PHONE', 'SAME_EMAIL', 'SAME_NAME_AND_DOB']);
});

test('email matching preserves the stored local part and provider aliases exactly', () => {
  for (const email of ['alice@example.dz', 'Alice+alias@example.dz', 'A.lice@example.dz']) {
    const candidate = other({ submittedProfile: {
      ...base.submittedProfile, email, phone: 'different', firstName: 'Different', lastName: 'Person',
    } });
    assert.deepEqual(reasons(candidate), [], email);
  }
});

test('name, DOB, place, or institution alone never produces a candidate', () => {
  for (const profile of [
    { ...base.submittedProfile, phone: '+213555000000', email: 'different@example.dz', dateOfBirth: '1981-01-02' },
    { firstName: 'Different', lastName: 'Person', dateOfBirth: '1980-01-02' },
    { placeOfBirth: 'Algiers' },
    { primaryInstitutionName: 'School A' },
  ]) {
    assert.deepEqual(reasons(other({ submittedProfile: profile })), []);
  }
});

test('NFC, whitespace collapse, and Latin case-insensitive comparison are applied', () => {
  assert.deepEqual(reasons(other({ submittedProfile: { ...base.submittedProfile, phone: 'other', email: 'other', firstName: 'A\u0301lice', lastName: 'SMITH' } })), []);
  const composedBase = { ...base, submittedProfile: { ...base.submittedProfile, firstName: 'Élodie', lastName: '  Ben   Salem ' } };
  const composedCandidate = { ...other({ submittedProfile: { ...composedBase.submittedProfile, firstName: 'E\u0301LODIE', lastName: 'Ben Salem', phone: 'different', email: 'different@example.dz' } }), districtId: 'district-a' };
  assert.deepEqual(findPotentialDuplicateCandidates(composedBase, [composedCandidate])[0]?.matchReasons, ['SAME_NAME_AND_DOB']);
});

test('Arabic letter, diacritic, and punctuation differences remain distinct; no fuzzy matching', () => {
  for (const [left, right] of [['أ', 'ا'], ['ة', 'ه'], ['ى', 'ي'], ['عَلِي', 'علي'], ['نور-الدين', 'نور الدين'], ['Alic', 'Alice']]) {
    const target = { ...base, submittedProfile: { ...base.submittedProfile, firstName: left, phone: 'one', email: 'one@example.dz' } };
    const candidate = { ...base, id: 'candidate', submittedProfile: { ...base.submittedProfile, firstName: right, phone: 'two', email: 'two@example.dz' } };
    assert.deepEqual(findPotentialDuplicateCandidates(target, [candidate]), [], `${left} vs ${right}`);
  }
});

test('source status, self, and district boundaries are enforced', () => {
  assert.equal(findPotentialDuplicateCandidates(base, [other({ status: 'PENDING' })]).length, 1);
  assert.equal(findPotentialDuplicateCandidates(base, [other({ status: 'INTERNAL_REVIEW' })]).length, 1);
  assert.equal(findPotentialDuplicateCandidates(base, [other({ status: 'REJECTED' })]).length, 0);
  assert.equal(findPotentialDuplicateCandidates(base, [other({ status: 'ACCEPTED' })]).length, 0);
  assert.equal(findPotentialDuplicateCandidates(base, [base]).length, 0);
  assert.equal(findPotentialDuplicateCandidates(base, [other({ districtId: 'district-b' })]).length, 0);
});

test('malformed/non-object snapshots do not throw or generate a match', () => {
  assert.deepEqual(findPotentialDuplicateCandidates(base, [other({ submittedProfile: null })]), []);
  assert.deepEqual(findPotentialDuplicateCandidates(base, [other({ submittedProfile: ['x'] })]), []);
});
