import type { Express, RequestHandler } from 'express';
import { type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../http/api-error.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';
import { applyScheduleConsistency } from '../schedules/consistency.js';
import { academicYearSchema } from '../schedules/validation.js';
import { algiersCalendarDate } from './supplementary-workplaces-domain.js';

const querySchema = z.object({ academicYear: academicYearSchema }).strict();
const notFound = () => new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
const badInput = (field: string) => new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { [field]: ['قيمة غير صالحة.'] });
const calendar = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

function algeriaDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function registerTeacherInformationCardRoutes(
  app: Express,
  database: PrismaClient,
  requireInspector: RequestHandler,
  clock: () => Date = () => new Date(),
): void {
  app.use('/api/v1/teachers/:teacherId/information-card', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  }, requireInspector);

  app.get('/api/v1/teachers/:teacherId/information-card', async (request, response) => {
    const teacherId = z.string().uuid().safeParse(request.params.teacherId);
    if (!teacherId.success) throw badInput('teacherId');
    const query = querySchema.safeParse(request.query);
    if (!query.success) throw badInput('academicYear');

    const now = clock();
    const asOfDate = algiersCalendarDate(now);
    const asOfDateValue = new Date(`${asOfDate}T00:00:00.000Z`);
    const inspectorId = response.locals.inspectorId as string;
    const teacher = await database.teacher.findUnique({
      where: { id: teacherId.data },
      select: {
        id: true, districtId: true, institutionId: true, name: true, surname: true, birthDate: true,
        placeOfBirth: true, birthProvince: true, phone: true, email: true, professionalStatus: true,
        professionalFramework: true, employedAt: true, confirmedAt: true, firstEducationAppointmentDate: true,
        firstEducationAppointmentDecisionNumber: true, firstInstallationDate: true, traineeshipDate: true,
        institutionAppointmentDate: true, institutionAppointmentNumber: true, financialControllerVisaNumber: true,
        administrativeCategory: true, administrativeSection: true, administrativeGrade: true,
        administrativeClassificationEffectiveDate: true, personalAddress: true, administrativeNote: true,
        recordStatus: true, archivedAt: true, qualifications: true,
        district: { select: { name: true } },
        institution: { select: { id: true, name: true, municipality: true, email: true, archivedAt: true } },
      },
    });
    if (!teacher) throw notFound();
    await requireInspectorDistrictMembership(database, inspectorId, teacher.districtId, now);

    const inspector = await database.inspector.findUnique({ where: { id: inspectorId }, select: { name: true, surname: true } });
    const supplementaryRows = await database.teacherSupplementaryWorkplace.findMany({
      where: { teacherId: teacher.id, validFrom: { lte: asOfDateValue }, OR: [{ validTo: null }, { validTo: { gt: asOfDateValue } }] },
      select: {
        id: true, validFrom: true, validTo: true, institutionId: true,
        institution: { select: { id: true, name: true, municipality: true, archivedAt: true } },
      },
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    const qualifications = await database.teacherQualification.findMany({
      where: { teacherId: teacher.id }, select: { id: true, name: true, issuingBody: true, qualificationDate: true },
      orderBy: [{ qualificationDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    const schedule = await database.weeklySchedule.findUnique({
      where: { teacherId_academicYear: { teacherId: teacher.id, academicYear: query.data.academicYear } },
      select: {
        academicYear: true, revision: true,
        slots: {
          where: { OR: [
            { institutionId: null }, { validFrom: null },
            { AND: [{ institutionId: { not: null } }, { validFrom: { lte: asOfDateValue } }, { OR: [{ validTo: null }, { validTo: { gt: asOfDateValue } }] }] },
          ] },
          select: {
            id: true, institutionId: true, validFrom: true, validTo: true, workplaceBasis: true,
            dayOfWeek: true, startMinute: true, endMinute: true,
            institution: { select: { id: true, name: true, municipality: true, archivedAt: true } },
          },
          orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }, { endMinute: 'asc' }, { id: 'asc' }],
        },
      },
    });
    const latestVisit = await database.pedagogicalVisit.findFirst({
      where: {
        teacherId: teacher.id, status: 'COMPLETED',
        visitType: { in: ['TENURE_CONFIRMATION', 'PROMOTION_EVALUATION', 'MONITORING_FOLLOW_UP', 'EXCEPTIONAL'] },
        occurredAt: { not: null },
      },
      select: { occurredAt: true }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    const latestMark = await database.inspectionReport.findFirst({
      where: {
        status: 'FINAL', reportType: 'INSPECTOR_VISIT', templateSource: 'PRODUCT_OWNER_ADOPTED', templateVersion: 1,
        pedagogicalMark: { not: null }, finalizedAt: { not: null },
        visit: { teacherId: teacher.id, visitType: 'PROMOTION_EVALUATION' },
      },
      select: { pedagogicalMark: true }, orderBy: [{ finalizedAt: 'desc' }, { id: 'desc' }],
    });

    const scheduleSlots = schedule ? applyScheduleConsistency(schedule.slots, {
      institutionId: teacher.institutionId,
      supplementaryWorkplaces: supplementaryRows.map(({ institutionId, validFrom, validTo }) => ({ institutionId, validFrom, validTo })),
    }, asOfDate) : [];
    const legacyUnknownSlots = scheduleSlots.filter((slot) => slot.institutionId === null || slot.validFrom === null || !slot.institution).map((slot) => ({
      id: slot.id, dayOfWeek: slot.dayOfWeek, startMinute: slot.startMinute, endMinute: slot.endMinute,
      institution: null, validFrom: null, validTo: null, workplaceBasis: null,
      consistency: { status: 'LEGACY_UNKNOWN' as const, reasonCode: 'LEGACY_LOCATION_UNKNOWN' as const },
    }));
    const currentSlots = scheduleSlots.filter((slot) => slot.institutionId !== null && slot.validFrom !== null && slot.institution !== null).map((slot) => ({
      id: slot.id, dayOfWeek: slot.dayOfWeek, startMinute: slot.startMinute, endMinute: slot.endMinute,
      institution: slot.institution ? {
        id: slot.institution.id, name: slot.institution.name, municipality: slot.institution.municipality,
        archivedAt: slot.institution.archivedAt?.toISOString() ?? null,
      } : null,
      validFrom: calendar(slot.validFrom), validTo: calendar(slot.validTo), workplaceBasis: slot.workplaceBasis,
      consistency: slot.consistency,
    }));

    response.json({ data: { card: {
      asOfDate, academicYear: query.data.academicYear,
      teacher: {
        id: teacher.id, name: teacher.name, surname: teacher.surname, birthDate: calendar(teacher.birthDate),
        placeOfBirth: teacher.placeOfBirth, birthProvince: teacher.birthProvince, phone: teacher.phone, email: teacher.email,
        professionalStatus: teacher.professionalStatus, professionalFramework: teacher.professionalFramework,
        employedAt: calendar(teacher.employedAt), confirmedAt: calendar(teacher.confirmedAt),
        firstEducationAppointmentDate: calendar(teacher.firstEducationAppointmentDate),
        firstEducationAppointmentDecisionNumber: teacher.firstEducationAppointmentDecisionNumber,
        firstInstallationDate: calendar(teacher.firstInstallationDate), traineeshipDate: calendar(teacher.traineeshipDate),
        institutionAppointmentDate: calendar(teacher.institutionAppointmentDate),
        institutionAppointmentNumber: teacher.institutionAppointmentNumber,
        financialControllerVisaNumber: teacher.financialControllerVisaNumber,
        administrativeCategory: teacher.administrativeCategory, administrativeSection: teacher.administrativeSection,
        administrativeGrade: teacher.administrativeGrade,
        administrativeClassificationEffectiveDate: calendar(teacher.administrativeClassificationEffectiveDate),
        personalAddress: teacher.personalAddress, administrativeNote: teacher.administrativeNote,
        recordStatus: teacher.recordStatus, archivedAt: teacher.archivedAt?.toISOString() ?? null,
      },
      homeInstitution: teacher.institution ? {
        id: teacher.institution.id, name: teacher.institution.name, municipality: teacher.institution.municipality,
        email: teacher.institution.email, archivedAt: teacher.institution.archivedAt?.toISOString() ?? null,
        appointment: {
          institutionAppointmentDate: calendar(teacher.institutionAppointmentDate),
          institutionAppointmentNumber: teacher.institutionAppointmentNumber,
          financialControllerVisaNumber: teacher.financialControllerVisaNumber,
        },
      } : null,
      currentSupplementaryWorkplaces: supplementaryRows.map((row) => ({
        id: row.id,
        institution: { id: row.institution.id, name: row.institution.name, municipality: row.institution.municipality, archivedAt: row.institution.archivedAt?.toISOString() ?? null },
        validFrom: calendar(row.validFrom), validTo: calendar(row.validTo),
      })),
      qualifications: {
        items: qualifications.map((item) => ({ id: item.id, name: item.name, issuingBody: item.issuingBody, qualificationDate: calendar(item.qualificationDate) })),
        legacyText: teacher.qualifications,
      },
      weeklySchedule: schedule ? { academicYear: schedule.academicYear, revision: schedule.revision, currentSlots, legacyUnknownSlots } : null,
      inspectionSummary: { lastInspectionDate: latestVisit?.occurredAt ? algeriaDate(latestVisit.occurredAt) : null, pedagogicalMark: latestMark?.pedagogicalMark?.toString() ?? null },
      organizationalContext: { district: { name: teacher.district.name }, inspector: inspector ? { name: inspector.name, surname: inspector.surname } : null },
    } } });
  });
}
