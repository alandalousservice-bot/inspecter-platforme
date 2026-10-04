import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import {
  getInspectionReportReadModel,
  getInspectorVisitCriteria,
  type InspectorVisitCriterion,
  type InspectorVisitReport,
} from '../auth/client';
import { ErrorState, LoadingState } from '../ui';
import { visitTypeLabels } from './visit-type-labels';
import './inspector-visit-report-print.css';

const PRINT_BODY_CLASS = 'visit-report-print-active';
const unavailable = '—';
const dateLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat('ar-DZ', { dateStyle: 'short', timeZone: 'Africa/Algiers' }).format(new Date(value))
  : unavailable;
const dateOnly = (value: string | null) => value ? <bdi dir="ltr">{value}</bdi> : unavailable;
const display = (value: string | number | null | undefined) => value === null || value === undefined || value === '' ? unavailable : value;

function Fact({ label, value, className = '' }: { label: string; value: ReactNode; className?: string }) {
  return <div className={`visit-report-print__fact${className ? ` ${className}` : ''}`}>
    <dt>{label}</dt><dd><bdi dir="auto">{value}</bdi></dd>
  </div>;
}

function CriteriaBlock({ title, criteria, report }: { title: string; criteria: InspectorVisitCriterion[]; report: InspectorVisitReport }) {
  const observations = new Map(report.inspectorVisitV1.observations.map((item) => [item.criterionKey, item.valueText]));
  return <section className="visit-report-print__criteria-block">
    <h3>{title}</h3>
    <dl>{criteria.map((criterion) => <div className="visit-report-print__criterion" key={criterion.criterionKey}>
      <dt>{criterion.label}</dt><dd><bdi dir="auto">{observations.get(criterion.criterionKey) ?? ''}</bdi></dd>
    </div>)}</dl>
  </section>;
}

function Narrative({ title, children }: { title: string; children: string | null }) {
  return <section className="visit-report-print__narrative">
    <h3>{title}</h3>
    <p>{children?.trim() ? children : <span aria-label="لا توجد كتابة">&nbsp;</span>}</p>
  </section>;
}

