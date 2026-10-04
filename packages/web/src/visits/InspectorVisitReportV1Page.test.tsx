import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ApiRequestError } from '../auth/client';
import { InspectionReportPage } from './InspectionReportPage';

const mocks = vi.hoisted(() => ({
  getInspectionReport: vi.fn(), getPedagogicalVisit: vi.fn(), getInspectorVisitCriteria: vi.fn(),
  saveInspectorVisitReport: vi.fn(), finalizeInspectorVisitReport: vi.fn(), listReportFollowUps: vi.fn(),
  createFollowUp: vi.fn(), patchFollowUp: vi.fn(),
}));
vi.mock('../auth/client', async (importOriginal) => ({ ...(await importOriginal<typeof import('../auth/client')>()), ...mocks }));

const typedVisit = {
  id: '55555555-5555-4555-8555-555555555555', districtId: '11111111-1111-4111-8111-111111111111',
  teacher: { id: '44444444-4444-4444-8444-444444444444', name: 'ليلى', surname: 'علي' },
  institution: { id: '33333333-3333-4333-8333-333333333333', name: 'ابتدائية النور' }, academicYear: '2026-2027',
  visitType: 'PROMOTION_EVALUATION' as const, scheduledStartAt: '2026-10-15T08:30:00.000Z', scheduledEndAt: '2026-10-15T09:30:00.000Z',
  actualStartAt: null, actualEndAt: null, intervalKind: 'SCHEDULED' as const, visitTypeEditable: false, occurredAt: '2026-10-15T09:30:00.000Z',
  status: 'COMPLETED' as const, revision: 1, createdAt: '', updatedAt: '',
};
const criteria = [
  { criterionKey: 'field_planning', sectionKey: 'FACILITY_SAFETY', sourceOrder: 1, label: 'الميدان: التخطيط', valueKind: 'OPTIONAL_SHORT_TEXT' as const },
  { criterionKey: 'educational_unit_preparation', sectionKey: 'PREPARATION_PLANNING', sourceOrder: 5, label: 'الوحدة التعليمية (قسم التحضير)', valueKind: 'OPTIONAL_SHORT_TEXT' as const },
];

function renderRoute() {
  return render(<MemoryRouter initialEntries={[`/app/visits/${typedVisit.id}/report`]}><Routes>
    <Route path="/app/visits/:id/report" element={<InspectionReportPage />} />
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  if (!HTMLDialogElement.prototype.showModal) {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
  }
  mocks.getPedagogicalVisit.mockResolvedValue({ data: { visit: typedVisit } });
  mocks.getInspectionReport.mockResolvedValue({ data: { report: null } });
  mocks.getInspectorVisitCriteria.mockResolvedValue({ data: { reportType: 'INSPECTOR_VISIT', templateSource: 'PRODUCT_OWNER_ADOPTED', templateVersion: 1, criteria } });
  mocks.listReportFollowUps.mockResolvedValue({ data: [] });
});
afterEach(cleanup);

