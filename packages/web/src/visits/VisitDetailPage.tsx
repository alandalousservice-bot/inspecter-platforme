import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ApiRequestError, getPedagogicalVisit, patchPedagogicalVisit, type PedagogicalVisit, type PedagogicalVisitPatch, type PedagogicalVisitStatus, type ScheduleWarningCode } from '../auth/client';
import { Button, Card, CardContent, CardHeader, Dialog, ErrorState, Input, LoadingState, SuccessState } from '../ui';
import { formatAlgiers, localDateTimeToOffset, utcToLocalDateTime } from './time';
import './visits.css';

type WarningState = { code: ScheduleWarningCode; payload: Extract<PedagogicalVisitPatch, { operation: 'RESCHEDULE' }> } | { stale: true; payload: Extract<PedagogicalVisitPatch, { operation: 'RESCHEDULE' }> };
type DialogAction = 'complete' | 'cancel' | null;
const statusLabels: Record<PedagogicalVisitStatus, string> = { PLANNED: 'مخططة', COMPLETED: 'مكتملة', CANCELLED: 'ملغاة' };
const warningText: Record<ScheduleWarningCode, string> = {
  VISIT_WEEKLY_SCHEDULE_MISSING: 'لا يوجد توزيع أسبوعي مسجل لهذا الأستاذ والسنة الدراسية.',
  VISIT_OUTSIDE_WEEKLY_SCHEDULE: 'الموعد لا يقع بالكامل ضمن التوزيع الأسبوعي المسجل.',
};

function friendlyError(error: unknown) {
  if (!(error instanceof ApiRequestError)) return 'تعذر الاتصال بالخدمة. أعد المحاولة.';
  const map: Record<string, string> = {
    VISIT_OVERLAP_CONFLICT: 'يتعارض هذا الموعد مع زيارة أخرى. اختر فترة مختلفة.',
    VISIT_WORKPLACE_CHANGED: 'تغيرت المؤسسة الحالية للأستاذ أو أصبحت غير متاحة. راجع ملف الأستاذ؛ تبقى هذه الزيارة محفوظة بسياقها التاريخي.',
    VISIT_WORKPLACE_UNAVAILABLE: 'المؤسسة الحالية غير متاحة للتخطيط. راجع ملف الأستاذ.',
    TEACHER_CURRENT_INSTITUTION_REQUIRED: 'لم تُعتمد مؤسسة حالية للأستاذ. راجع ملفه قبل التخطيط.',
    TEACHER_INACTIVE: 'الأستاذ غير نشط؛ لم تُنفذ العملية.',
    NOT_FOUND: 'الزيارة غير متاحة ضمن نطاق الوصول الحالي.',
    VISIT_REVISION_CONFLICT: 'تغيّرت الزيارة منذ تحميلها. حدّث البيانات وراجع العملية قبل المحاولة.',
    VISIT_STATE_CONFLICT: 'تغيّرت الزيارة أو حالتها منذ تحميلها. حدّث البيانات لمراجعة الإجراء المتاح.',
    VALIDATION_ERROR: 'تحقق من الوقت المدخل ثم أعد المحاولة.',
  };
  return map[error.code ?? ''] ?? 'تعذر تنفيذ العملية. أعد المحاولة بعد مراجعة البيانات.';
}