export function InspectorVisitReportPrintDocument({ report, criteria }: { report: InspectorVisitReport; criteria: InspectorVisitCriterion[] }) {
  const fields = report.inspectorVisitV1;
  const final = report.status === 'FINAL';
  const teacherName = final
    ? `${report.finalizedTeacherNameSnapshot ?? ''} ${report.finalizedTeacherSurnameSnapshot ?? ''}`.trim()
    : `${report.displayIdentity.teacher.name} ${report.displayIdentity.teacher.surname}`.trim();
  const inspectorName = final
    ? `${report.finalizedInspectorNameSnapshot ?? ''} ${report.finalizedInspectorSurnameSnapshot ?? ''}`.trim()
    : `${report.displayIdentity.inspector?.name ?? ''} ${report.displayIdentity.inspector?.surname ?? ''}`.trim();
  const criterionGroups = (keys: string[]) => keys.map((key) => {
    const members = criteria.filter((item) => item.sectionKey === key);
    const labels: Record<string, string> = {
      FACILITY_SAFETY: 'صلاحية الميدان', PREPARATION_PLANNING: 'تحضير الدرس والتوزيع السنوي',
      LESSON_PROGRESSION: 'التطبيق وسير الحصة', PEDAGOGICAL_SUPERVISION: 'تقدير الإشراف على الحصة',
      DOCUMENT_MONITORING: 'الدفتر اليومي', STUDENT_MONITORING: 'مراقبة أعمال التلاميذ',
    };
    return <CriteriaBlock key={key} title={labels[key]} criteria={members} report={report} />;
  });
  const mark = report.displayContext.visitType === 'PROMOTION_EVALUATION'
    ? fields.pedagogicalMark
    : fields.markText;

  return <div className="visit-report-print-route" dir="rtl">
    <nav className="visit-report-print__controls" aria-label="إجراءات الطباعة">
      <Link to={`/app/visits/${encodeURIComponent(report.visitId)}/report`}>العودة إلى التقرير</Link>
      <p>الطباعة: ورق A4، عمودي، مقياس 100%، مع إيقاف رؤوس وتذييلات المتصفح.</p>
      <button type="button" onClick={() => window.print()}>طباعة التقرير</button>
    </nav>
    <main className="visit-report-print__document" lang="ar" dir="rtl" aria-label="نموذج تقرير زيارة معتمد للمنصة">
      <article className="visit-report-print__sheet visit-report-print__sheet--first">
        <header className="visit-report-print__administrative-header">
          <p className="visit-report-print__republic">الجمهورية الجزائرية الديمقراطية الشعبية</p>
          <p className="visit-report-print__ministry">وزارة التربية الوطنية</p>
          <div className="visit-report-print__header-columns">
            <div><p>مديرية التربية لولاية: <bdi dir="auto">{display(fields.educationDirectorateText)}</bdi></p>
              <p>المؤسسة: <bdi dir="auto">{display(report.visit.institution.name)}</bdi></p>
              <p>البلدية: <bdi dir="auto">{display(report.displayContext.institutionMunicipality)}</bdi></p></div>
            <div><p>مفتشية التعليم الابتدائي</p>
              <p>المقاطعة: <bdi dir="auto">{display(report.displayContext.districtName)}</bdi></p>
              <p>السنة الدراسية: <bdi dir="ltr">{report.visit.academicYear}</bdi></p></div>
          </div>
          <div className="visit-report-print__title-box"><h1>التقرير التربوي</h1><p>لأستاذ التعليم الابتدائي</p></div>
          <p className="visit-report-print__subject">المادة: التربية البدنية والرياضية</p>
        </header>

        <section className="visit-report-print__identity" aria-label="المعلومات المهنية للأستاذ وسياق الزيارة">
          <dl className="visit-report-print__facts">
            <Fact label="الاسم واللقب" value={display(teacherName)} />
            <Fact label="تاريخ ومكان الميلاد" value={<>{dateOnly(report.displayContext.teacherBirthDate)} — {display(report.displayContext.teacherPlaceOfBirth)}</>} />
            <Fact label="الصنف / الصفة" value={display(fields.teacherClassificationText)} />
            <Fact label="الدرجة" value={display(fields.teacherGradeText)} />
            <Fact label="الجنسية" value={display(fields.teacherNationalityText)} />
            <Fact label="تاريخ التعيين" value={display(fields.teacherAppointmentText)} />
            <Fact label="تاريخ السريان" value={display(fields.teacherEffectiveDateText)} />
            <Fact label="الإطار المهني" value={display(fields.teacherProfessionalFrameworkText)} />
            <Fact label="المؤهل العلمي" value={display(report.displayContext.teacherQualifications)} />
            <Fact label="آخر تفتيش" value={display(fields.teacherLastInspectionText)} />
            <Fact label="تاريخ التفتيش" value={dateLabel(report.visit.occurredAt)} />
            <Fact label="المفتش" value={display(inspectorName)} />
            <Fact label="العلامة" value={<bdi dir="ltr">{display(mark)}</bdi>} />
            <Fact label="نوع الزيارة" value={visitTypeLabels[report.displayContext.visitType]} />
          </dl>
        </section>

        <section className="visit-report-print__lesson-context" aria-label="ظروف التفتيش وسياق الحصة">
          <h2>ظروف التفتيش وتحضير الدرس</h2>
          <dl className="visit-report-print__facts visit-report-print__facts--compact">
            <Fact label="مدة الحصة" value={display(fields.actualLessonDurationText)} />
            <Fact label="القسم" value={display(report.levelClass)} />
            <Fact label="عدد التلاميذ" value={display(fields.studentCount)} />
            <Fact label="الميدان / موضوع الحصة" value={display(report.lessonTopic)} />
            <Fact label="هدف الدرس" value={display(fields.lessonObjective)} />
          </dl>
        </section>

        <section className="visit-report-print__page-one-criteria" aria-label="معايير الملاحظة في الصفحة الأولى">
          {criterionGroups(['FACILITY_SAFETY', 'PREPARATION_PLANNING', 'LESSON_PROGRESSION', 'PEDAGOGICAL_SUPERVISION'])}
        </section>
        <footer className="visit-report-print__page-number">نموذج تقرير زيارة معتمد للمنصة <span>١</span></footer>
      </article>

      <article className="visit-report-print__sheet visit-report-print__sheet--second">
        <section className="visit-report-print__continuation" aria-label="متابعة التلاميذ والوثائق البيداغوجية">
          {criterionGroups(['DOCUMENT_MONITORING', 'STUDENT_MONITORING'])}
        </section>
        <section className="visit-report-print__guidance" aria-label="الإرشادات التربوية والخلاصة">
          <h2>الإرشادات التربوية</h2>
          <p className="visit-report-print__intro">ملاحظات المفتش وتوجيهاته التربوية خلال الزيارة</p>
          <Narrative title="التوجيهات التربوية" children={fields.pedagogicalGuidanceText} />
          <Narrative title="الجانب الميداني العملي" children={fields.practicalGuidanceText} />
        </section>
        <section className="visit-report-print__conclusion" aria-label="الخلاصة والتقدير العام">
          <Narrative title="الخلاصة" children={report.inspectorConclusion} />
          {fields.visitStrengthsText ? <Narrative title="نقاط القوة" children={fields.visitStrengthsText} /> : null}
          {fields.visitImprovementAreasText ? <Narrative title="جوانب التحسين" children={fields.visitImprovementAreasText} /> : null}
          <dl className="visit-report-print__outcome-facts">
            <Fact label="التقدير العام" value={display(fields.generalAssessmentText)} />
            <Fact label="العلامة بالأرقام" value={<bdi dir="ltr">{display(mark)}</bdi>} />
            {report.displayContext.visitType !== 'PROMOTION_EVALUATION' ? <Fact label="العلامة بالحروف" value={display(fields.markWordsText)} /> : null}
          </dl>
        </section>
        <footer className="visit-report-print__signature-area">
          <div><p>حرر من طرف مفتش التربية البدنية والرياضية</p><p>السيد: <bdi dir="auto">{display(inspectorName)}</bdi></p>
            <p>بتاريخ: <bdi dir="auto">{dateLabel(final ? report.finalizedAt : report.visit.occurredAt)}</bdi></p>
            <div className="visit-report-print__signature-line">الإمضاء</div></div>
          <div className="visit-report-print__stamp">الختم</div>
        </footer>
        <footer className="visit-report-print__page-number">نموذج تقرير زيارة معتمد للمنصة <span>٢</span></footer>
      </article>
    </main>
  </div>;
}

export function InspectorVisitReportPrintPage() {
  const { id = '' } = useParams();
  const [report, setReport] = useState<InspectorVisitReport | null>(null);
  const [criteria, setCriteria] = useState<InspectorVisitCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    document.body.classList.add(PRINT_BODY_CLASS);
    let active = true;
    Promise.all([getInspectionReportReadModel(id), getInspectorVisitCriteria()])
      .then(([result, template]) => {
        if (!active) return;
        if (result.data.report?.reportType !== 'INSPECTOR_VISIT') { setFailed(true); return; }
        setReport(result.data.report);
        setCriteria(template.data.criteria);
      })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; document.body.classList.remove(PRINT_BODY_CLASS); };
  }, [id]);

  if (loading) return <div className="visit-report-print-route"><LoadingState label="جارٍ تحميل التقرير للطباعة…" /></div>;
  if (failed || !report) return <div className="visit-report-print-route"><ErrorState title="تعذر تحميل تقرير الزيارة" description="لا يتوفر تقرير زيارة محفوظ للطباعة. ارجع إلى التقرير وتحقق من صلاحية الوصول." /></div>;
  return <InspectorVisitReportPrintDocument report={report} criteria={criteria} />;
}
