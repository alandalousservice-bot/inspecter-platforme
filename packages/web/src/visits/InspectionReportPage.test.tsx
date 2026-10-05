import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ApiRequestError } from '../auth/client';
import { InspectionReportPage } from './InspectionReportPage';

const mocks = vi.hoisted(() => ({ getInspectionReport: vi.fn(), getPedagogicalVisit: vi.fn(), saveInspectionReport: vi.fn(), finalizeInspectionReport: vi.fn(), listReportFollowUps: vi.fn(), createFollowUp: vi.fn() }));
vi.mock('../auth/client', async (importOriginal) => ({ ...(await importOriginal<typeof import('../auth/client')>()), ...mocks }));

const visit = { id: '55555555-5555-4555-8555-555555555555', districtId: '11111111-1111-4111-8111-111111111111',
  teacher: { id: '44444444-4444-4444-8444-444444444444', name: 'ليلى', surname: 'علي' }, institution: { id: '33333333-3333-4333-8333-333333333333', name: 'ابتدائية النور' },
  academicYear: '2026-2027', visitType: null, scheduledStartAt: '2026-10-15T08:30:00.000Z', scheduledEndAt: '2026-10-15T09:30:00.000Z',
  actualStartAt: null, actualEndAt: null, intervalKind: 'SCHEDULED' as const, visitTypeEditable: true, occurredAt: null, status: 'PLANNED' as const, revision: 1, createdAt: '', updatedAt: '' };
const report = { id: '66666666-6666-4666-8666-666666666666', visitId: visit.id, reportType: 'PEDAGOGICAL_ACCOMPANIMENT' as const,
  templateSource: 'INSPECTOR_AUTHORED' as const, templateVersion: 1 as const, status: 'DRAFT' as const, revision: 1,
  levelClass: null, lessonTopic: null, pedagogicalObservations: null, strengths: null, improvementAreas: null, guidanceRecommendations: null,
  inspectorConclusion: null, finalizedAt: null, finalizedByInspectorId: null, finalizedInspectorNameSnapshot: null, finalizedInspectorSurnameSnapshot: null,
  finalizedTeacherNameSnapshot: null, finalizedTeacherSurnameSnapshot: null, createdAt: '', updatedAt: '', displayIdentity: { inspector: null, teacher: visit.teacher },
  visit: { id: visit.id, status: visit.status, academicYear: visit.academicYear, scheduledStartAt: visit.scheduledStartAt, scheduledEndAt: visit.scheduledEndAt, occurredAt: null, institution: visit.institution, teacher: { id: visit.teacher.id } } };

