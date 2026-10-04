import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { InspectorVisitReport, InspectorVisitCriterion } from '../auth/client';
import { InspectorVisitReportPrintPage } from './InspectorVisitReportPrintPage';

const mocks = vi.hoisted(() => ({ getInspectionReportReadModel: vi.fn(), getInspectorVisitCriteria: vi.fn() }));
vi.mock('../auth/client', async (importOriginal) => ({ ...(await importOriginal<typeof import('../auth/client')>()), ...mocks }));

const criteria: InspectorVisitCriterion[] = [
  { criterionKey: 'field_planning', sectionKey: 'FACILITY_SAFETY', sourceOrder: 1, label: 'الميدان: التخطيط', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'daily_notebook_use', sectionKey: 'DOCUMENT_MONITORING', sourceOrder: 21, label: 'دفتر اليومي', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'absences_monitored', sectionKey: 'STUDENT_MONITORING', sourceOrder: 22, label: 'مراقبة الغيابات', valueKind: 'OPTIONAL_SHORT_TEXT' },
];
const report: InspectorVisitReport = {
  id: 'report-id', visitId: 'visit-id', reportType: 'INSPECTOR_VISIT', templateSource: 'PRODUCT_OWNER_ADOPTED', templateVersion: 1,
  status: 'FINAL', revision: 2, levelClass: 'السنة الخامسة', lessonTopic: 'الألعاب الجماعية', pedagogicalObservations: null,
  strengths: null, improvementAreas: null, guidanceRecommendations: null, inspectorConclusion: 'خلاصة التقرير', finalizedAt: '2026-10-02T09:00:00.000Z',
  finalizedByInspectorId: 'inspector-id', finalizedInspectorNameSnapshot: 'مفتش', finalizedInspectorSurnameSnapshot: 'تجريبي',
  finalizedTeacherNameSnapshot: 'سلمى', finalizedTeacherSurnameSnapshot: 'أمين', createdAt: '', updatedAt: '',
  displayIdentity: { inspector: { name: 'مفتش', surname: 'تجريبي' }, teacher: { name: 'سلمى', surname: 'أمين' } },
  visit: { id: 'visit-id', status: 'COMPLETED', academicYear: '2026-2027', scheduledStartAt: null, scheduledEndAt: null,
    actualStartAt: '2026-10-02T08:00:00.000Z', actualEndAt: '2026-10-02T09:00:00.000Z', occurredAt: '2026-10-02T09:00:00.000Z',
    intervalKind: 'ACTUAL_RETROSPECTIVE', visitType: 'PROMOTION_EVALUATION', institution: { id: 'institution-id', name: 'ابتدائية الأمل' }, teacher: { id: 'teacher-id' } },
  inspectorVisitV1: {
    educationDirectorateText: 'ولاية تجريبية', administrativeDivisionText: 'دائرة النور', teacherClassificationText: 'الصنف 12',
    teacherGradeText: 'الدرجة 3', teacherNationalityText: 'جزائرية', teacherEffectiveDateText: '2025-09-01', teacherLastInspectionText: null,
    teacherAppointmentText: 'تعيين اختباري', teacherProfessionalFrameworkText: 'أستاذ تعليم ابتدائي', actualLessonDurationText: '45 دقيقة',
    studentCount: 28, studentsPresentCount: 26, studentsAbsentCount: 2, lessonObjective: 'تنمية التعاون', pedagogicalGuidanceText: 'توجيه تجريبي',
    practicalGuidanceText: 'جانب ميداني تجريبي', visitStrengthsText: 'نقطة قوة', visitImprovementAreasText: 'جانب تحسين', tenureConclusionText: null,
    generalAssessmentText: 'جيد جدًا', markText: null, markWordsText: null, pedagogicalMark: '14.25',
    observations: [{ criterionKey: 'field_planning', valueText: 'قيمة اختبار عربية للحقل' }, { criterionKey: 'daily_notebook_use', valueText: 'تعبئة اختبارية' }],
  },
  displayContext: { teacherBirthDate: '1990-05-13', teacherPlaceOfBirth: 'مدينة تجريبية', teacherQualifications: 'شهادة جامعية', districtName: 'مقاطعة تجريبية', institutionMunicipality: 'بلدية النور', visitType: 'PROMOTION_EVALUATION' },
};

function renderRoute() {
  return render(<MemoryRouter initialEntries={['/app/visits/visit-id/report/print']}><Routes>
    <Route path="/app/visits/:id/report/print" element={<InspectorVisitReportPrintPage />} />
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getInspectionReportReadModel.mockResolvedValue({ data: { report } });
  mocks.getInspectorVisitCriteria.mockResolvedValue({ data: { criteria } });
});
afterEach(() => { cleanup(); document.body.classList.remove('visit-report-print-active'); });

describe('Visit Report V1 print route', () => {
  it('renders two source-ordered A4 sheets with existing report data and no invented values', async () => {
    const { container } = renderRoute();
    expect(await screen.findByRole('main', { name: 'نموذج تقرير زيارة معتمد للمنصة' })).toBeTruthy();
    expect(container.querySelectorAll('.visit-report-print__sheet')).toHaveLength(2);
    expect(screen.getByText('الجمهورية الجزائرية الديمقراطية الشعبية')).toBeTruthy();
    expect(screen.getByText('ابتدائية الأمل')).toBeTruthy();
    expect(screen.getByText('سلمى أمين')).toBeTruthy();
    expect(screen.getAllByText('14.25')).toHaveLength(2);
    expect(screen.getByText('قيمة اختبار عربية للحقل')).toBeTruthy();
    expect(screen.getByText('تعبئة اختبارية')).toBeTruthy();
    expect(container.querySelectorAll('.visit-report-print__criterion')).toHaveLength(criteria.length);
    expect(screen.getByText('خلاصة التقرير')).toBeTruthy();
    expect(screen.getByText('الإمضاء')).toBeTruthy();
    expect(screen.getByText('الختم')).toBeTruthy();
    expect(document.body.classList.contains('visit-report-print-active')).toBe(true);
    expect(mocks.getInspectionReportReadModel).toHaveBeenCalledWith('visit-id');
  });

  it('keeps promotion marks manual and omits the non-applicable textual mark fields', async () => {
    renderRoute();
    await screen.findByRole('main', { name: 'نموذج تقرير زيارة معتمد للمنصة' });
    expect(screen.getAllByText('14.25')).toHaveLength(2);
    expect(screen.queryByText('العلامة بالحروف')).toBeNull();
    expect(screen.queryByText('العلامة النصية')).toBeNull();
  });

  it('does not render a legacy or missing report with the adopted template', async () => {
    mocks.getInspectionReportReadModel.mockResolvedValueOnce({ data: { report: null } });
    renderRoute();
    expect(await screen.findByRole('heading', { name: 'تعذر تحميل تقرير الزيارة' })).toBeTruthy();
    expect(document.querySelector('.visit-report-print__document')).toBeNull();
  });
});
