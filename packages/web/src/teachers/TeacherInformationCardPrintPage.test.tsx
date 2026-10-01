import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { TeacherInformationCard } from '../auth/client';
import { TeacherInformationCardPrintPage } from './TeacherInformationCardPrintPage';

const { getTeacherInformationCard } = vi.hoisted(() => ({ getTeacherInformationCard: vi.fn() }));
vi.mock('../auth/client', async (importOriginal) => ({ ...await importOriginal<typeof import('../auth/client')>(), getTeacherInformationCard }));

const card: TeacherInformationCard = {
  asOfDate: '2026-10-01', academicYear: '2026-2027',
  teacher: {
    id: 'internal-teacher-id', name: 'أمينة', surname: 'بن صالح', birthDate: '1985-03-04', placeOfBirth: 'وهران', birthProvince: 'وهران',
    phone: '+213555123456', email: 'private@example.invalid', professionalStatus: 'SUBSTITUTE', professionalFramework: 'إطار مهني',
    employedAt: '2005-09-01', confirmedAt: null, firstEducationAppointmentDate: '2005-09-01', firstEducationAppointmentDecisionNumber: 'قرار ٤٢',
    firstInstallationDate: null, traineeshipDate: null, institutionAppointmentDate: '2020-01-01', institutionAppointmentNumber: 'تعيين ١٢',
    financialControllerVisaNumber: 'تأشيرة ٧', administrativeCategory: '12', administrativeSection: 'قسم', administrativeGrade: 'درجة',
    administrativeClassificationEffectiveDate: null, personalAddress: 'عنوان خاص', administrativeNote: 'سر داخلي لا يطبع',
    recordStatus: 'ACTIVE', archivedAt: null,
  },
  homeInstitution: { id: 'internal-home-id', name: 'المدرسة الأم', municipality: 'بلدية', email: 'school@example.invalid', archivedAt: null,
    appointment: { institutionAppointmentDate: '2020-01-01', institutionAppointmentNumber: 'تعيين ١٢', financialControllerVisaNumber: 'تأشيرة ٧' } },
  currentSupplementaryWorkplaces: [{ id: 'internal-workplace-id', institution: { id: 'internal-institution-id', name: 'مدرسة تكملة', municipality: 'بلدية ثانية', archivedAt: null }, validFrom: '2026-09-01', validTo: null }],
  qualifications: { items: [{ id: 'internal-qualification-id', name: 'شهادة معتمدة', issuingBody: 'الجهة المانحة', qualificationDate: '2020-01-01' }], legacyText: 'مؤهل قديم منفصل' },
  weeklySchedule: { academicYear: '2026-2027', revision: 3, currentSlots: [
    { id: 'internal-slot-id', dayOfWeek: 1, startMinute: 480, endMinute: 540, institution: { id: 'internal-home-id', name: 'المدرسة الأم', municipality: null, archivedAt: null }, validFrom: '2026-09-01', validTo: null, workplaceBasis: 'HOME', consistency: { status: 'NEEDS_CORRECTION', reasonCode: 'HOME_CHANGED' } },
  ], legacyUnknownSlots: [{ id: 'legacy-slot-id', dayOfWeek: 2, startMinute: 540, endMinute: 600, institution: null, validFrom: null, validTo: null, workplaceBasis: null, consistency: { status: 'LEGACY_UNKNOWN', reasonCode: 'LEGACY_LOCATION_UNKNOWN' } }] },
  inspectionSummary: { lastInspectionDate: '2026-09-28', pedagogicalMark: '14.25' },
  organizationalContext: { district: { name: 'مقاطعة الاختبار' }, inspector: { name: 'مفتش', surname: 'اختبار' } },
};

function renderPrint(path = '/app/teachers/teacher-1/information-card/print?academicYear=2026-2027') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/app/teachers/:id/information-card/print" element={<TeacherInformationCardPrintPage />} />
  </Routes></MemoryRouter>);
}

beforeEach(() => getTeacherInformationCard.mockResolvedValue({ data: { card } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); });

describe('TASK-086 information-card print view', () => {
  it('uses the existing card API with the route teacher and exact selected academic year', async () => {
    renderPrint();
    expect(await screen.findByRole('heading', { name: 'بطاقة معلومات الأستاذ' })).toBeTruthy();
    await waitFor(() => expect(getTeacherInformationCard).toHaveBeenCalledTimes(1));
    expect(getTeacherInformationCard).toHaveBeenCalledWith('teacher-1', '2026-2027');
  });

  it('renders the authoritative card fields and approved empty photo and signature placeholders', async () => {
    const { container } = renderPrint();
    expect(await screen.findByText('شهادة معتمدة')).toBeTruthy();
    expect(screen.getByText('مؤهل قديم منفصل')).toBeTruthy();
    expect(screen.getByText('14.25 / 20')).toBeTruthy();
    expect(screen.getByText('يرفق التوزيع الأسبوعي منفصلًا عند توفره.')).toBeTruthy();
    expect(screen.getByText('صورة شمسية')).toBeTruthy();
    expect(screen.getAllByText('التوقيع')).toHaveLength(1);
    expect(screen.queryByText('سر داخلي لا يطبع')).toBeNull();
    expect(container.querySelector('input[type="file"],img,video') as Element | null).toBeNull();
    for (const internal of ['internal-teacher-id', 'internal-home-id', 'internal-workplace-id', 'internal-institution-id', 'internal-qualification-id', 'internal-slot-id']) {
      expect(container.textContent).not.toContain(internal);
    }
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
    expect(screen.getByText('مواقع/فترات غير موثقة:')).toBeTruthy();
    expect(screen.getByText('حصص تحتاج إلى مراجعة:')).toBeTruthy();
  });

  it('does not print on route load and invokes native print only from the explicit button', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderPrint();
    const button = await screen.findByRole('button', { name: 'طباعة' });
    expect(print).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('rejects absent, malformed, or repeated academicYear without fetching or enabling print', () => {
    const { unmount } = renderPrint('/app/teachers/teacher-1/information-card/print');
    expect(screen.getByRole('alert').textContent).toContain('السنة الدراسية غير صالحة');
    expect((screen.getByRole('button', { name: 'طباعة' }) as HTMLButtonElement).disabled).toBe(true);
    expect(getTeacherInformationCard).not.toHaveBeenCalled();
    unmount();
    renderPrint('/app/teachers/teacher-1/information-card/print?academicYear=2026-2028');
    expect((screen.getByRole('button', { name: 'طباعة' }) as HTMLButtonElement).disabled).toBe(true);
    expect(getTeacherInformationCard).not.toHaveBeenCalled();
  });

  it('shows generic safe failure and never renders printable card content on API error', async () => {
    getTeacherInformationCard.mockRejectedValueOnce(new Error('SQL path secret'));
    renderPrint();
    expect(await screen.findByRole('heading', { name: 'تعذر عرض بطاقة المعلومات' })).toBeTruthy();
    expect(screen.queryByText('SQL path secret')).toBeNull();
    expect(screen.queryByText('صورة شمسية')).toBeNull();
    expect((screen.getByRole('button', { name: 'طباعة' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
