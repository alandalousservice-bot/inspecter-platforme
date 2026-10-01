import { z } from 'zod';

export const academicYearSchema = z.string().regex(/^\d{4}-\d{4}$/u)
  .refine((value) => Number(value.slice(5)) === Number(value.slice(0, 4)) + 1);
