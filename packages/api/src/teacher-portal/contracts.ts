import { z } from 'zod';
import { ApiError } from '../http/api-error.js';
import { phoneField, emailField, cleanText, dateField, PROFESSIONAL_STATUSES } from '../intake/submission-schema.js';

export const text = (max: number) => z.string().refine((s) => !/[\p{Cc}\p{Cf}]/u.test(s)).transform((s) => s.normalize('NFC').trim().replace(/\s+/gu, ' '))
  .refine((s) => s.length > 0 && Array.from(s).length <= max && !/[\p{Cc}\p{Cf}]/u.test(s));
export const trainingStatus = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'INCOMPLETE', 'COMPLETED']);
const coordinate = (maximum: number) => z.number().min(-maximum).max(maximum).refine((n) => /^-?(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/u.test(String(n)));
export const requestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('PROFILE'), payload: z.object({
    name: cleanText(100, true).optional(), surname: cleanText(100, true).optional(),
    birthDate: dateField.optional(), placeOfBirth: cleanText(150, true).optional(),
    professionalStatus: z.enum(PROFESSIONAL_STATUSES).optional(), employedAt: dateField.optional(),
    confirmedAt: dateField.optional(), qualifications: cleanText(1000).optional(),
  }).strict().refine((p) => Object.keys(p).length > 0) }).strict(),
  z.object({ kind: z.literal('CONTACT'), payload: z.object({ phone: phoneField.optional(), email: emailField.optional(), personalAddress: text(300).optional() }).strict().refine((p) => Object.keys(p).length > 0) }).strict(),
  z.object({ kind: z.literal('TRAINING'), payload: z.object({ status: trainingStatus, note: text(500).optional() }).strict() }).strict(),
  z.object({ kind: z.literal('TRANSFER'), payload: z.object({ destinationDistrictId: z.string().uuid(), reason: text(500) }).strict() }).strict(),
  z.object({ kind: z.literal('WORKPLACE'), payload: z.object({ institutionName: text(200), municipality: text(150).optional(), reason: text(500).optional() }).strict() }).strict(),
  z.object({ kind: z.literal('LOCATION'), payload: z.object({ institutionId: z.string().uuid(), latitude: coordinate(90), longitude: coordinate(180) }).strict() }).strict(),
]);

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.');
  return result.data;
}

export function requireTenureEligibility(teacher: { professionalStatus: string | null; trainingStatus: string | null; trainingVerifiedAt: Date | null }, visitType: string | null) {
  if (visitType !== 'TENURE_CONFIRMATION') return;
  if (teacher.professionalStatus === 'CONTRACT' || (teacher.professionalStatus === 'TRAINEE'
    && (teacher.trainingStatus !== 'COMPLETED' || teacher.trainingVerifiedAt === null))) {
    throw new ApiError(409, 'TENURE_ELIGIBILITY_REQUIRED', 'الأستاذ غير مؤهل حاليًا لزيارة التثبيت.');
  }
}
