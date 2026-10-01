import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ApiRequestError, type TeacherInformationCard } from '../auth/client';
import { TeacherInformationCardPage } from './TeacherInformationCardPage';

const { getTeacherInformationCard } = vi.hoisted(() => ({ getTeacherInformationCard: vi.fn() }));
vi.mock('../auth/client', async (importOriginal) => ({ ...await importOriginal<typeof import('../auth/client')>(), getTeacherInformationCard }));

const card: TeacherInformationCard = {
  asOfDate: '2026-10-02', academicYear: '2026-2027',
  teacher: {
    id: 'teacher-1', name: 'أمينة', surname: 'بن صالح', birthDate: '1985-03-04', placeOfBirth: 'وهران', birthProvince: 'وهران',
    phone: '+213555123456', email: 'private@example.invalid', professionalStatus: 'SUBSTITUTE', professionalFramework: 'إطار',
    employedAt: '2005-09-01', confirmedAt: null, firstEducationAppointmentDate: '2005-09-01', firstEducationAppointmentDecisionNumber: 'قرار',
    firstInstallationDate: null, traineeshipDate: null, institutionAppointmentDate: '2020-01-01', institutionAppointmentNumber: 'رقم',
    financialControllerVisaNumber: 'تأشيرة', administrativeCategory: '12', administrativeSection: null, administrativeGrade: 'درجة',
    administrativeClassificationEffectiveDate: null, personalAddress: 'عنوان خاص', administrativeNote: 'ملاحظة إدارية طويلة',
    recordStatus: 'ACTIVE', archivedAt: null,
  },
  homeInstitution: { id: 'home', name: 'المدرسة الأم', municipality: 'بلدية', email: 'school@example.invalid', archivedAt: null,
    appointment: { institutionAppointmentDate: '2020-01-01', institutionAppointmentNumber: 'رقم', financialControllerVisaNumber: 'تأشيرة' } },
  currentSupplementaryWorkplaces: [{ id: 'supp-1', institution: { id: 'supp-inst', name: 'مدرسة تكملة', municipality: null, archivedAt: null }, validFrom: '2026-10-02', validTo: null }],
  qualifications: { items: [{ id: 'qual-1', name: 'شهادة منظمة', issuingBody: 'جهة', qualificationDate: '2025-01-01' }], legacyText: 'نص قديم' },
  weeklySchedule: { academicYear: '2026-2027', revision: 1, currentSlots: [
    { id: 'slot-1', dayOfWeek: 1, startMinute: 480, endMinute: 540, institution: { id: 'home', name: 'المدرسة الأم', municipality: null, archivedAt: null }, validFrom: '2026-10-01', validTo: null, workplaceBasis: 'HOME', consistency: { status: 'NEEDS_CORRECTION', reasonCode: 'HOME_CHANGED' } },
  ], legacyUnknownSlots: [{ id: 'legacy', dayOfWeek: 2, startMinute: 540, endMinute: 600, institution: null, validFrom: null, validTo: null, workplaceBasis: null, consistency: { status: 'LEGACY_UNKNOWN', reasonCode: 'LEGACY_LOCATION_UNKNOWN' } }] },
  inspectionSummary: { lastInspectionDate: '2026-10-02', pedagogicalMark: '15.5' },
  organizationalContext: { district: { name: 'المقاطعة' }, inspector: { name: 'مفتش', surname: 'تجريبي' } },
};

function renderPage(initial = '/app/teachers/teacher-1/information-card') {
  return render(<MemoryRouter initialEntries={[initial]}><Routes>
    <Route path="/app/teachers/:id/information-card" element={<TeacherInformationCardPage />} />
  </Routes></MemoryRouter>);
}
beforeEach(() => getTeacherInformationCard.mockResolvedValue({ data: { card } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('TASK-084 Teacher information card', () => {
  it('requires explicit consecutive academic year and fetches only after selection', async () => {
    renderPage();
    expect(getTeacherInformationCard).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'السنة الدراسية' }), { target: { value: '2026-2028' } });
    expect(screen.getByText('تحقق من الصيغة وأن تكون السنتان متتاليتين.')).toBeTruthy();
    expect(getTeacherInformationCard).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'السنة الدراسية' }), { target: { value: '2026-2027' } });
    fireEvent.click(screen.getByRole('button', { name: 'عرض البطاقة' }));
    expect(await screen.findByRole('heading', { name: 'بطاقة معلومات الأستاذ' })).toBeTruthy();
    await waitFor(() => expect(getTeacherInformationCard).toHaveBeenCalledWith('teacher-1', '2026-2027'));
  });

  it('renders private details, current work, independent mark/date, legacy and schedule warning in RTL', async () => {
    const { container } = renderPage('/app/teachers/teacher-1/information-card?academicYear=2026-2027');
    expect(await screen.findByText('أمينة بن صالح')).toBeTruthy();
    expect(container.querySelector('main[dir="rtl"]')).toBeTruthy();
    expect(screen.getByText('عنوان خاص')).toBeTruthy(); expect(screen.getByText('ملاحظة إدارية طويلة')).toBeTruthy();
    expect(screen.getAllByText('المدرسة الأم').length).toBeGreaterThan(0); expect(screen.getByText('school@example.invalid')).toBeTruthy();
    expect(screen.getByText('مدرسة تكملة')).toBeTruthy(); expect(screen.getByText('شهادة منظمة')).toBeTruthy();
    expect(screen.getByText('نص قديم')).toBeTruthy(); expect(screen.getByText('15.5 / 20')).toBeTruthy();
    expect(screen.getAllByText('2026-10-02').length).toBeGreaterThan(0); expect(screen.getByText('تغيرت المؤسسة الأم منذ تسجيل الحصة.')).toBeTruthy();
    expect(screen.getByText('موقع/فترة الحصة غير موثقين')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'عرض التوزيع الأسبوعي الكامل' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'العودة إلى ملف الأستاذ' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /تعديل|حذف|أرشفة|طباعة|PDF/ })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'السنة الدراسية' })).toBeTruthy();
  });

  it('renders null and empty states without inventing dates or marks', async () => {
    getTeacherInformationCard.mockResolvedValueOnce({ data: { card: {
      ...card, homeInstitution: null, currentSupplementaryWorkplaces: [], weeklySchedule: null,
      inspectionSummary: { lastInspectionDate: null, pedagogicalMark: null }, qualifications: { items: [], legacyText: null },
    } } });
    renderPage('/app/teachers/teacher-1/information-card?academicYear=2026-2027');
    expect(await screen.findByText('لا توجد مؤسسة أم معتمدة')).toBeTruthy();
    expect(screen.getByText('لا توجد تكملة نصاب حالية')).toBeTruthy();
    expect(screen.getByText('لم يُسجَّل جدول لهذه السنة')).toBeTruthy();
    expect(screen.queryByText('0 / 20')).toBeNull();
    expect(screen.getAllByText('غير متوفر').length).toBeGreaterThan(0);
  });

  it('shows safe errors without exposing internal response details', async () => {
    getTeacherInformationCard.mockRejectedValueOnce(new ApiRequestError('SQL path secret', undefined, 404, 'NOT_FOUND'));
    renderPage('/app/teachers/teacher-1/information-card?academicYear=2026-2027');
    expect(await screen.findByRole('heading', { name: 'تعذر عرض بطاقة المعلومات' })).toBeTruthy();
    expect(screen.queryByText('SQL path secret')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(await screen.findByText('أمينة بن صالح')).toBeTruthy();
  });
});
