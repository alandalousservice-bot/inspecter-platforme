import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError, createFollowUp, finalizeInspectionReport, getInspectionReport, getPedagogicalVisit, listReportFollowUps, saveInspectionReport, type FollowUp, type InspectionReport, type InspectionReportContent, type PedagogicalVisit } from '../auth/client';
import { Button, Card, CardContent, CardHeader, Dialog, EmptyState, ErrorState, LoadingState, PageHeader, SuccessState } from '../ui';
import { formatAlgiers } from './time';
import { InspectorVisitReportV1Page } from './InspectorVisitReportV1Page';
import { VisitStatusBadge } from './VisitStatusBadge';
import { ShellIcon } from '../ui/ShellIcon';
import type { InspectionReportReadModel, InspectorVisitReport } from '../auth/client';
import './inspection-report.css';

const fields: Array<{ key: keyof InspectionReportContent; label: string; max: number; prose?: boolean; required?: boolean }> = [
  { key: 'levelClass', label: 'المستوى / القسم', max: 100, required: true },
  { key: 'lessonTopic', label: 'الميدان البيداغوجي أو موضوع الحصة', max: 200, required: true },
  { key: 'pedagogicalObservations', label: 'الملاحظات البيداغوجية', max: 4000, prose: true },
  { key: 'strengths', label: 'نقاط القوة', max: 4000, prose: true },
  { key: 'improvementAreas', label: 'جوانب تحتاج إلى تحسين', max: 4000, prose: true },
  { key: 'guidanceRecommendations', label: 'التوجيهات والتوصيات', max: 4000, prose: true },
  { key: 'inspectorConclusion', label: 'خلاصة المفتش', max: 4000, prose: true, required: true },
];
const blank: InspectionReportContent = { levelClass: null, lessonTopic: null, pedagogicalObservations: null, strengths: null, improvementAreas: null, guidanceRecommendations: null, inspectorConclusion: null };
const codePoints = (value: string) => Array.from(value).length;

