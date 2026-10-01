import { z } from 'zod';

export const PROFESSIONAL_STATUSES = [
  'PERMANENT',
  'TRAINEE',
  'CONTRACT',
  'TEMPORARY_CONTRACT',
  'SUBSTITUTE',
] as const;

const controlCharacters = /[\p{Cc}]/u;
const codePointLength = (value: string) => Array.from(value).length;

export function cleanText(maximum: number, collapseWhitespace = false) {
  return z.string().transform((raw, context) => {
    if ([...raw].some((character) => controlCharacters.test(character))) {
      context.addIssue({ code: 'custom', message: 'قيمة غير صالحة.' });
    }
    let value = raw.trim();
    if (collapseWhitespace) value = value.replace(/\s+/gu, ' ');
    if (codePointLength(value) === 0) {
      context.addIssue({ code: 'custom', message: 'قيمة غير صالحة.' });
    }
    if (codePointLength(value) > maximum) {
      context.addIssue({ code: 'custom', message: 'قيمة غير صالحة.' });
    }
    return value;
  });
}

export function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.toISOString().slice(0, 10) === value;
}

export const dateField = z.string().trim().refine(calendarDate, 'تاريخ غير صالح.');

export function normalizeAlgerianPhone(raw: string): string | null {
  const value = raw.trim();
  if (value.length > 20 || !/^[+0-9 ]+$/u.test(value)) return null;
  const compact = value.replace(/ /gu, '');
  let national: string;
  if (compact.startsWith('+213')) {
    national = compact.slice(4);
  } else if (compact.startsWith('0')) {
    national = compact.slice(1);
  } else {
    return null;
  }
  const fixed = /^[234]\d{7}$/u.test(national);
  const mobile = /^[567]\d{8}$/u.test(national);
  return fixed || mobile ? `+213${national}` : null;
}

export const phoneField = z.string().transform((raw, context) => {
  const value = raw.trim();
  if (Array.from(value).length > 20) {
    context.addIssue({ code: 'custom', message: 'قيمة غير صالحة.' });
    return value;
  }
  const normalized = normalizeAlgerianPhone(value);
  if (!normalized) context.addIssue({ code: 'custom', message: 'قيمة غير صالحة.' });
  return normalized ?? value;
});

export const directorPhoneField = z.string().refine((raw) => Array.from(raw).length <= 20, 'قيمة غير صالحة.').pipe(phoneField);

export const emailField = z.string().transform((raw, context) => {
  const value = raw.trim();
  if (Array.from(value).length > 254) {
    context.addIssue({ code: 'custom', message: 'قيمة غير صالحة.' });
    return value;
  }
  const at = value.lastIndexOf('@');
  const normalized = at > 0 ? `${value.slice(0, at)}@${value.slice(at + 1).toLowerCase()}` : value;
  if (!z.email().safeParse(normalized).success) {
    context.addIssue({ code: 'custom', message: 'قيمة غير صالحة.' });
  }
  return normalized;
});

const workplaceSchema = z.object({
  institutionName: cleanText(200, true),
  municipality: cleanText(150, true),
  institutionAddress: cleanText(300, true),
  directorPhone: directorPhoneField,
}).strict();

export const teacherSubmissionSchema = z.object({
  firstName: cleanText(100, true),
  lastName: cleanText(100, true),
  dateOfBirth: dateField,
  placeOfBirth: cleanText(150, true),
  phone: phoneField,
  email: emailField,
  professionalStatus: z.string().trim().pipe(z.enum(PROFESSIONAL_STATUSES)),
  employmentDate: dateField,
  confirmationDate: dateField.optional(),
  qualifications: cleanText(1000).optional(),
  notes: z.string().transform((raw, context) => {
    const value = raw.trim();
    if (!value || Array.from(value).length > 2000
      || [...value].some((character) => controlCharacters.test(character)
        && !['\n', '\r', '\t'].includes(character))) {
      context.addIssue({ code: 'custom', message: 'قيمة غير صالحة.' });
    }
    return value;
  }).optional(),
  workplace: workplaceSchema,
}).strict().superRefine((value, context) => {
  const today = new Date().toISOString().slice(0, 10);
  if (value.dateOfBirth > today) {
    context.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'تاريخ غير صالح.' });
  }
  if (value.employmentDate > today || value.employmentDate <= value.dateOfBirth) {
    context.addIssue({ code: 'custom', path: ['employmentDate'], message: 'تاريخ غير صالح.' });
  }
  if (value.confirmationDate
    && (value.confirmationDate > today || value.confirmationDate < value.employmentDate)) {
    context.addIssue({ code: 'custom', path: ['confirmationDate'], message: 'تاريخ غير صالح.' });
  }
});

export type TeacherSubmissionInput = z.output<typeof teacherSubmissionSchema>;