describe('Inspector Visit Report V1 editor', () => {
  it('opens V1 without a report-type chooser and presents all source-oriented sections in RTL', async () => {
    renderRoute();
    expect(await screen.findByRole('heading', { name: 'تقرير زيارة المفتش — الإصدار الأول' })).toBeTruthy();
    await screen.findByRole('textbox', { name: 'الميدان: التخطيط' });
    expect(document.querySelector('.report-page')?.getAttribute('dir')).toBe('rtl');
    expect(screen.getByText('زيارة الترقية / التقييم')).toBeTruthy();
    for (const title of [
      '1. هوية الزيارة والتقرير', '2. معلومات الأستاذ والوضعية المهنية', '3. ظروف التفتيش وسياق الحصة',
      '4. التحضير والتخطيط', '5. الفضاء والوسائل والسلامة', '6. سير الحصة والملاحظة الميدانية',
      '7. الإشراف البيداغوجي', '8. الوثائق البيداغوجية والدفتر اليومي', '9. متابعة التلاميذ',
      '10. نقاط القوة وجوانب التحسين والإرشادات', '11. الخلاصة والنتيجة المهنية',
    ]) expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: /نوع التقرير/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /طباعة|PDF/u })).toBeNull();
    expect(screen.getByText('لم يُحفظ بعد')).toBeTruthy();
    expect(await screen.findByRole('textbox', { name: 'الميدان: التخطيط' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'الوحدة التعليمية (قسم التحضير)' })).toBeTruthy();
  });

  it('uses dictionary criteria and saves explicitly without autosave', async () => {
    renderRoute(); await screen.findByRole('heading', { name: 'تقرير زيارة المفتش — الإصدار الأول' });
    fireEvent.change(await screen.findByRole('textbox', { name: 'الميدان: التخطيط' }), { target: { value: 'ملاحظة ميدانية' } });
    expect(mocks.saveInspectorVisitReport).not.toHaveBeenCalled();
    mocks.saveInspectorVisitReport.mockResolvedValue({ data: { report: { id: 'report-1', status: 'DRAFT', revision: 1,
      reportType: 'INSPECTOR_VISIT', templateSource: 'PRODUCT_OWNER_ADOPTED', templateVersion: 1,
      levelClass: null, lessonTopic: null, inspectorConclusion: null,
      inspectorVisitV1: { ...Object.fromEntries([
        'educationDirectorateText','administrativeDivisionText','teacherClassificationText','teacherGradeText','teacherNationalityText',
        'teacherEffectiveDateText','teacherLastInspectionText','teacherAppointmentText','teacherProfessionalFrameworkText','actualLessonDurationText',
        'studentCount','studentsPresentCount','studentsAbsentCount','lessonObjective','pedagogicalGuidanceText','practicalGuidanceText',
        'visitStrengthsText','visitImprovementAreasText','tenureConclusionText','generalAssessmentText','markText','markWordsText','pedagogicalMark',
      ].map((key) => [key, null])), observations: [{ criterionKey: 'field_planning', valueText: 'ملاحظة ميدانية' }] },
    } } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ المسودة' }));
    await waitFor(() => expect(mocks.saveInspectorVisitReport).toHaveBeenCalledTimes(1));
    const sent = mocks.saveInspectorVisitReport.mock.calls[0][1];
    expect(sent.expectedRevision).toBeNull(); expect(sent.observations).toEqual([{ criterionKey: 'field_planning', valueText: 'ملاحظة ميدانية' }]);
    expect(await screen.findByText('تم حفظ مسودة التقرير.')).toBeTruthy();
  });

  it('shows the promotion mark only for promotion and keeps it optional', async () => {
    renderRoute(); await screen.findByRole('heading', { name: 'تقرير زيارة المفتش — الإصدار الأول' });
    const mark = await screen.findByRole('textbox', { name: 'العلامة البيداغوجية (اختيارية من 0 إلى 20)' });
    expect(mark).toBeTruthy();
    expect((mark as HTMLInputElement).required).toBe(false);
    expect(mark.closest('.report-field--mark')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'حفظ المسودة' })).toBeTruthy();
    expect(screen.queryByText(/العلامة مطلوبة/u)).toBeNull();
    expect(screen.queryByRole('meter')).toBeNull(); expect(screen.queryByRole('progressbar')).toBeNull();
    for (const value of ['0', '14.5', '20']) {
      fireEvent.change(mark, { target: { value } });
      expect(mark).toHaveProperty('value', value);
    }
  });

  it('preserves dirty content and does not auto-retry after a revision conflict', async () => {
    renderRoute(); await screen.findByRole('heading', { name: 'تقرير زيارة المفتش — الإصدار الأول' });
    const mark = await screen.findByRole('textbox', { name: 'العلامة البيداغوجية (اختيارية من 0 إلى 20)' });
    fireEvent.change(mark, { target: { value: '14.25' } });
    mocks.saveInspectorVisitReport.mockRejectedValueOnce(new ApiRequestError('conflict', undefined, 409, 'REPORT_REVISION_CONFLICT'));
    fireEvent.click(screen.getByRole('button', { name: 'حفظ المسودة' }));
    expect(await screen.findByText(/احتفظنا بكتابتك/u)).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'العلامة البيداغوجية (اختيارية من 0 إلى 20)' })).toHaveProperty('value', '14.25');
    expect(mocks.saveInspectorVisitReport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'تحميل النسخة الأحدث' })).toBeTruthy();
  });
});