export function InspectionReportPage() {
  const { id = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [routing, setRouting] = useState<{ visit: PedagogicalVisit; report: InspectionReportReadModel | null } | null>(null);
  useEffect(() => {
    let mounted = true;
    Promise.all([getPedagogicalVisit(id), getInspectionReport(id)]).then(([visitResult, reportResult]) => {
      if (!mounted) return;
      setRouting({ visit: visitResult.data.visit, report: reportResult.data.report as InspectionReportReadModel | null });
    }).catch(() => { if (mounted) setFailed(true); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [id]);
  if (loading) return <div className="report-page report-workspace" dir="rtl"><PageHeader title="تقرير الزيارة" breadcrumbs={[{ label: 'الزيارات التربوية', to: '/app/visits' }, { label: 'التقرير' }]} /><LoadingState label="جارٍ تحميل التقرير…" /></div>;
  if (failed || !routing) return <div className="report-page report-workspace" dir="rtl"><PageHeader title="تقرير الزيارة" breadcrumbs={[{ label: 'الزيارات التربوية', to: '/app/visits' }, { label: 'التقرير' }]} /><ErrorState title="تعذر تحميل التقرير" description="تحقق من الاتصال أو صلاحية الوصول ثم أعد المحاولة." /></div>;
  if (routing.report?.reportType === 'INSPECTOR_VISIT' || (!routing.report && routing.visit.visitType !== null)) {
    return <InspectorVisitReportV1Page visit={routing.visit} initialReport={routing.report?.reportType === 'INSPECTOR_VISIT' ? routing.report as InspectorVisitReport : null} />;
  }
  return <LegacyInspectionReportPage />;
}

function LegacyInspectionReportPage() {
  const { id = '' } = useParams();
  const [visit, setVisit] = useState<PedagogicalVisit | null>(null);
  const [report, setReport] = useState<InspectionReport | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [followUpNote, setFollowUpNote] = useState('');
  const [followUpDueDate, setFollowUpDueDate] = useState('');
  const [followUpError, setFollowUpError] = useState('');
  const [content, setContent] = useState<InspectionReportContent>(blank);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async (preserveContent = false) => {
    setLoading(true); setLoadError(false);
    try {
      const [visitResult, reportResult] = await Promise.all([getPedagogicalVisit(id), getInspectionReport(id)]);
      setVisit(visitResult.data.visit); setReport(reportResult.data.report);
      if (reportResult.data.report?.status === 'FINAL') setFollowUps((await listReportFollowUps(reportResult.data.report.id)).data);
      else setFollowUps([]);
      if (!preserveContent) setContent(reportResult.data.report ? Object.fromEntries(fields.map(({ key }) => [key, reportResult.data.report?.[key] ?? ''])) as InspectionReportContent : blank);
      if (!preserveContent) setDirty(false);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const readOnly = report?.status === 'FINAL' || visit?.status === 'CANCELLED';
  const minimumMissing = fields.filter((field) => field.key === 'levelClass' || field.key === 'lessonTopic' || field.key === 'inspectorConclusion')
    .filter((field) => !content[field.key]?.trim());
  const persistedMinimumMissing = fields.filter((field) => field.key === 'levelClass' || field.key === 'lessonTopic' || field.key === 'inspectorConclusion')
    .filter((field) => !report?.[field.key]?.trim());

  function updateField(key: keyof InspectionReportContent, value: string) {
    setDirty(true);
    setContent((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: [] }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || readOnly) return;
    setNotice(''); setError(''); setFieldErrors({});
    const errors: Record<string, string[]> = {};
    for (const field of fields) {
      const text = content[field.key] ?? '';
      if (codePoints(text.normalize('NFC').trim()) > field.max) errors[field.key] = [`الحد الأقصى ${field.max} محرفًا.`];
    }
    if (Object.keys(errors).length) { setFieldErrors(errors); setError('راجع الحقول المحددة قبل الحفظ.'); return; }
    const payload = Object.fromEntries(fields.map(({ key }) => {
      const value = content[key] ?? '';
      return [key, value.trim() ? value : null];
    })) as InspectionReportContent;
    setBusy(true);
    try {
      const result = await saveInspectionReport(id, { ...payload, expectedRevision: report?.revision ?? null });
      setReport(result.data.report); setContent(Object.fromEntries(fields.map(({ key }) => [key, result.data.report[key] ?? ''])) as InspectionReportContent);
      setNotice('تم حفظ المسودة.'); setRevisionConflict(false); setDirty(false);
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.code === 'REPORT_REVISION_CONFLICT') setRevisionConflict(true);
      if (caught instanceof ApiRequestError && caught.code === 'VALIDATION_ERROR') setFieldErrors(caught.fields ?? {});
      setError(caught instanceof ApiRequestError && caught.code === 'REPORT_STATE_CONFLICT' ? 'تغيرت حالة الزيارة أو التقرير؛ لا يمكن حفظ المسودة.' : 'تعذر حفظ المسودة. راجع البيانات أو حدّث النسخة قبل المتابعة.');
    } finally { setBusy(false); }
  }

  async function finalize() {
    if (!report || busy || minimumMissing.length || visit?.status !== 'COMPLETED') return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await finalizeInspectionReport(report.id, report.revision);
      setReport(result.data.report); setContent(Object.fromEntries(fields.map(({ key }) => [key, result.data.report[key] ?? ''])) as InspectionReportContent); setDirty(false);
      setConfirmFinalize(false); setNotice('تم اعتماد التقرير النهائي، وأصبح للقراءة فقط.');
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.code === 'REPORT_REVISION_CONFLICT') setRevisionConflict(true);
      setError(caught instanceof ApiRequestError && caught.code === 'INSPECTOR_PROFESSIONAL_IDENTITY_REQUIRED'
        ? 'أكمل الاسم واللقب في الهوية المهنية قبل اعتماد التقرير.' : 'تعذر اعتماد التقرير. راجع حالة الزيارة والبيانات ثم أعد التحقق.');
    } finally { setBusy(false); }
  }

  async function submitFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!report || busy) return;
    if (codePoints(followUpNote.normalize('NFC').trim()) > 1000) { setFollowUpError('الحد الأقصى 1000 محرف.'); return; }
    setBusy(true); setFollowUpError('');
    try {
      const created = await createFollowUp(report.id, { note: followUpNote, dueDate: followUpDueDate });
      setFollowUps((items) => [...items, created.data.followUp].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id)));
      setFollowUpNote(''); setFollowUpDueDate(''); setShowFollowUpForm(false);
    } catch { setFollowUpError('تعذر إنشاء إجراء المتابعة. تحقق من الحالة والبيانات ثم أعد المحاولة.'); }
    finally { setBusy(false); }
  }

  return <div className="report-page report-workspace" dir="rtl">
    <PageHeader title="تقرير مرافقة بيداغوجية" description="تقرير من إعداد المفتش — غير رسمي"
      breadcrumbs={[{ label: 'الزيارات التربوية', to: '/app/visits' }, { label: 'تفاصيل الزيارة', to: `/app/visits/${encodeURIComponent(id)}` }, { label: 'التقرير' }]}
      backAction={<Link to={`/app/visits/${encodeURIComponent(id)}`}>العودة إلى الزيارة</Link>} />
    {loading ? <LoadingState label="جارٍ تحميل التقرير…" /> : null}
    {!loading && loadError ? <ErrorState title="تعذر تحميل التقرير" description="تحقق من الاتصال أو صلاحية الوصول ثم أعد المحاولة." action={<Button variant="secondary" onClick={() => void load()}>إعادة التحميل</Button>} /> : null}
    {!loading && !loadError && visit ? <>
      {notice ? <SuccessState title={notice} /> : null}
      {error ? <ErrorState title={error} /> : null}
      {revisionConflict ? <section className="report-conflict" role="alert"><p>توجد نسخة أحدث محفوظة. بقيت كتابتك الحالية كما هي؛ راجع النسخة الأحدث صراحة قبل تقرير ما ستحتفظ به.</p><Button variant="secondary" onClick={() => setConfirmRefresh(true)}>مراجعة النسخة الأحدث</Button></section> : null}
      <Card className="report-context-card"><CardHeader title="سياق الزيارة" description={`السنة الدراسية ${visit.academicYear}`} action={<div className="report-context-card__actions"><VisitStatusBadge status={visit.status} /><span className={`report-status-pill report-status-pill--${report?.status?.toLowerCase() ?? 'new'}`}><ShellIcon name={report?.status === 'FINAL' ? 'check-circle' : 'reports'} /><span>{report?.status === 'FINAL' ? 'نهائي — للقراءة فقط' : report ? 'مسودة' : 'لم يُحفظ بعد'}</span></span></div>} />
        <CardContent><dl className="report-context report-context--legacy"><div><dt>الأستاذ</dt><dd>{report?.displayIdentity.teacher.name ?? visit.teacher.name} {report?.displayIdentity.teacher.surname ?? visit.teacher.surname}</dd></div><div><dt>المؤسسة وقت الزيارة</dt><dd>{visit.institution.name}</dd></div><div><dt>{visit.intervalKind === 'ACTUAL_RETROSPECTIVE' ? 'الفترة الفعلية للزيارة' : 'موعد الزيارة'}</dt><dd dir="auto">{visit.actualStartAt && visit.actualEndAt ? `${formatAlgiers(visit.actualStartAt)} — ${formatAlgiers(visit.actualEndAt)}` : visit.scheduledStartAt && visit.scheduledEndAt ? `${formatAlgiers(visit.scheduledStartAt)} — ${formatAlgiers(visit.scheduledEndAt)}` : 'الفترة غير متاحة'}</dd></div>{visit.occurredAt ? <div><dt>وقت الإنجاز</dt><dd dir="auto">{formatAlgiers(visit.occurredAt)}</dd></div> : null}</dl></CardContent>
      </Card>
      {visit.status === 'CANCELLED' ? <p role="status" className="report-cancelled">الزيارة ملغاة. تبقى المسودة المحفوظة للقراءة فقط.</p> : null}
      {report?.status === 'FINAL' ? <Card className="report-state-card"><CardHeader title="اعتماد التقرير" description="التقرير نهائي وثابت في النسخة الحالية." action={<span className="report-context-card__icon"><ShellIcon name="check-circle" /></span>} />
        <CardContent><p>تاريخ الاعتماد: <time dateTime={report.finalizedAt ?? undefined}>{report.finalizedAt ? new Date(report.finalizedAt).toLocaleString('ar-DZ', { timeZone: 'Africa/Algiers' }) : '—'}</time></p>
          <dl className="report-context"><div><dt>المفتش عند الاعتماد</dt><dd>{report.finalizedInspectorNameSnapshot} {report.finalizedInspectorSurnameSnapshot}</dd></div><div><dt>الأستاذ عند الاعتماد</dt><dd>{report.finalizedTeacherNameSnapshot} {report.finalizedTeacherSurnameSnapshot}</dd></div></dl></CardContent></Card> : null}
      {report?.status === 'FINAL' ? <Card><CardHeader title="إجراءات المتابعة" description="إجراءات مستقلة مرتبطة بهذا التقرير النهائي." action={<Button onClick={() => { setFollowUpError(''); setShowFollowUpForm(true); }}>إضافة إجراء متابعة</Button>} />
        <CardContent>{followUps.length ? <ul className="report-followup-list">{followUps.map((item) => <li key={item.id}><strong>{item.note}</strong><span>الاستحقاق: {item.dueDate}</span><span>{item.status === 'OPEN' ? item.alertState === 'OVERDUE' ? 'متأخرة' : item.alertState === 'DUE_TODAY' ? 'مستحقة اليوم' : 'مفتوحة' : 'مكتملة'}</span></li>)}</ul> : <p>لا توجد إجراءات متابعة لهذا التقرير.</p>}<Link to="/app/follow-ups">عرض جميع إجراءات المتابعة</Link></CardContent></Card> : null}
      {visit.visitType !== null ? <EmptyState title="مسار التقرير المرتبط بنوع الزيارة غير متاح بعد" description="لم يُنشأ أو يُعتمد تقرير من هذا المسار. احتفظ بنوع الزيارة كما هو." /> : visit.status === 'CANCELLED' && !report ? <EmptyState title="الزيارة ملغاة ولا توجد مسودة محفوظة" description="لا يمكن إنشاء تقرير لهذه الزيارة." /> : <Card className="report-content-card"><CardHeader title={report?.status === 'FINAL' ? 'محتوى التقرير النهائي' : readOnly ? 'المسودة المحفوظة' : 'محتوى التقرير'} description={readOnly ? 'الحقول للقراءة فقط.' : 'احفظ المسودة صراحة؛ لا يتم الحفظ تلقائيًا.'} action={<span className="report-context-card__icon"><ShellIcon name="reports" /></span>} />
        <CardContent><form className="report-form" onSubmit={(event) => void save(event)} aria-busy={busy}>
          <section className="report-form-section" aria-labelledby="legacy-report-context-heading"><h3 id="legacy-report-context-heading"><span>١</span> سياق الحصة</h3><div className="report-form-section__grid">
          {fields.slice(0, 2).map((field) => <div className="report-field" key={field.key}><label htmlFor={`report-${field.key}`}>{field.label}{field.required ? <span> (مطلوب للإتمام النهائي)</span> : null}</label>
            {field.prose ? <textarea id={`report-${field.key}`} className="ui-input report-textarea" value={content[field.key] ?? ''} readOnly={readOnly} rows={4} aria-invalid={Boolean(fieldErrors[field.key]?.length)} aria-describedby={fieldErrors[field.key]?.length ? `report-${field.key}-error` : undefined} onChange={(event) => updateField(field.key, event.currentTarget.value)} />
              : <input id={`report-${field.key}`} className="ui-input" value={content[field.key] ?? ''} readOnly={readOnly} aria-invalid={Boolean(fieldErrors[field.key]?.length)} aria-describedby={fieldErrors[field.key]?.length ? `report-${field.key}-error` : undefined} onChange={(event) => updateField(field.key, event.currentTarget.value)} />}
            <small>{codePoints(content[field.key] ?? '')} / {field.max}</small>{fieldErrors[field.key]?.length ? <span id={`report-${field.key}-error`} className="report-field__error" role="alert">{fieldErrors[field.key][0]}</span> : null}
          </div>)}
          </div></section>
          <section className="report-form-section" aria-labelledby="legacy-report-notes-heading"><h3 id="legacy-report-notes-heading"><span>٢</span> الملاحظات والتوجيه المهني</h3><div className="report-form-section__grid">
          {fields.slice(2).map((field) => <div className="report-field" key={field.key}><label htmlFor={`report-${field.key}`}>{field.label}{field.required ? <span> (مطلوب للإتمام النهائي)</span> : null}</label>
            {field.prose ? <textarea id={`report-${field.key}`} className="ui-input report-textarea" value={content[field.key] ?? ''} readOnly={readOnly} rows={4} aria-invalid={Boolean(fieldErrors[field.key]?.length)} aria-describedby={fieldErrors[field.key]?.length ? `report-${field.key}-error` : undefined} onChange={(event) => updateField(field.key, event.currentTarget.value)} />
              : <input id={`report-${field.key}`} className="ui-input" value={content[field.key] ?? ''} readOnly={readOnly} aria-invalid={Boolean(fieldErrors[field.key]?.length)} aria-describedby={fieldErrors[field.key]?.length ? `report-${field.key}-error` : undefined} onChange={(event) => updateField(field.key, event.currentTarget.value)} />}
            <small>{codePoints(content[field.key] ?? '')} / {field.max}</small>{fieldErrors[field.key]?.length ? <span id={`report-${field.key}-error`} className="report-field__error" role="alert">{fieldErrors[field.key][0]}</span> : null}
          </div>)}
          </div></section>
          {!readOnly ? <div className="report-actions"><Button type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ المسودة'}</Button>
            {report && visit.status === 'COMPLETED' ? <Button disabled={busy || dirty || persistedMinimumMissing.length > 0} onClick={() => setConfirmFinalize(true)}>اعتماد التقرير النهائي</Button> : null}</div> : null}
          {!readOnly && report && visit.status === 'COMPLETED' && minimumMissing.length ? <p className="report-hint">يلزم استكمال: {minimumMissing.map((field) => field.label).join('، ')}.</p> : null}
          {!readOnly && report && visit.status === 'COMPLETED' && dirty && minimumMissing.length === 0 ? <p className="report-hint">احفظ التغييرات أولًا قبل اعتماد النسخة المحفوظة.</p> : null}
        </form></CardContent></Card>}
      {error.includes('الهوية المهنية') ? <p><Link to="/app/me/professional-identity">إكمال الهوية المهنية</Link></p> : null}
    </> : null}
    <Dialog open={confirmFinalize} title="اعتماد التقرير النهائي" description="بعد الاعتماد يصبح التقرير للقراءة فقط في النسخة الحالية. هذا الإجراء ليس توقيعًا رقميًا." onClose={() => setConfirmFinalize(false)}
      actions={<><Button variant="secondary" disabled={busy} onClick={() => setConfirmFinalize(false)}>مراجعة المسودة</Button><Button disabled={busy} onClick={() => void finalize()}>{busy ? 'جارٍ الاعتماد…' : 'تأكيد الاعتماد النهائي'}</Button></>}>
      <p>راجع محتوى التقرير قبل التأكيد؛ لا يمكن تعديله أو إعادة فتحه بعد الاعتماد.</p>
    </Dialog>
    <Dialog open={confirmRefresh} title="مراجعة النسخة الأحدث" description="تحميل النسخة الأحدث سيستبدل النص الظاهر حاليًا بما حفظه الطلب الآخر. لن يتم ذلك دون تأكيدك." onClose={() => setConfirmRefresh(false)}
      actions={<><Button variant="secondary" onClick={() => setConfirmRefresh(false)}>الاحتفاظ بكتابتي</Button><Button onClick={() => { setConfirmRefresh(false); setRevisionConflict(false); void load(); }}>تحميل النسخة الأحدث</Button></>}>
      <p>يمكنك نسخ كتابتك يدويًا قبل تحميل النسخة الأحدث.</p>
    </Dialog>
    <Dialog open={showFollowUpForm} title="إضافة إجراء متابعة" description="الإجراء مستقل عن نص التقرير النهائي." onClose={() => { if (!busy) setShowFollowUpForm(false); }}
      actions={<><Button variant="secondary" disabled={busy} onClick={() => setShowFollowUpForm(false)}>إلغاء</Button><Button type="submit" form="report-followup-form" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ الإجراء'}</Button></>}>
      <form id="report-followup-form" className="report-followup-form" onSubmit={(event) => void submitFollowUp(event)}>
        <label htmlFor="report-followup-note">الإجراء المطلوب</label><textarea id="report-followup-note" className="ui-input" required value={followUpNote} onChange={(event) => setFollowUpNote(event.currentTarget.value)} />
        <label htmlFor="report-followup-due">تاريخ الاستحقاق</label><input id="report-followup-due" className="ui-input" type="date" required value={followUpDueDate} onChange={(event) => setFollowUpDueDate(event.currentTarget.value)} />
        {followUpError ? <p role="alert">{followUpError}</p> : null}
      </form>
    </Dialog>
  </div>;
}
