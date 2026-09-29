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
  primaryInstitutionName: 'ابتدائية النور',
};

test('valid Arabic submission is normalized without losing its snapshot fields', () => {
  const parsed = teacherSubmissionSchema.parse({
    ...validSubmission,
    firstName: '  أحمد   علي  ',
    primaryInstitutionName: ' مدرسة   النور ',
    additionalInstitutionNames: ['   مدرسة الهدى  '],
  });
  assert.equal(parsed.firstName, 'أحمد علي');
  assert.equal(parsed.phone, '+213555123456');
  assert.equal(parsed.email, 'teacher@example.dz');
  assert.equal(parsed.primaryInstitutionName, 'مدرسة النور');
  assert.deepEqual(parsed.additionalInstitutionNames, ['مدرسة الهدى']);
});

test('only the four documented professional statuses are accepted', () => {
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
    primaryInstitutionName: 'و'.repeat(200),
    additionalInstitutionNames: Array.from({ length: 5 }, (_, index) => `${index}${'ز'.repeat(199)}`),
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

test('institution names reject duplicates after normalized comparison and only accept bounded arrays', () => {
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, additionalInstitutionNames: [] }).success, true);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, additionalInstitutionNames: Array(5).fill('مدرسة') }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, primaryInstitutionName: 'المدرسة', additionalInstitutionNames: [' المدرسة '] }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, additionalInstitutionNames: Array(6).fill('مدرسة') }).success, false);
});

test('strict schema rejects unknown keys, null optional values, and empty optional text', () => {
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, districtId: '00000000-0000-4000-8000-000000000000' }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, qualifications: null }).success, false);
  assert.equal(teacherSubmissionSchema.safeParse({ ...validSubmission, notes: '  ' }).success, false);
});
