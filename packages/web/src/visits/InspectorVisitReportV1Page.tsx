import { useEffect, useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ApiRequestError, createFollowUp as createFollowUpApi, finalizeInspectorVisitReport, getInspectionReportReadModel, getInspectorVisitCriteria, listReportFollowUps,
  patchFollowUp, saveInspectorVisitReport, type FollowUp, type InspectorVisitCriterion,
  type InspectorVisitReport, type InspectorVisitReportInput, type InspectorVisitV1Fields, type PedagogicalVisit,
} from '../auth/client';
import { Button, Card, CardContent, CardHeader, Dialog, ErrorState, LoadingState, PageHeader, SuccessState } from '../ui';
import { formatAlgiers } from './time';
import { visitTypeLabels } from './visit-type-labels';
import { ShellIcon } from '../ui/ShellIcon';
import './inspection-report.css';
import './inspector-visit-report.css';

type Props = { visit: PedagogicalVisit; initialReport: InspectorVisitReport | null };
type FormInput = Omit<InspectorVisitReportInput, 'expectedRevision'>;
type TextKey = keyof InspectorVisitV1Fields;

const shortFields: Array<{ key: TextKey; label: string; max: number }> = [
  { key: 'educationDirectorateText', label: 'مديرية التربية للولاية', max: 150 },
  { key: 'administrativeDivisionText', label: 'الدائرة', max: 150 },
  { key: 'teacherClassificationText', label: 'الصنف', max: 100 }, { key: 'teacherGradeText', label: 'الدرجة', max: 100 },
  { key: 'teacherNationalityText', label: 'الجنسية', max: 100 }, { key: 'teacherEffectiveDateText', label: 'تاريخ السريان', max: 100 },
  { key: 'teacherLastInspectionText', label: 'آخر تفتيش', max: 150 }, { key: 'teacherAppointmentText', label: 'التعيين', max: 150 },
  { key: 'teacherProfessionalFrameworkText', label: 'الإطار المهني', max: 100 },
  { key: 'actualLessonDurationText', label: 'مدة الحصة الفعلية', max: 100 },
  { key: 'lessonObjective', label: 'هدف الدرس', max: 200 }, { key: 'generalAssessmentText', label: 'التقدير العام', max: 200 },
  { key: 'markText', label: 'العلامة النصية', max: 100 }, { key: 'markWordsText', label: 'العلامة بالحروف', max: 200 },
];
const proseFields: Array<{ key: TextKey; label: string; max: number }> = [
  { key: 'pedagogicalGuidanceText', label: 'الإرشادات والتوجيهات التربوية', max: 4000 },
  { key: 'practicalGuidanceText', label: 'الجانب الميداني العملي', max: 4000 },
  { key: 'visitStrengthsText', label: 'نقاط القوة', max: 4000 },
  { key: 'visitImprovementAreasText', label: 'جوانب التحسين', max: 4000 },
  { key: 'tenureConclusionText', label: 'الاستنتاج المهني للتثبيت / الترسيم', max: 4000 },
];
const emptyV1 = (): InspectorVisitV1Fields => ({
  educationDirectorateText: null, administrativeDivisionText: null, teacherClassificationText: null, teacherGradeText: null,
  teacherNationalityText: null, teacherEffectiveDateText: null, teacherLastInspectionText: null, teacherAppointmentText: null,
  teacherProfessionalFrameworkText: null, actualLessonDurationText: null, studentCount: null, studentsPresentCount: null,
  studentsAbsentCount: null, lessonObjective: null, pedagogicalGuidanceText: null, practicalGuidanceText: null,
  visitStrengthsText: null, visitImprovementAreasText: null, tenureConclusionText: null, generalAssessmentText: null,
  markText: null, markWordsText: null, pedagogicalMark: null,
});
const emptyInput = (): FormInput => ({ levelClass: null, lessonTopic: null, inspectorConclusion: null, inspectorVisitV1: emptyV1(), observations: [] });
function inputFromReport(report: InspectorVisitReport | null): FormInput {
  if (!report) return emptyInput();
  const { observations, ...fields } = report.inspectorVisitV1;
  return {
    levelClass: report.levelClass, lessonTopic: report.lessonTopic, inspectorConclusion: report.inspectorConclusion,
    inspectorVisitV1: fields,
    observations,
  };
}
const codePoints = (value: string) => Array.from(value).length;
const inputText = (value: string | null) => value ?? '';
const optionalText = (value: string) => value.trim() ? value : null;
const studentNumber = (value: string) => value === '' ? null : Number(value);
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString('ar-DZ', { timeZone: 'Africa/Algiers' }) : '—';

