import type { Express } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
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
      const {
        birthProvince, professionalFramework, firstEducationAppointmentDate,
        firstEducationAppointmentDecisionNumber, firstInstallationDate, traineeshipDate,
        institutionAppointmentDate, institutionAppointmentNumber, administrativeCategory,
        administrativeSection, administrativeGrade, administrativeClassificationEffectiveDate,
        personalAddress, structuredQualifications, supplementaryWorkplaces, workplace, ...profileFields
      } = input;
      const { institutionEmail, locationProposal, ...legacyWorkplace } = workplace;
      const profile = Object.fromEntries([
        ...Object.entries(profileFields),
        ['workplace', legacyWorkplace],
      ].filter(([, value]) => value !== undefined)) as Prisma.InputJsonObject;
      const asDatabaseDate = (value?: string) => value ? new Date(`${value}T00:00:00.000Z`) : null;
      const submission = await database.teacherSubmission.create({
        data: {
          districtId,
          submittedProfile: profile,
          birthProvince,
          professionalFramework,
          firstEducationAppointmentDate: asDatabaseDate(firstEducationAppointmentDate),
          firstEducationAppointmentDecisionNumber,
          firstInstallationDate: asDatabaseDate(firstInstallationDate),
          traineeshipDate: asDatabaseDate(traineeshipDate),
          institutionAppointmentDate: asDatabaseDate(institutionAppointmentDate),
          institutionAppointmentNumber,
          administrativeCategory,
          administrativeSection,
          administrativeGrade,
          administrativeClassificationEffectiveDate: asDatabaseDate(administrativeClassificationEffectiveDate),
          personalAddress,
          declaredHomeInstitutionEmail: institutionEmail,
          ...(locationProposal ? {
            proposedInstitutionLatitude: new Prisma.Decimal(locationProposal.latitude),
            proposedInstitutionLongitude: new Prisma.Decimal(locationProposal.longitude),
            locationProposalStatus: 'PENDING',
          } : {}),
          ...(structuredQualifications?.length ? {
            qualificationDeclarations: { create: structuredQualifications.map((item, position) => ({
              position, name: item.name, issuingBody: item.issuingBody,
              qualificationDate: asDatabaseDate(item.qualificationDate),
            })) },
          } : {}),
          ...(supplementaryWorkplaces?.length ? {
            supplementaryWorkplaceDeclarations: { create: supplementaryWorkplaces.map((item, position) => ({
              position, institutionName: item.institutionName, municipality: item.municipality,
              institutionAddress: item.institutionAddress, directorPhone: item.directorPhone,
            })) },
          } : {}),
        },
        select: { id: true },
      });

      response.setHeader('Cache-Control', 'no-store');
      response.status(202).json({ data: { receiptId: submission.id } });
    },
  );
}