function renderRoute() {
  return render(<MemoryRouter initialEntries={[`/app/visits/${visit.id}/report`]}><Routes><Route path="/app/visits/:id/report" element={<InspectionReportPage />} /></Routes></MemoryRouter>);
}
beforeEach(() => {
  mocks.getPedagogicalVisit.mockResolvedValue({ data: { visit } });
  mocks.getInspectionReport.mockResolvedValue({ data: { report: null } });
  mocks.saveInspectionReport.mockImplementation(async (_id, input) => ({ data: { report: { ...report, ...input, status: 'DRAFT', revision: input.expectedRevision === null ? 1 : input.expectedRevision + 1 } } }));
  mocks.finalizeInspectionReport.mockResolvedValue({ data: { report: { ...report, status: 'FINAL', revision: 2, levelClass: 'السنة الرابعة', lessonTopic: 'الألعاب', inspectorConclusion: 'خلاصة', finalizedAt: '2026-10-01T00:00:00.000Z', finalizedInspectorNameSnapshot: 'مفتش', finalizedInspectorSurnameSnapshot: 'تجريبي', finalizedTeacherNameSnapshot: 'ليلى', finalizedTeacherSurnameSnapshot: 'علي', displayIdentity: { inspector: { name: 'مفتش', surname: 'تجريبي' }, teacher: visit.teacher } } } });
  mocks.listReportFollowUps.mockResolvedValue({ data: [], page: { limit: 25, nextCursor: null, total: 0 } });
  mocks.createFollowUp.mockResolvedValue({ data: { followUp: { id: 'fu-1', note: 'تحقق من التطبيق', dueDate: '2026-10-10', status: 'OPEN', alertState: 'NONE' } } });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; this.dispatchEvent(new Event('close')); } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('TASK-052 report UI', () => {
  it('presents a bounded DOCUMENT with historical context, existing navigation and intact long prose', async () => {
    const long = 'ملاحظة بيداغوجية طويلة للمرافقة دون توليد أو تغيير. '.repeat(40);
    mocks.getInspectionReport.mockResolvedValue({ data: { report: { ...report, pedagogicalObservations: long } } });
    const { container } = renderRoute(); await screen.findByRole('heading', { name: 'محتوى التقرير' });
    expect(container.querySelector('[data-density="document"]')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText(visit.institution.name)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ملف الأستاذ' }).getAttribute('href')).toBe(`/app/teachers/${visit.teacher.id}`);
    expect(screen.getByRole('link', { name: 'العودة إلى الزيارة' }).getAttribute('href')).toBe(`/app/visits/${visit.id}`);
    expect(screen.getByRole('textbox', { name: 'الملاحظات البيداغوجية' })).toHaveProperty('value', long);
    expect(screen.queryByText(/الوزارة|وزارة|العلامة البيداغوجية/u)).toBeNull();
    expect(mocks.createFollowUp).not.toHaveBeenCalled();
  });
  it('keeps the supported loading and safe load-error presentations', async () => {
    mocks.getPedagogicalVisit.mockReturnValueOnce(new Promise(() => undefined)); renderRoute();
    expect(screen.getByText('جارٍ تحميل التقرير…')).toBeTruthy();
    cleanup(); mocks.getPedagogicalVisit.mockRejectedValueOnce(new Error('private connection detail')); renderRoute();
    expect(await screen.findByText('تعذر تحميل التقرير')).toBeTruthy();
    expect(screen.queryByText('private connection detail')).toBeNull();
  });

  it('starts with seven accessible fields in RTL and only persists on explicit save', async () => {
    const { container } = renderRoute();
    await screen.findByRole('heading', { name: 'محتوى التقرير' });
    expect(container.querySelector('.report-page')?.getAttribute('dir')).toBe('rtl');
    expect(container.querySelector('.accompaniment-workspace')).toBeTruthy();
    expect(screen.getByText('وثيقة مهنية من إعداد المفتش')).toBeTruthy();
    expect(screen.getByText('تقرير من إعداد المفتش — غير رسمي')).toBeTruthy();
    expect(screen.getAllByRole('textbox')).toHaveLength(7);
    expect(await screen.findByRole('heading', { name: /سياق الحصة/u })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /الملاحظات والتوجيه المهني/u })).toBeTruthy();
    const fieldOrder = Array.from(container.querySelectorAll('.report-field input, .report-field textarea')).map((field) => field.id);
    expect(fieldOrder).toEqual(['report-levelClass', 'report-lessonTopic', 'report-pedagogicalObservations', 'report-strengths', 'report-improvementAreas', 'report-guidanceRecommendations', 'report-inspectorConclusion']);
    expect(screen.getByText('لم يُحفظ بعد')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /طباعة|PDF|توقيع/u })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: /المستوى/u }), { target: { value: 'السنة الرابعة' } });
    expect(mocks.saveInspectionReport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'حفظ المسودة' }));
    await waitFor(() => expect(mocks.saveInspectionReport).toHaveBeenCalledTimes(1));
    expect(mocks.saveInspectionReport.mock.calls[0][1]).toMatchObject({ expectedRevision: null, levelClass: 'السنة الرابعة', lessonTopic: null });
    expect(await screen.findByText('تم حفظ المسودة.')).toBeTruthy();
  });

  it('preserves local content on revision conflict and only reloads after explicit confirmation', async () => {
    mocks.getInspectionReport.mockResolvedValue({ data: { report } });
    mocks.saveInspectionReport.mockRejectedValue(new ApiRequestError('opaque', undefined, 409, 'REPORT_REVISION_CONFLICT'));
    renderRoute(); await screen.findByRole('heading', { name: 'محتوى التقرير' });
    const level = screen.getByRole('textbox', { name: /المستوى/u });
    fireEvent.change(level, { target: { value: 'كتابة محلية' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ المسودة' }));
    expect(await screen.findByText(/بقيت كتابتك الحالية كما هي/u)).toBeTruthy();
    expect(level).toHaveProperty('value', 'كتابة محلية');
    fireEvent.click(screen.getByRole('button', { name: 'مراجعة النسخة الأحدث' }));
    fireEvent.click(screen.getByRole('button', { name: 'الاحتفاظ بكتابتي' }));
    expect(level).toHaveProperty('value', 'كتابة محلية');
  });

  it('requires final minimum content, confirmation, and renders final snapshots read-only', async () => {
    mocks.getPedagogicalVisit.mockResolvedValue({ data: { visit: { ...visit, status: 'COMPLETED' } } });
    mocks.getInspectionReport.mockResolvedValue({ data: { report } });
    renderRoute(); await screen.findByRole('heading', { name: 'محتوى التقرير' });
    expect((screen.getByRole('button', { name: 'اعتماد التقرير النهائي' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: /المستوى/u }), { target: { value: 'السنة الرابعة' } });
    fireEvent.change(screen.getByRole('textbox', { name: /موضوع الحصة/u }), { target: { value: 'الألعاب' } });
    fireEvent.change(screen.getByRole('textbox', { name: /خلاصة المفتش/u }), { target: { value: 'خلاصة' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ المسودة' }));
    await waitFor(() => expect(mocks.saveInspectionReport).toHaveBeenCalled());
    // Re-render with the authoritative persisted draft and confirm finalization.
    mocks.getInspectionReport.mockResolvedValue({ data: { report: { ...report, levelClass: 'السنة الرابعة', lessonTopic: 'الألعاب', inspectorConclusion: 'خلاصة' } } });
    cleanup(); renderRoute(); await screen.findByRole('heading', { name: 'محتوى التقرير' });
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد التقرير النهائي' }));
    expect(await screen.findByText(/ليس توقيعًا رقميًا/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الاعتماد النهائي' }));
    expect(await screen.findByText('تم اعتماد التقرير النهائي، وأصبح للقراءة فقط.')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /المستوى/u })).toHaveProperty('readOnly', true);
    expect(screen.queryByRole('button', { name: 'حفظ المسودة' })).toBeNull();
    expect(screen.queryByText(/طباعة|توقيع رقمي|درجة/u)).toBeNull();
  });

  it('keeps a cancelled draft read-only and exposes no finalize action', async () => {
    mocks.getPedagogicalVisit.mockResolvedValue({ data: { visit: { ...visit, status: 'CANCELLED' } } });
    mocks.getInspectionReport.mockResolvedValue({ data: { report: { ...report, visit: { ...report.visit, status: 'CANCELLED' } } } });
    renderRoute(); await screen.findByText('الزيارة ملغاة. تبقى المسودة المحفوظة للقراءة فقط.');
    expect(screen.getByRole('textbox', { name: /المستوى/u })).toHaveProperty('readOnly', true);
    expect(screen.queryByRole('button', { name: 'حفظ المسودة' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'اعتماد التقرير النهائي' })).toBeNull();
  });

  it('rejects over-limit content locally without sending it to the API', async () => {
    renderRoute(); await screen.findByRole('heading', { name: 'محتوى التقرير' });
    const field = screen.getByRole('textbox', { name: /المستوى/u });
    fireEvent.change(field, { target: { value: '😀'.repeat(101) } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ المسودة' }));
    expect(await screen.findByText('الحد الأقصى 100 محرفًا.')).toBeTruthy();
    expect(mocks.saveInspectionReport).not.toHaveBeenCalled();
  });

  it('shows a safe retry message when draft saving fails and does not expose internals', async () => {
    mocks.saveInspectionReport.mockRejectedValue(new ApiRequestError('secret database detail', undefined, 500, 'INTERNAL_ERROR'));
    renderRoute(); await screen.findByRole('heading', { name: 'محتوى التقرير' });
    fireEvent.change(screen.getByRole('textbox', { name: /المستوى/u }), { target: { value: 'السنة الرابعة' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ المسودة' }));
    expect(await screen.findByText('تعذر حفظ المسودة. راجع البيانات أو حدّث النسخة قبل المتابعة.')).toBeTruthy();
    expect(screen.queryByText(/secret database detail|INTERNAL_ERROR/u)).toBeNull();
    expect(screen.getByRole('textbox', { name: /المستوى/u })).toHaveProperty('value', 'السنة الرابعة');
  });

  it('links to professional identity when finalization is blocked by incomplete identity', async () => {
    mocks.getPedagogicalVisit.mockResolvedValue({ data: { visit: { ...visit, status: 'COMPLETED' } } });
    mocks.getInspectionReport.mockResolvedValue({ data: { report: { ...report, levelClass: 'السنة الرابعة', lessonTopic: 'الألعاب', inspectorConclusion: 'خلاصة' } } });
    mocks.finalizeInspectionReport.mockRejectedValue(new ApiRequestError('opaque', undefined, 409, 'INSPECTOR_PROFESSIONAL_IDENTITY_REQUIRED'));
    renderRoute(); await screen.findByRole('heading', { name: 'محتوى التقرير' });
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد التقرير النهائي' }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الاعتماد النهائي' }));
    expect(await screen.findByRole('link', { name: 'إكمال الهوية المهنية' })).toHaveProperty('href', expect.stringContaining('/app/me/professional-identity'));
  });

  it('offers independent follow-up creation only after report is final', async () => {
    mocks.getPedagogicalVisit.mockResolvedValue({ data: { visit: { ...visit, status: 'COMPLETED' } } });
    mocks.getInspectionReport.mockResolvedValue({ data: { report: { ...report, status: 'FINAL', revision: 2, levelClass: 'السنة الرابعة', lessonTopic: 'الألعاب', inspectorConclusion: 'خلاصة', finalizedAt: '2026-10-01T00:00:00.000Z', finalizedByInspectorId: 'inspector', finalizedInspectorNameSnapshot: 'مفتش', finalizedInspectorSurnameSnapshot: 'تجريبي', finalizedTeacherNameSnapshot: 'ليلى', finalizedTeacherSurnameSnapshot: 'علي' } } });
    renderRoute(); await screen.findByRole('heading', { name: 'إجراءات المتابعة' });
    expect(mocks.listReportFollowUps).toHaveBeenCalledWith(report.id);
    fireEvent.click(screen.getByRole('button', { name: 'إضافة إجراء متابعة' }));
    fireEvent.change(screen.getByLabelText('الإجراء المطلوب'), { target: { value: 'تحقق من التطبيق' } });
    fireEvent.change(screen.getByLabelText('تاريخ الاستحقاق'), { target: { value: '2026-10-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الإجراء' }));
    await waitFor(() => expect(mocks.createFollowUp).toHaveBeenCalledWith(report.id, { note: 'تحقق من التطبيق', dueDate: '2026-10-10' }));
    expect(await screen.findByText('تحقق من التطبيق')).toBeTruthy();
  });
});