function Field({ label, value, max, multiline = false, error, onChange, readOnly = false, type = 'text', inputMode, className = '' }: {
  label: string; value: string; max?: number; multiline?: boolean; error?: string; onChange?: (value: string) => void;
  readOnly?: boolean; type?: string; inputMode?: 'decimal' | 'numeric'; className?: string;
}) {
  const id = `v1-${label.replace(/\s+/gu, '-')}`;
  const helpId = `${id}-help`;
  return <div className={`report-field${className ? ` ${className}` : ''}`}>
    <label htmlFor={id}>{label}</label>
    {multiline
      ? <textarea id={id} className="ui-input report-textarea" value={value} readOnly={readOnly} rows={4}
        aria-invalid={Boolean(error)} aria-describedby={max ? `${helpId}${error ? ` ${helpId}-error` : ''}` : error ? `${helpId}-error` : undefined}
        onChange={(event) => onChange?.(event.currentTarget.value)} />
      : <input id={id} className="ui-input" value={value} readOnly={readOnly} type={type} inputMode={inputMode}
        aria-invalid={Boolean(error)} aria-describedby={max ? `${helpId}${error ? ` ${helpId}-error` : ''}` : error ? `${helpId}-error` : undefined}
        onChange={(event) => onChange?.(event.currentTarget.value)} />}
    {max ? <small id={helpId}>{codePoints(value)} / {max} محرف</small> : null}
    {error ? <span id={`${helpId}-error`} className="report-field__error" role="alert">القيمة غير صالحة.</span> : null}
  </div>;
}

function Section({ number, title, children, action }: { number: number; title: string; children: ReactNode; action?: ReactNode }) {
  return <Card className="v1-report-section" aria-label={`${number}. ${title}`}>
    <CardHeader title={`${number}. ${title}`} action={action ?? <span className="report-context-card__icon"><ShellIcon name="reports" /></span>} />
    <CardContent><div className="v1-report-section__content">{children}</div></CardContent>
  </Card>;
}

