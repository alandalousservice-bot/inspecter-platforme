import type { Express } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../http/api-error.js';
import { validateBody } from '../http/validate-body.js';
import { teacherSubmissionSchema } from './submission-schema.js';

type IntakeDatabase = Pick<PrismaClient, 'inspectorDistrictMembership' | 'teacherSubmission'>;

const districtIdSchema = z.string().uuid();

export function registerTeacherSubmissionRoutes(app: Express, database: IntakeDatabase): void {
  app.post(
    '/api/v1/public/districts/:districtId/submissions',
    (request, _response, next) => {
      if (!districtIdSchema.safeParse(request.params.districtId).success) {
        next(new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', {
          districtId: ['قيمة غير صالحة.'],
        }));
        return;
      }
      next();
    },
    validateBody(teacherSubmissionSchema),
    async (request, response) => {
      const districtId = request.params.districtId;
      const now = new Date();
      const membership = await database.inspectorDistrictMembership.findFirst({
        where: {
          districtId,
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gt: now } }],
        },
        select: { id: true },
      });
      if (!membership) {
        throw new ApiError(404, 'NOT_FOUND', 'المسار غير متاح.');
      }

      const input = request.body as z.output<typeof teacherSubmissionSchema>;
      const profile = Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
      ) as Prisma.InputJsonObject;
      const submission = await database.teacherSubmission.create({
        data: { districtId, submittedProfile: profile },
        select: { id: true },
      });

      response.setHeader('Cache-Control', 'no-store');
      response.status(202).json({ data: { receiptId: submission.id } });
    },
  );
}
