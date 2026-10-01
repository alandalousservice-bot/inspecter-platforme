import assert from 'node:assert/strict';
import { test } from 'node:test';
import { teacherSubmissionSchema, PROFESSIONAL_STATUSES } from '../dist/intake/submission-schema.js';

const validSubmission = {
  firstName: 'أحمد',
  lastName: 'بن صالح',
  dateOfBirth: '1980-01-02',
  placeOfBirth: 'الجزائر',
  phone: '0555 123 456',
  email: 'teacher@EXAMPLE.DZ',
  professionalStatus: 'PERMANENT',
  employmentDate: '2000-01-02',
  workplace: { institutionName: 'ابتدائية النور', municipality: 'بلدية الجزائر', institutionAddress: 'شارع الاستقلال', directorPhone: '021234567' },
};

test('valid Arabic submission normalizes the single structured workplace', () => {
  const parsed = teacherSubmissionSchema.parse({
    ...validSubmission,
    firstName: '  أحمد   علي  ',
    workplace: { ...validSubmission.workplace, institutionName: ' مدرسة   النور ', municipality: ' بلدية   الجزائر ', institutionAddress: ' شارع   الاستقلال ' },
  });
  assert.equal(parsed.firstName, 'أحمد علي');
  assert.equal(parsed.phone, '+213555123456');
  assert.equal(parsed.email, 'teacher@example.dz');
  assert.deepEqual(parsed.workplace, { institutionName: 'مدرسة النور', municipality: 'بلدية الجزائر', institutionAddress: 'شارع الاستقلال', directorPhone: '+21321234567' });
});

test('all five documented professional statuses are accepted', () => {
  for (const professionalStatus of PROFESSIONAL_STATUSES) {
    assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, professionalStatus }).success, true);
  }
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, professionalStatus: 'OFFICIAL' }).success, false);
});

test('Unicode code point boundaries and control character policy are enforced', () => {
  const exact = {
    ...validSubmission,
    firstName: 'ا'.repeat(100),
    lastName: 'ب'.repeat(100),
    placeOfBirth: 'ج'.repeat(150),
    qualifications: 'د'.repeat(1000),
    notes: `ملاحظة\n${'م'.repeat(1993)}`,
    workplace: { institutionName: 'و'.repeat(200), municipality: 'ز'.repeat(150), institutionAddress: 'ع'.repeat(300), directorPhone: '0555123456' },
  };
  assert.equal(teacherSubmissionSchema.safeParse(exact).success, true);
  assert.equal(teacherSubmissionSchema.safeParse({ ...exact, firstName: `${exact.firstName}ا` }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, placeOfBirth: `${'ج'.repeat(150)}ا` }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, notes: 'لا\u0000' }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, notes: 'سطر أول\nسطر ثان' }).success, true);
});

test('date calendar validity and chronology are enforced without age assumptions', () => {
  assert.equal(teacherSubmissionSchema.safeParse(validSubmission).success, true);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, dateOfBirth: '2001-02-29' }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, employmentDate: '1980-01-02' }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, confirmationDate: '1999-01-01' }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, confirmationDate: '2000-01-02' }).success, true);
});

test('Algerian fixed and mobile local/international phone forms normalize canonically', () => {
  const accepted = [
    ['021234567', '+21321234567'],
    ['+213 21 234 567', '+21321234567'],
    ['0555123456', '+213555123456'],
    ['+213 555 123 456', '+213555123456'],
  ];
  for (const [phone, normalized] of accepted) {
    assert.equal(teacherSubmissionSchema.parse({ ...validSubmission, phone }).phone, normalized);
  }
  for (const phone of ['055512345', '0212345678', '05551234567', '+2130555123456', '1555123456']) {
    assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, phone }).success, false, phone);
  }
});

test('workplace is mandatory, strict, bounded and rejects legacy declaration keys', () => {
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, workplace: undefined }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, workplace: { ...validSubmission.workplace, extra: 'x' } }).success, false);
  for (const [field, max] of [['institutionName', 200], ['municipality', 150], ['institutionAddress', 300]]) {
    assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, workplace: { ...validSubmission.workplace, [field]: 'و'.repeat(max + 1) } }).success, false);
  }
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, primaryInstitutionName: 'legacy' }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, additionalInstitutionNames: ['legacy'] }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, workplace: { ...validSubmission.workplace, institutionName: ' ' } }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, workplace: { ...validSubmission.workplace, directorPhone: '0'.repeat(21) } }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, workplace: { ...validSubmission.workplace, directorPhone: '021234567             ' } }).success, false);
});

test('strict schema rejects unknown keys, null optional values, and empty optional text', () => {
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, districtId: '00000000-0000-4000-8000-000000000000' }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, qualifications: null }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, notes: '  ' }).success, false);
});

test('TASK-085 optional declarations normalize NFC, keep dates exact, and enforce scalar bounds', () => {
  const parsed = teacherSubmissionSchema.parse({
    ...validSubmission,
    birthProvince: '  ولاية   وهران  ',
    professionalFramework: '  إطار e\u0301  ',
    firstEducationAppointmentDate: '2005-09-01',
    personalAddress: 'عنوان خاص',
    workplace: { ...validSubmission.workplace, institutionEmail: ' School@EXAMPLE.DZ ' },
  });
  assert.equal(parsed.birthProvince, 'ولاية وهران');
  assert.equal(parsed.professionalFramework, 'إطار é');
  assert.equal(parsed.workplace.institutionEmail, 'School@example.dz');
  for (const field of ['birthProvince', 'professionalFramework', 'firstEducationAppointmentDecisionNumber', 'institutionAppointmentNumber', 'administrativeCategory', 'administrativeSection', 'administrativeGrade', 'personalAddress']) {
    assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, [field]: null }).success, false, `${field} rejects null`);
  }
  for (const value of ['2005-9-01', '2005-02-29', '2005-09-01T00:00:00Z', ' 2005-09-01 ']) {
    assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, firstInstallationDate: value }).success, false, value);
  }
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, birthProvince: 'و'.repeat(101) }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, personalAddress: `عنوان\u0000خاص` }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, workplace: { ...validSubmission.workplace, institutionEmail: 'bad' } }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, workplace: { ...validSubmission.workplace, institutionEmail: 'x'.repeat(250) + '@example.dz' } }).success, false);
});

test('TASK-085 structured declaration children are strict, bounded and optional', () => {
  assert.equal(teacherSubmissionSchema.safeParse(validSubmission).success, true);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, structuredQualifications: [] }).success, true);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, supplementaryWorkplaces: [] }).success, true);
  const qualification = { name: 'شهادة جامعية', issuingBody: 'جامعة', qualificationDate: '2020-01-01' };
  const workplace = { institutionName: 'ابتدائية أخرى', municipality: 'بلدية', institutionAddress: 'عنوان', directorPhone: '021234567' };
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, structuredQualifications: Array(5).fill(qualification) }).success, true);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, structuredQualifications: Array(6).fill(qualification) }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, supplementaryWorkplaces: Array(3).fill(workplace) }).success, true);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, supplementaryWorkplaces: Array(4).fill(workplace) }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, structuredQualifications: [{ ...qualification, unexpected: 'x' }] }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, supplementaryWorkplaces: [{ ...workplace, institutionId: '00000000-0000-4000-8000-000000000000' }] }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, supplementaryWorkplaces: [{ institutionName: 'مؤسسة', validFrom: '2020-01-01' }] }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, structuredQualifications: [{ ...qualification, issuingBody: null }] }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, supplementaryWorkplaces: [{ ...workplace, directorPhone: 'not a phone' }] }).success, false);
});
