import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ApiRequestError } from '../auth/client';
import { InspectionReportPage } from './InspectionReportPage';
import type { InspectorVisitReport } from '../auth/client';

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

function draftReport(): InspectorVisitReport {
  return {
    id: 'report-1', reportType: 'INSPECTOR_VISIT', templateSource: 'PRODUCT_OWNER_ADOPTED', templateVersion: 1,
    status: 'DRAFT', revision: 1, levelClass: 'السنة الرابعة', lessonTopic: 'التوازن', inspectorConclusion: 'خلاصة عربية طويلة واضحة. '.repeat(30),
    displayIdentity: { inspector: { name: 'مفتش', surname: 'تجريبي' }, teacher: typedVisit.teacher },
    inspectorVisitV1: { ...Object.fromEntries([
      'educationDirectorateText','administrativeDivisionText','teacherClassificationText','teacherGradeText','teacherNationalityText',
      'teacherEffectiveDateText','teacherLastInspectionText','teacherAppointmentText','teacherProfessionalFrameworkText','actualLessonDurationText',
      'studentCount','studentsPresentCount','studentsAbsentCount','lessonObjective','pedagogicalGuidanceText','practicalGuidanceText',
      'visitStrengthsText','visitImprovementAreasText','tenureConclusionText','generalAssessmentText','markText','markWordsText','pedagogicalMark',
    ].map((key) => [key, null])), observations: [] },
  } as unknown as InspectorVisitReport;
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
  it('uses DOCUMENT composition and contextual routes without substituting the Visit institution', async () => {
    mocks.getInspectionReport.mockResolvedValue({ data: { report: draftReport() } });
    const { container } = renderRoute();
    await screen.findByRole('textbox', { name: 'الميدان: التخطيط' });
    expect(container.querySelector('[data-density="document"]')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.querySelectorAll('.v1-report-section')).toHaveLength(11);
    expect(container.querySelector('.v1-report-section .ui-card')).toBeNull();
    expect(screen.getByText(typedVisit.institution.name)).toBeTruthy();
    expect(screen.getByText(`${typedVisit.teacher.name} ${typedVisit.teacher.surname}`)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ملف الأستاذ' }).getAttribute('href')).toBe(`/app/teachers/${typedVisit.teacher.id}`);
    expect(screen.getByRole('link', { name: 'العودة إلى الزيارة' }).getAttribute('href')).toBe(`/app/visits/${typedVisit.id}`);
    expect(screen.getByRole('textbox', { name: 'الخلاصة — مطلوبة للإتمام' })).toHaveProperty('value', draftReport().inspectorConclusion);
    expect(mocks.createFollowUp).not.toHaveBeenCalled();
  });

  it.each(['GUIDANCE', 'TENURE_CONFIRMATION', 'PROMOTION_EVALUATION', 'MONITORING_FOLLOW_UP', 'EXCEPTIONAL'])('preserves the %s type-specific fields', async (visitType) => {
    mocks.getPedagogicalVisit.mockResolvedValue({ data: { visit: { ...typedVisit, visitType } } });
    renderRoute(); await screen.findByRole('textbox', { name: 'الميدان: التخطيط' });
    expect(Boolean(screen.queryByRole('textbox', { name: 'العلامة البيداغوجية (اختيارية من 0 إلى 20)' }))).toBe(visitType === 'PROMOTION_EVALUATION');
    expect(Boolean(screen.queryByRole('textbox', { name: 'الاستنتاج المهني للتثبيت / الترسيم' }))).toBe(visitType === 'TENURE_CONFIRMATION');
    expect(screen.queryByRole('button', { name: 'إضافة إجراء متابعة' })).toBeNull();
  });

  it('requires explicit confirmation, permits no mark, and exposes FINAL read-only with independent follow-up', async () => {
    const draft = draftReport();
    mocks.getInspectionReport.mockResolvedValue({ data: { report: draft } });
    mocks.finalizeInspectorVisitReport.mockResolvedValue({ data: { report: { ...draft, status: 'FINAL', revision: 2,
      finalizedAt: '2026-10-15T10:00:00Z', finalizedInspectorNameSnapshot: 'مفتش', finalizedInspectorSurnameSnapshot: 'تجريبي',
      finalizedTeacherNameSnapshot: 'ليلى', finalizedTeacherSurnameSnapshot: 'علي' } } });
    renderRoute(); await screen.findByRole('textbox', { name: 'الميدان: التخطيط' });
    expect(screen.getByRole('textbox', { name: 'العلامة البيداغوجية (اختيارية من 0 إلى 20)' })).toHaveProperty('value', '');
    expect(screen.getByRole('button', { name: 'حفظ المسودة' }).className).toContain('secondary');
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد التقرير النهائي' }));
    expect(mocks.finalizeInspectorVisitReport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الاعتماد النهائي' }));
    await screen.findByText('نهائي — للقراءة فقط');
    expect(mocks.finalizeInspectorVisitReport).toHaveBeenCalledWith(draft.id, draft.revision);
    expect(screen.getByRole('textbox', { name: 'الخلاصة — مطلوبة للإتمام' })).toHaveProperty('readOnly', true);
    expect(screen.queryByRole('button', { name: 'حفظ المسودة' })).toBeNull();
    expect(mocks.createFollowUp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'إضافة إجراء متابعة' }));
    fireEvent.change(screen.getByLabelText('الإجراء المطلوب'), { target: { value: 'إجراء يدوي' } });
    fireEvent.change(screen.getByLabelText('تاريخ الاستحقاق'), { target: { value: '2026-10-20' } });
    mocks.createFollowUp.mockResolvedValue({ data: { followUp: { id: 'fu-1', note: 'إجراء يدوي', dueDate: '2026-10-20', status: 'OPEN' } } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الإجراء' }));
    await waitFor(() => expect(mocks.createFollowUp).toHaveBeenCalledWith(draft.id, { note: 'إجراء يدوي', dueDate: '2026-10-20' }));
  });

  it.each(['-0.01', '20.01', '14.257', 'غير رقمي'])('keeps API mark validation feedback accessible for %s', async (value) => {
    mocks.saveInspectorVisitReport.mockRejectedValue(new ApiRequestError('opaque', { 'inspectorVisitV1.pedagogicalMark': ['invalid'] }, 400, 'VALIDATION_ERROR'));
    renderRoute(); const mark = await screen.findByRole('textbox', { name: 'العلامة البيداغوجية (اختيارية من 0 إلى 20)' });
    fireEvent.change(mark, { target: { value } }); fireEvent.click(screen.getByRole('button', { name: 'حفظ المسودة' }));
    await screen.findByText('القيمة غير صالحة.');
    expect(mark.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(mark.getAttribute('aria-describedby')!)).toHaveProperty('textContent', 'القيمة غير صالحة.');
    expect(mocks.saveInspectorVisitReport.mock.calls[0][1].inspectorVisitV1.pedagogicalMark).toBe(value);
  });

  it('protects dirty content when navigating to Teacher Profile', async () => {
    renderRoute(); fireEvent.change(await screen.findByRole('textbox', { name: 'الميدان: التخطيط' }), { target: { value: 'كتابة محلية' } });
    fireEvent.click(screen.getByRole('link', { name: 'ملف الأستاذ' }));
    await screen.findByRole('dialog', { name: 'تغييرات غير محفوظة' });
    fireEvent.click(screen.getByRole('button', { name: 'البقاء في الصفحة' }));
    expect(screen.getByRole('textbox', { name: 'الميدان: التخطيط' })).toHaveProperty('value', 'كتابة محلية');
  });

  it('keeps template loading/error separate from an editable document', async () => {
    mocks.getInspectorVisitCriteria.mockReturnValueOnce(new Promise(() => undefined));
    renderRoute(); await screen.findByText('جارٍ تحميل نموذج التقرير…');
    expect(screen.queryByRole('textbox')).toBeNull(); cleanup();
    mocks.getInspectorVisitCriteria.mockRejectedValueOnce(new Error('private detail'));
    renderRoute(); await screen.findByText('تعذر تحميل نموذج التقرير');
    expect(screen.queryByRole('textbox')).toBeNull(); expect(screen.queryByText('private detail')).toBeNull();
  });
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
    expect(screen.queryByRole('link', { name: 'معاينة الطباعة' })).toBeNull();
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
    expect(screen.getByRole('link', { name: 'معاينة الطباعة' }).getAttribute('href')).toBe(`/app/visits/${typedVisit.id}/report/print`);
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
    // Native Dialog.showModal runs in an effect after the conflict feedback renders.
    expect(await screen.findByRole('button', { name: 'تحميل النسخة الأحدث' })).toBeTruthy();
  });
});