export function InspectorVisitReportV1Page({ visit, initialReport }: Props) {
  const [report, setReport] = useState(initialReport);
  const [input, setInput] = useState<FormInput>(() => inputFromReport(initialReport));
  const [criteria, setCriteria] = useState<InspectorVisitCriterion[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [discardDialog, setDiscardDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [followUpDueDate, setFollowUpDueDate] = useState('');
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    Promise.all([getInspectorVisitCriteria(), initialReport?.status === 'FINAL' ? listReportFollowUps(initialReport.id) : Promise.resolve(null)])
      .then(([dictionary, listed]) => {
        if (!mounted) return;
        setCriteria(dictionary.data.criteria);
        if (listed) setFollowUps(listed.data);
      }).catch(() => { if (mounted) setError('تعذر تحميل عناصر التقرير. أعد المحاولة.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [initialReport]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const readOnly = report?.status === 'FINAL' || visit.status === 'CANCELLED';
  const missingRequired = useMemo(() => [
    !input.levelClass?.trim() ? 'المستوى / القسم' : '', !input.lessonTopic?.trim() ? 'موضوع الحصة' : '',
    !input.inspectorConclusion?.trim() ? 'الخلاصة' : '',
  ].filter(Boolean), [input]);
  const visitType = visit.visitType;
  const filteredCriteria = criteria;

  function updateCore(key: 'levelClass' | 'lessonTopic' | 'inspectorConclusion', value: string) {
    setInput((current) => ({ ...current, [key]: value })); setDirty(true); setFieldErrors((current) => ({ ...current, [key]: [] }));
  }
  function updateV1(key: TextKey, value: string) {
    const numeric = key === 'studentCount' || key === 'studentsPresentCount' || key === 'studentsAbsentCount';
    setInput((current) => ({ ...current, inspectorVisitV1: { ...current.inspectorVisitV1, [key]: numeric ? studentNumber(value) : optionalText(value) } }));
    setDirty(true); setFieldErrors((current) => ({ ...current, [`inspectorVisitV1.${key}`]: [] }));
  }
  function updateObservation(key: string, value: string) {
    const normalized = value.trim() ? value : null;
    const observations = input.observations.filter((item) => item.criterionKey !== key);
    if (normalized !== null) observations.push({ criterionKey: key, valueText: normalized });
    setInput((current) => ({ ...current, observations })); setDirty(true);
    setFieldErrors((current) => ({ ...current, observations: [] }));
  }
  function updateMark(value: string) {
    setInput((current) => ({ ...current, inspectorVisitV1: { ...current.inspectorVisitV1, pedagogicalMark: value.trim() ? value : null } }));
    setDirty(true); setFieldErrors((current) => ({ ...current, 'inspectorVisitV1.pedagogicalMark': [] }));
  }
  function numberValue(key: 'studentCount' | 'studentsPresentCount' | 'studentsAbsentCount') {
    const value = input.inspectorVisitV1[key]; return value === null ? '' : String(value);
  }
  function fieldError(key: string) { return fieldErrors[key]?.length ? fieldErrors[key][0] : undefined; }

  async function save(event?: FormEvent) {
    event?.preventDefault(); if (busy || readOnly) return;
    setBusy(true); setError(''); setNotice(''); setFieldErrors({});
    try {
      const response = await saveInspectorVisitReport(visit.id, { ...input, expectedRevision: report?.revision ?? null });
      setReport(response.data.report); setInput(inputFromReport(response.data.report)); setDirty(false); setNotice('تم حفظ مسودة التقرير.');
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.code === 'REPORT_REVISION_CONFLICT') {
        setRevisionConflict(true); setError('تغير التقرير في جلسة أخرى. احتفظنا بكتابتك؛ راجع النسخة الأحدث يدويًا قبل المتابعة.');
      } else if (caught instanceof ApiRequestError && caught.code === 'VALIDATION_ERROR') {
        setFieldErrors(caught.fields ?? {}); setError('راجع الحقول المشار إليها ثم أعد الحفظ.');
      } else setError(caught instanceof ApiRequestError && caught.code === 'REPORT_TYPE_CONFLICT'
        ? 'لا يتوافق نوع هذه الزيارة مع مسار التقرير.' : 'تعذر حفظ المسودة. تحقق من البيانات وحاول مجددًا.');
    } finally { setBusy(false); }
  }

  async function finalize() {
    if (!report || busy || dirty || missingRequired.length || visit.status !== 'COMPLETED') return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await finalizeInspectorVisitReport(report.id, report.revision);
      setReport(response.data.report); setInput(inputFromReport(response.data.report)); setDirty(false);
      setConfirmFinalize(false); setNotice('تم اعتماد التقرير النهائي، وأصبح للقراءة فقط.');
      setFollowUps((await listReportFollowUps(report.id)).data);
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.code === 'REPORT_REVISION_CONFLICT') { setRevisionConflict(true); setError('تغير التقرير؛ احتفظنا بالمحتوى الحالي. راجع النسخة الأحدث قبل الاعتماد.'); }
      else if (caught instanceof ApiRequestError && caught.code === 'VALIDATION_ERROR') { setFieldErrors(caught.fields ?? {}); setError('أكمل الحد الأدنى المطلوب قبل الاعتماد.'); }
      else setError(caught instanceof ApiRequestError && caught.code === 'INSPECTOR_PROFESSIONAL_IDENTITY_REQUIRED'
        ? 'أكمل الاسم واللقب في الهوية المهنية قبل اعتماد التقرير.' : 'تعذر اعتماد التقرير. راجع حالة الزيارة والبيانات.');
    } finally { setBusy(false); }
  }

  async function createFollowUp(event: FormEvent) {
    event.preventDefault(); if (!report || busy) return;
    setBusy(true); setError('');
    try {
      const result = await createFollowUpApi(report.id, { note: followUpNote, dueDate: followUpDueDate });
      setFollowUps((items) => [...items, result.data.followUp]); setFollowUpNote(''); setFollowUpDueDate(''); setShowFollowUp(false);
    } catch { setError('تعذر إنشاء إجراء المتابعة.'); }
    finally { setBusy(false); }
  }

  async function completeFollowUp(item: FollowUp) {
    setBusy(true);
    try {
      const result = await patchFollowUp(item.id, { operation: 'COMPLETE', expectedRevision: item.revision });
      setFollowUps((items) => items.map((candidate) => candidate.id === item.id ? result.data.followUp : candidate));
    } catch { setError('تعذر إتمام إجراء المتابعة.'); }
    finally { setBusy(false); }
  }

  const formatInterval = () => visit.actualStartAt && visit.actualEndAt
    ? `${formatAlgiers(visit.actualStartAt)} — ${formatAlgiers(visit.actualEndAt)}`
    : visit.scheduledStartAt && visit.scheduledEndAt ? `${formatAlgiers(visit.scheduledStartAt)} — ${formatAlgiers(visit.scheduledEndAt)}` : 'الفترة غير متاحة';

  function sectionCriteria(sectionKey: string) {
    return filteredCriteria.filter((item) => item.sectionKey === sectionKey).map((criterion) => {
      const value = input.observations.find((item) => item.criterionKey === criterion.criterionKey)?.valueText ?? '';
      return <Field key={criterion.criterionKey} label={criterion.label} value={value} max={200} error={fieldError(`observations.${criterion.criterionKey}`)}
        readOnly={readOnly} onChange={(next) => updateObservation(criterion.criterionKey, next)} />;
    });
  }
  function renderShort(key: TextKey) {
    const config = shortFields.find((item) => item.key === key)!;
    return <Field key={key} label={config.label} max={config.max} value={inputText(input.inspectorVisitV1[key] as string | null)} readOnly={readOnly}
      error={fieldError(`inspectorVisitV1.${key}`)} onChange={(value) => updateV1(key, value)} />;
  }
  function renderProse(key: TextKey) {
    const config = proseFields.find((item) => item.key === key)!;
    return <Field key={key} label={config.label} max={config.max} multiline value={inputText(input.inspectorVisitV1[key] as string | null)} readOnly={readOnly}
      error={fieldError(`inspectorVisitV1.${key}`)} onChange={(value) => updateV1(key, value)} />;
  }
  function navigateBack(event: MouseEvent<HTMLAnchorElement>) {
    if (!dirty) return;
    event.preventDefault(); setPendingNavigation(`/app/visits/${encodeURIComponent(visit.id)}`); setDiscardDialog(true);
  }

  async function refreshAfterConflict() {
    if (!report) return;
    setBusy(true);
    try {
      const response = await getInspectionReportReadModel(visit.id);
      if (response.data.report?.reportType === 'INSPECTOR_VISIT') {
        setReport(response.data.report); setInput(inputFromReport(response.data.report)); setDirty(false); setRevisionConflict(false); setError('');
      }
    } catch { setError('تعذر تحميل النسخة الأحدث. بقيت كتابتك الحالية محفوظة في الصفحة.'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="report-page report-workspace" dir="rtl"><PageHeader title="تقرير زيارة المفتش — الإصدار الأول" breadcrumbs={[{ label: 'الزيارات التربوية', to: '/app/visits' }, { label: 'تفاصيل الزيارة', to: `/app/visits/${encodeURIComponent(visit.id)}` }, { label: 'التقرير' }]} /><LoadingState label="جارٍ تحميل نموذج التقرير…" /></div>;
  if (error && criteria.length === 0) return <div className="report-page report-workspace" dir="rtl"><PageHeader title="تقرير زيارة المفتش — الإصدار الأول" breadcrumbs={[{ label: 'الزيارات التربوية', to: '/app/visits' }, { label: 'تفاصيل الزيارة', to: `/app/visits/${encodeURIComponent(visit.id)}` }, { label: 'التقرير' }]} /><ErrorState title="تعذر تحميل نموذج التقرير" description={error} action={<Button variant="secondary" onClick={() => window.location.reload()}>إعادة التحميل</Button>} /></div>;
  if (!visitType) return <div className="report-page report-workspace" dir="rtl"><PageHeader title="تقرير زيارة المفتش — الإصدار الأول" breadcrumbs={[{ label: 'الزيارات التربوية', to: '/app/visits' }, { label: 'تفاصيل الزيارة', to: `/app/visits/${encodeURIComponent(visit.id)}` }, { label: 'التقرير' }]} /><ErrorState title="نوع الزيارة غير محدد" description="لا يمكن فتح نموذج التقرير قبل تحديد نوع الزيارة." /></div>;

  return <div className="report-page report-workspace v1-report-page" dir="rtl">
    <PageHeader title="تقرير زيارة المفتش — الإصدار الأول" description="نموذج تقرير زيارة معتمد للمنصة"
      breadcrumbs={[{ label: 'الزيارات التربوية', to: '/app/visits' }, { label: 'تفاصيل الزيارة', to: `/app/visits/${encodeURIComponent(visit.id)}` }, { label: 'التقرير' }]}
      backAction={<Link to={`/app/visits/${encodeURIComponent(visit.id)}`} onClick={navigateBack}>العودة إلى الزيارة</Link>} />
    {notice ? <SuccessState title={notice} /> : null}{error && criteria.length ? <ErrorState title={error} /> : null}
    {visit.status === 'CANCELLED' && !report ? <ErrorState title="الزيارة ملغاة" description="لا يمكن إنشاء تقرير لهذه الزيارة." /> : null}
    <form onSubmit={(event) => void save(event)} aria-busy={busy}>
      <div className="v1-report-sections">
        <Section number={1} title="هوية الزيارة والتقرير" action={<span className={`report-status-pill report-status-pill--${report?.status?.toLowerCase() ?? 'new'}`}><ShellIcon name={report?.status === 'FINAL' ? 'check-circle' : 'reports'} /><span>{report?.status === 'FINAL' ? 'نهائي — للقراءة فقط' : report ? 'مسودة' : 'لم يُحفظ بعد'}</span></span>}><dl className="report-context report-context--v1">
          <div><dt>نوع الزيارة</dt><dd>{visitTypeLabels[visitType]}</dd></div>
          <div><dt>الأستاذ</dt><dd>{visit.teacher.name} {visit.teacher.surname}</dd></div>
          <div><dt>المفتش</dt><dd>{report?.status === 'FINAL' ? `${report.finalizedInspectorNameSnapshot} ${report.finalizedInspectorSurnameSnapshot}` : report?.displayIdentity?.inspector ? `${report.displayIdentity.inspector.name} ${report.displayIdentity.inspector.surname}` : '—'}</dd></div>
          {report?.status === 'FINAL' ? <div><dt>الأستاذ عند الاعتماد</dt><dd>{report.finalizedTeacherNameSnapshot} {report.finalizedTeacherSurnameSnapshot}</dd></div> : null}
          <div><dt>المؤسسة وقت الزيارة</dt><dd>{visit.institution.name}</dd></div>
          <div><dt>السنة الدراسية</dt><dd>{visit.academicYear}</dd></div>
          <div><dt>{visit.intervalKind === 'ACTUAL_RETROSPECTIVE' ? 'الفترة الفعلية' : 'موعد الزيارة'}</dt><dd dir="auto">{formatInterval()}</dd></div>
          {report?.status === 'FINAL' ? <div><dt>تاريخ اعتماد التقرير</dt><dd>{dateLabel(report.finalizedAt)}</dd></div> : null}
        </dl></Section>
        <Section number={2} title="معلومات الأستاذ والوضعية المهنية">
          <div className="v1-report-grid">{['teacherClassificationText','teacherGradeText','teacherNationalityText','teacherEffectiveDateText','teacherLastInspectionText','teacherAppointmentText','teacherProfessionalFrameworkText'].map((key) => renderShort(key as TextKey))}
            <div className="v1-report-readonly"><span>تاريخ الميلاد</span><strong>{report?.displayContext?.teacherBirthDate ?? 'غير متوفر'}</strong></div>
            <div className="v1-report-readonly"><span>مكان الميلاد</span><strong>{report?.displayContext?.teacherPlaceOfBirth ?? 'غير متوفر'}</strong></div>
            <div className="v1-report-readonly"><span>المؤهل</span><strong>{report?.displayContext?.teacherQualifications ?? 'غير متوفر'}</strong></div>
            <Field label="عدد التلاميذ الإجمالي" type="number" inputMode="numeric" value={numberValue('studentCount')} readOnly={readOnly} onChange={(value) => updateV1('studentCount', value)} />
            <Field label="عدد الحاضرين" type="number" inputMode="numeric" value={numberValue('studentsPresentCount')} readOnly={readOnly} onChange={(value) => updateV1('studentsPresentCount', value)} />
            <Field label="عدد الغائبين" type="number" inputMode="numeric" value={numberValue('studentsAbsentCount')} readOnly={readOnly} onChange={(value) => updateV1('studentsAbsentCount', value)} />
          </div>
        </Section>
        <Section number={3} title="ظروف التفتيش وسياق الحصة">
          <div className="v1-report-grid">{renderShort('educationDirectorateText')}{renderShort('administrativeDivisionText')}{renderShort('actualLessonDurationText')}
          <Field label="المستوى / القسم — مطلوب للإتمام" value={inputText(input.levelClass)} max={100} readOnly={readOnly} error={fieldError('levelClass')} onChange={(value) => updateCore('levelClass', value)} />
            <Field label="ميدان / موضوع الحصة — مطلوب للإتمام" value={inputText(input.lessonTopic)} max={200} readOnly={readOnly} error={fieldError('lessonTopic')} onChange={(value) => updateCore('lessonTopic', value)} />
            <div className="v1-report-readonly"><span>المقاطعة</span><strong>{report?.displayContext?.districtName ?? '—'}</strong></div>
            <div className="v1-report-readonly"><span>البلدية</span><strong>{report?.displayContext?.institutionMunicipality ?? '—'}</strong></div>
          </div>
        </Section>
        <Section number={4} title="التحضير والتخطيط"><div className="v1-report-grid">{renderShort('lessonObjective')}{sectionCriteria('PREPARATION_PLANNING')}</div></Section>
        <Section number={5} title="الفضاء والوسائل والسلامة"><div className="v1-report-grid">{sectionCriteria('FACILITY_SAFETY')}</div></Section>
        <Section number={6} title="سير الحصة والملاحظة الميدانية"><div className="v1-report-grid">{sectionCriteria('LESSON_PROGRESSION')}</div></Section>
        <Section number={7} title="الإشراف البيداغوجي"><div className="v1-report-grid">{sectionCriteria('PEDAGOGICAL_SUPERVISION')}</div></Section>
        <Section number={8} title="الوثائق البيداغوجية والدفتر اليومي"><div className="v1-report-grid">{sectionCriteria('DOCUMENT_MONITORING')}</div></Section>
        <Section number={9} title="متابعة التلاميذ"><div className="v1-report-grid">{sectionCriteria('STUDENT_MONITORING')}</div></Section>
        <Section number={10} title="نقاط القوة وجوانب التحسين والإرشادات">
          <div className="v1-report-grid">{renderProse('visitStrengthsText')}{renderProse('visitImprovementAreasText')}{renderProse('pedagogicalGuidanceText')}{renderProse('practicalGuidanceText')}</div>
        </Section>
        <Section number={11} title="الخلاصة والنتيجة المهنية">
          <div className="v1-report-grid">
            <Field label="الخلاصة — مطلوبة للإتمام" value={inputText(input.inspectorConclusion)} max={4000} multiline readOnly={readOnly} error={fieldError('inspectorConclusion')} onChange={(value) => updateCore('inspectorConclusion', value)} />
            {visitType === 'TENURE_CONFIRMATION' ? renderProse('tenureConclusionText') : null}
            {visitType === 'PROMOTION_EVALUATION' ? <Field className="report-field--mark" label="العلامة البيداغوجية (اختيارية من 0 إلى 20)" value={inputText(input.inspectorVisitV1.pedagogicalMark)}
              readOnly={readOnly} inputMode="decimal" error={fieldError('inspectorVisitV1.pedagogicalMark')} onChange={updateMark} /> : null}
            <Field label="التقدير العام" value={inputText(input.inspectorVisitV1.generalAssessmentText)} max={200} readOnly={readOnly} onChange={(value) => updateV1('generalAssessmentText', value)} />
            {visitType !== 'PROMOTION_EVALUATION' ? <>{renderShort('markText')}{renderShort('markWordsText')}</> : null}
          </div>
        </Section>
      </div>
      {fieldErrors._form?.length ? <p role="alert" className="report-field__error">راجع الحقول المطلوبة أو غير الصالحة.</p> : null}
      {!readOnly ? <div className="report-actions v1-report-actions">
        <Button type="submit" disabled={busy || visit.status === 'CANCELLED'}>{busy ? 'جارٍ الحفظ…' : 'حفظ المسودة'}</Button>
        {report && report.status === 'DRAFT' && visit.status === 'COMPLETED' ? <Button type="button" disabled={busy || dirty || missingRequired.length > 0} onClick={() => setConfirmFinalize(true)}>اعتماد التقرير النهائي</Button> : null}
      </div> : null}
      {report?.status === 'DRAFT' && visit.status === 'COMPLETED' && missingRequired.length ? <p className="report-hint">يلزم قبل الاعتماد: {missingRequired.join('، ')}.</p> : null}
      {dirty ? <p role="status" className="v1-report-dirty">توجد تغييرات غير محفوظة.</p> : null}
    </form>

    {report?.status === 'FINAL' ? <Card><CardHeader title="إجراءات المتابعة" description="إجراءات مستقلة مرتبطة بالتقرير النهائي." action={<Button onClick={() => setShowFollowUp(true)}>إضافة إجراء متابعة</Button>} />
      <CardContent>{followUps.length ? <ul className="report-followup-list">{followUps.map((item) => <li key={item.id}><strong>{item.note}</strong><span>الاستحقاق: {item.dueDate}</span><span>{item.status === 'OPEN' ? 'مفتوحة' : 'مكتملة'}</span>
        {item.status === 'OPEN' ? <Button variant="secondary" disabled={busy} onClick={() => void completeFollowUp(item)}>إتمام المتابعة</Button> : null}</li>)}</ul> : <p>لا توجد إجراءات متابعة لهذا التقرير.</p>}</CardContent></Card> : null}

    <Dialog open={confirmFinalize} title="اعتماد التقرير النهائي" description="بعد الاعتماد يصبح التقرير للقراءة فقط. هذا الإجراء ليس توقيعًا رقميًا." onClose={() => setConfirmFinalize(false)}
      actions={<><Button variant="secondary" disabled={busy} onClick={() => setConfirmFinalize(false)}>مراجعة التقرير</Button><Button disabled={busy} onClick={() => void finalize()}>{busy ? 'جارٍ الاعتماد…' : 'تأكيد الاعتماد النهائي'}</Button></>}>
      <p>تأكد من مراجعة التقرير؛ لن يمكن تعديله بعد الاعتماد.</p>
    </Dialog>
    <Dialog open={discardDialog} title="تغييرات غير محفوظة" description="هل تريد مغادرة الصفحة دون حفظ التغييرات؟" onClose={() => setDiscardDialog(false)}
      actions={<><Button variant="secondary" onClick={() => setDiscardDialog(false)}>البقاء في الصفحة</Button><Button variant="danger" onClick={() => { setDirty(false); navigate(pendingNavigation); }}>مغادرة دون حفظ</Button></>}>
      <p>ستبقى آخر مسودة محفوظة كما هي.</p>
    </Dialog>
    <Dialog open={revisionConflict} title="مراجعة النسخة الأحدث" description="تحميل النسخة المحفوظة سيستبدل المحتوى الظاهر حاليًا بعد تأكيدك." onClose={() => setRevisionConflict(false)}
      actions={<><Button variant="secondary" onClick={() => setRevisionConflict(false)}>الاحتفاظ بكتابتي</Button><Button disabled={busy} onClick={() => void refreshAfterConflict()}>تحميل النسخة الأحدث</Button></>}>
      <p>احتفظ بنسخة من كتابتك قبل المتابعة إذا كنت تحتاج إليها.</p>
    </Dialog>
    <Dialog open={showFollowUp} title="إضافة إجراء متابعة" description="سيبقى إجراء المتابعة منفصلًا عن التقرير النهائي." onClose={() => setShowFollowUp(false)}
      actions={<><Button variant="secondary" disabled={busy} onClick={() => setShowFollowUp(false)}>إلغاء</Button><Button type="submit" form="v1-followup-form" disabled={busy}>حفظ الإجراء</Button></>}>
      <form id="v1-followup-form" className="report-followup-form" onSubmit={(event) => void createFollowUp(event)}>
        <label htmlFor="v1-followup-note">الإجراء المطلوب</label><textarea id="v1-followup-note" className="ui-input" required value={followUpNote} onChange={(event) => setFollowUpNote(event.currentTarget.value)} />
        <label htmlFor="v1-followup-date">تاريخ الاستحقاق</label><input id="v1-followup-date" className="ui-input" type="date" required value={followUpDueDate} onChange={(event) => setFollowUpDueDate(event.currentTarget.value)} />
      </form>
    </Dialog>
  </div>;
}