export function VisitDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const [visit, setVisit] = useState<PedagogicalVisit>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState(typeof location.state?.success === 'string' ? location.state.success : '');
  const [operationError, setOperationError] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [year, setYear] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [formError, setFormError] = useState('');
  const [warning, setWarning] = useState<WarningState | null>(null);
  const [dialogAction, setDialogAction] = useState<DialogAction>(null);
  const [occurredAt, setOccurredAt] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try { const result = await getPedagogicalVisit(id); setVisit(result.data.visit); setYear(result.data.visit.academicYear); }
    catch { setLoadError(true); setVisit(undefined); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load, refresh]);

  function startReschedule() {
    if (!visit) return;
    setYear(visit.academicYear); setStart(utcToLocalDateTime(visit.scheduledStartAt)); setEnd(utcToLocalDateTime(visit.scheduledEndAt));
    setWarning(null); setFormError(''); setOperationError(''); setRescheduling(true);
  }

  async function applyReschedule(payload: Extract<PedagogicalVisitPatch, { operation: 'RESCHEDULE' }>, acknowledgement?: ScheduleWarningCode) {
    if (busy) return;
    setBusy(true); setOperationError(''); setFormError('');
    try {
      await patchPedagogicalVisit(id, { ...payload, ...(acknowledgement ? { scheduleWarningAcknowledgement: acknowledgement } : {}) });
      setWarning(null); setRescheduling(false); setNotice('تم تحديث موعد الزيارة.'); await load();
    } catch (error) {
      if (error instanceof ApiRequestError && (error.code === 'VISIT_WEEKLY_SCHEDULE_MISSING' || error.code === 'VISIT_OUTSIDE_WEEKLY_SCHEDULE')) setWarning({ code: error.code, payload });
      else if (error instanceof ApiRequestError && error.code === 'VISIT_SCHEDULE_CONTEXT_CHANGED') setWarning({ stale: true, payload });
      else setOperationError(friendlyError(error));
    } finally { setBusy(false); }
  }

  function submitReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!visit || busy) return;
    if (!/^\d{4}-\d{4}$/u.test(year) || Number(year.slice(5)) !== Number(year.slice(0, 4)) + 1) { setFormError('أدخل سنة دراسية صحيحة مثل 2026-2027.'); return; }
    const startAt = localDateTimeToOffset(start); const endAt = localDateTimeToOffset(end);
    if (!startAt || !endAt) { setFormError('أدخل تاريخًا ووقتًا صالحين بتوقيت الجزائر.'); return; }
    if (Date.parse(startAt) >= Date.parse(endAt)) { setFormError('يجب أن يسبق موعد البداية موعد النهاية.'); return; }
    void applyReschedule({ operation: 'RESCHEDULE', expectedRevision: visit.revision, academicYear: year, scheduledStartAt: startAt, scheduledEndAt: endAt });
  }

  async function executeTransition() {
    if (!visit || !dialogAction || busy) return;
    const operation: PedagogicalVisitPatch | null = dialogAction === 'cancel'
      ? { operation: 'CANCEL', expectedRevision: visit.revision }
      : (() => { const timestamp = localDateTimeToOffset(occurredAt); return timestamp ? { operation: 'COMPLETE', expectedRevision: visit.revision, occurredAt: timestamp } : null; })();
    if (!operation) { setFormError('أدخل وقت الإنجاز الفعلي بتوقيت الجزائر.'); return; }
    setBusy(true); setOperationError(''); setFormError('');
    try {
      await patchPedagogicalVisit(id, operation); setDialogAction(null); setOccurredAt('');
      setNotice(dialogAction === 'complete' ? 'تم تسجيل إكمال الزيارة.' : 'تم إلغاء الزيارة.'); await load();
    } catch (error) { setDialogAction(null); setOperationError(friendlyError(error)); }
    finally { setBusy(false); }
  }

  const dialogWarning = warning;
  return <section className="visit-page" dir="rtl">
    <header className="visit-page__header"><div><h1>تفاصيل الزيارة</h1><p>السجل التشغيلي للزيارة التربوية.</p></div><Link to={`/app/visits${location.search}`}>العودة إلى الزيارات</Link></header>
    {loading ? <LoadingState label="جارٍ تحميل تفاصيل الزيارة…" /> : null}
    {!loading && loadError ? <ErrorState title="تعذر تحميل الزيارة" description="تحقق من الاتصال أو صلاحية الوصول ثم أعد المحاولة." action={<Button variant="secondary" onClick={() => setRefresh((value) => value + 1)}>إعادة التحميل</Button>} /> : null}
    {!loading && visit ? <>
      {notice ? <SuccessState title={notice} /> : null}
      {operationError ? <ErrorState title={operationError} action={operationError.includes('تغيّرت الزيارة') ? <Button variant="secondary" onClick={() => { setOperationError(''); setRefresh((value) => value + 1); }}>تحديث البيانات</Button> : undefined} /> : null}
      <Card><CardHeader title="معلومات الزيارة" description={`السنة الدراسية ${visit.academicYear}`} action={<span className={`visit-status visit-status--${visit.status.toLowerCase()}`}>{statusLabels[visit.status]}</span>} />
        <CardContent><dl className="visit-facts">
          <div><dt>موعد الزيارة</dt><dd><span dir="auto">{formatAlgiers(visit.scheduledStartAt)}</span> — <span dir="auto">{formatAlgiers(visit.scheduledEndAt)}</span></dd></div>
          <div><dt>الأستاذ</dt><dd><Link to={`/app/teachers/${encodeURIComponent(visit.teacher.id)}`}>{visit.teacher.name} {visit.teacher.surname}</Link></dd></div>
          <div><dt>مؤسسة الزيارة وقت التخطيط</dt><dd>{visit.institution.name}<small> هذه هي اللقطة المحفوظة للزيارة، ولا تتغير بتغير المؤسسة الحالية للأستاذ.</small></dd></div>
          {visit.occurredAt ? <div><dt>وقت الإنجاز الفعلي</dt><dd dir="auto">{formatAlgiers(visit.occurredAt)}</dd></div> : null}
        </dl></CardContent>
      </Card>
      {visit.status === 'PLANNED' ? <Card><CardHeader title="إجراءات الزيارة" description="تُحفظ الزيارة التاريخية؛ لا يمكن إعادة فتح الحالة النهائية." /><CardContent>
        {!rescheduling ? <div className="visit-actions"><Button variant="secondary" disabled={busy} onClick={startReschedule}>إعادة جدولة</Button><Button disabled={busy} onClick={() => { setDialogAction('complete'); setFormError(''); }}>إكمال الزيارة</Button><Button variant="danger" disabled={busy} onClick={() => { setDialogAction('cancel'); setFormError(''); }}>إلغاء الزيارة</Button></div> : null}
        {rescheduling ? <form className="visit-form" onSubmit={submitReschedule} aria-busy={busy}>
          <h2>إعادة جدولة الزيارة</h2>
          <Input id="visit-reschedule-year" label="السنة الدراسية" required value={year} onChange={(event) => { setYear(event.currentTarget.value); setWarning(null); }} hint="صيغة YYYY-YYYY والسنة الثانية تلي الأولى." aria-describedby={formError ? 'visit-reschedule-error' : undefined} />
          <Input id="visit-reschedule-start" label="بداية الزيارة — توقيت الجزائر" type="datetime-local" required value={start} onChange={(event) => { setStart(event.currentTarget.value); setWarning(null); }} aria-describedby={formError ? 'visit-reschedule-error' : undefined} />
          <Input id="visit-reschedule-end" label="نهاية الزيارة — توقيت الجزائر" type="datetime-local" required value={end} onChange={(event) => { setEnd(event.currentTarget.value); setWarning(null); }} aria-describedby={formError ? 'visit-reschedule-error' : undefined} />
          {start && end && start.slice(0, 10) !== end.slice(0, 10) ? <p>يمتد الموعد إلى تاريخ آخر؛ سيظهر تاريخ البداية والنهاية كاملين.</p> : null}
          {formError ? <p id="visit-reschedule-error" role="alert" className="visit-error">{formError}</p> : null}
          <div className="visit-actions"><Button type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ الموعد'}</Button><Button variant="secondary" disabled={busy} onClick={() => { setRescheduling(false); setWarning(null); }}>إلغاء إعادة الجدولة</Button></div>
        </form> : null}
      </CardContent></Card> : <Card><CardHeader title="سجل الزيارة" description="هذه الحالة نهائية؛ تبقى تفاصيل الزيارة متاحة للقراءة." /></Card>}
      <p className="visit-inline-note">للاطلاع على المؤسسة الحالية المعتمدة أو بيانات الأستاذ، افتح <Link to={`/app/teachers/${encodeURIComponent(visit.teacher.id)}`}>ملف الأستاذ</Link>. لا يغيّر ذلك مؤسسة الزيارة المحفوظة أعلاه.</p>
      <Link to={`/app/teachers/${encodeURIComponent(visit.teacher.id)}/schedules`}>عرض التوزيع الأسبوعي للأستاذ</Link>
    </> : null}

    <Dialog open={Boolean(dialogAction)} title={dialogAction === 'complete' ? 'إكمال الزيارة' : 'إلغاء الزيارة'}
      description={dialogAction === 'complete' ? 'أدخل وقت حدوث الزيارة الفعلي. لا يتضمن هذا الإجراء تقريرًا أو تقييمًا.' : 'سيُسجّل إلغاء الزيارة مع الإبقاء على سجلها للرجوع إليه.'}
      onClose={() => { if (!busy) setDialogAction(null); }} onCancel={(event) => { if (busy) event.preventDefault(); else setDialogAction(null); }}
      actions={<><Button variant="secondary" disabled={busy} onClick={() => setDialogAction(null)}>رجوع</Button><Button variant={dialogAction === 'cancel' ? 'danger' : 'primary'} disabled={busy} onClick={() => void executeTransition()}>{busy ? 'جارٍ الحفظ…' : dialogAction === 'complete' ? 'تأكيد إكمال الزيارة' : 'تأكيد إلغاء الزيارة'}</Button></>}>
      {dialogAction === 'complete' ? <Input id="visit-occurred-at" label="وقت الإنجاز الفعلي — توقيت الجزائر" type="datetime-local" required value={occurredAt} onChange={(event) => setOccurredAt(event.currentTarget.value)} aria-describedby={formError ? 'visit-complete-error' : undefined} /> : <p>لن يُحذف السجل، ولا يلزم إدخال سبب للإلغاء.</p>}
      {formError ? <p id="visit-complete-error" role="alert" className="visit-error">{formError}</p> : null}
    </Dialog>

    <Dialog open={Boolean(dialogWarning)} title={dialogWarning && 'stale' in dialogWarning ? 'تغيّر التوزيع الأسبوعي' : 'تنبيه الجدول الأسبوعي'}
      description={dialogWarning && 'stale' in dialogWarning ? 'تغير سياق التوزيع بعد التنبيه السابق. أعد فحص الموعد ثم قرر من جديد.' : dialogWarning ? warningText[dialogWarning.code] : undefined}
      onClose={() => { if (!busy) setWarning(null); }} onCancel={(event) => { if (busy) event.preventDefault(); else setWarning(null); }}
      actions={<><Button variant="secondary" disabled={busy} onClick={() => setWarning(null)}>العودة للتعديل</Button>{dialogWarning ? <Button disabled={busy} onClick={() => {
        if ('stale' in dialogWarning) void applyReschedule(dialogWarning.payload);
        else void applyReschedule(dialogWarning.payload, dialogWarning.code);
      }}>{busy ? 'جارٍ التحقق…' : dialogWarning && 'stale' in dialogWarning ? 'إعادة فحص الموعد' : 'متابعة مع هذا الموعد'}</Button> : null}</>}>
      <p>هذا تنبيه استشاري ولا يمنع إعادة الجدولة. سيعيد الخادم التحقق عند المتابعة.</p>
    </Dialog>
  </section>;
}
