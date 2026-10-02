import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, getCurrentDistricts, getCurrentInspector, listFollowUps, patchFollowUp, type DistrictOption, type FollowUp } from '../auth/client';
import { Button, Card, CardContent, CardHeader, Dialog, EmptyState, ErrorState, Input, LoadingState, SuccessState } from '../ui';
import './followups.css';

type ActionMode = 'EDIT' | 'COMPLETE';
export function FollowUpsPage() {
  const [rows, setRows] = useState<FollowUp[]>([]); const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [inspectorId, setInspectorId] = useState(''); const [status, setStatus] = useState<'OPEN' | 'COMPLETED'>('OPEN');
  const [districtId, setDistrictId] = useState(''); const [alert, setAlert] = useState(''); const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<Array<string | undefined>>([undefined]); const [nextCursor, setNextCursor] = useState<string | null>(null); const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(false); const [mutationError, setMutationError] = useState(''); const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<FollowUp | null>(null); const [mode, setMode] = useState<ActionMode | null>(null); const [note, setNote] = useState(''); const [dueDate, setDueDate] = useState(''); const [completionNote, setCompletionNote] = useState(''); const [busy, setBusy] = useState(false); const [conflict, setConflict] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const [inspector, districtItems] = await Promise.all([getCurrentInspector(), getCurrentDistricts()]);
      if (!inspector) throw new Error('session');
      setInspectorId(inspector.id); setDistricts(districtItems);
      const response = await listFollowUps({ status, limit: 25, ...(districtId ? { districtId } : {}), ...(alert ? { alert: alert as 'OVERDUE' | 'DUE_TODAY' } : {}), ...(cursor ? { cursor } : {}) });
      setRows(response.data); setTotal(response.page.total); setNextCursor(response.page.nextCursor);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }, [status, districtId, alert, cursor]);
  useEffect(() => { void load(); }, [load]);

  function changeFilter(update: () => void) { update(); setCursor(undefined); setHistory([undefined]); setNotice(''); }
  function openAction(row: FollowUp, action: ActionMode) {
    setSelected(row); setMode(action); setNote(row.note); setDueDate(row.dueDate); setCompletionNote(''); setMutationError(''); setConflict(false);
  }
  function movePage(next: string | undefined) { setCursor(next); setHistory((current) => [...current, next]); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !mode || busy) return;
    const submittedText = mode === 'EDIT' ? note : completionNote;
    if (submittedText.trim() && Array.from(submittedText.normalize('NFC').trim().replace(/\s+/gu, ' ')).length > 1000) {
      setMutationError('يجب ألا يتجاوز النص 1000 حرف.'); return;
    }
    setBusy(true); setMutationError(''); setNotice('');
    try {
      if (mode === 'EDIT') await patchFollowUp(selected.id, { operation: 'EDIT', expectedRevision: selected.revision, note, dueDate });
      else await patchFollowUp(selected.id, { operation: 'COMPLETE', expectedRevision: selected.revision, ...(completionNote.trim() ? { completionNote } : {}) });
      setMode(null); setSelected(null); setNotice(mode === 'EDIT' ? 'تم حفظ التعديل.' : 'تم إكمال إجراء المتابعة.'); await load();
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'FOLLOW_UP_REVISION_CONFLICT') { setConflict(true); setMode(null); setSelected(null); }
      setMutationError('تعذر تنفيذ العملية. راجع الحالة وحدّث البيانات قبل المحاولة.');
    } finally { setBusy(false); }
  }
  const statusLabel = status === 'OPEN' ? 'مفتوحة' : 'مكتملة';

  return <div className="followups-page" dir="rtl">
    <header className="followups-page__header"><div><p className="followups-page__eyebrow">المرافقة البيداغوجية</p><h1>إجراءات المتابعة</h1><p>متابعات مرتبطة بتقارير المرافقة النهائية.</p></div></header>
    {notice ? <SuccessState title={notice} /> : null}
    {mutationError ? <ErrorState title={mutationError} action={conflict ? <Button variant="secondary" onClick={() => { setMode(null); setSelected(null); setMutationError(''); setConflict(false); void load(); }}>تحديث البيانات</Button> : undefined} /> : null}
    <Card><CardHeader title="قائمة المتابعة" description={`الحالة: ${statusLabel} · ${total} إجراء`} />
      <CardContent><div className="followups-filters">
        <label>الحالة<select className="ui-input" value={status} onChange={(event) => changeFilter(() => setStatus(event.currentTarget.value as 'OPEN' | 'COMPLETED'))}><option value="OPEN">مفتوحة</option><option value="COMPLETED">مكتملة</option></select></label>
        <label>المقاطعة<select className="ui-input" value={districtId} onChange={(event) => changeFilter(() => setDistrictId(event.currentTarget.value))}><option value="">كل المقاطعات المتاحة</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></label>
        {status === 'OPEN' ? <label>الاستحقاق<select className="ui-input" value={alert} onChange={(event) => changeFilter(() => setAlert(event.currentTarget.value))}><option value="">كل المواعيد</option><option value="OVERDUE">متأخرة</option><option value="DUE_TODAY">مستحقة اليوم</option></select></label> : null}
      </div>
      {loading ? <LoadingState label="جارٍ تحميل إجراءات المتابعة…" /> : null}
      {!loading && loadError ? <ErrorState title="تعذر تحميل إجراءات المتابعة" description="تحقق من الاتصال والصلاحية ثم أعد المحاولة." action={<Button variant="secondary" onClick={() => void load()}>إعادة التحميل</Button>} /> : null}
      {!loading && !loadError && rows.length === 0 ? <EmptyState title={status === 'OPEN' ? 'لا توجد إجراءات مفتوحة' : 'لا توجد إجراءات مكتملة'} description="ستظهر هنا إجراءات المتابعة المصرح بها ضمن مقاطعاتك." /> : null}
      {!loading && !loadError && rows.length ? <>
        <ul className="followup-list">{rows.map((row) => {
          const canMutate = row.status === 'OPEN' && row.ownerInspectorId === inspectorId;
          const attention = row.alertState === 'OVERDUE' ? 'متأخرة' : row.alertState === 'DUE_TODAY' ? 'مستحقة اليوم' : 'غير مستحقة اليوم';
          return <li key={row.id}><Card><CardHeader title={`${row.context.teacher.name} ${row.context.teacher.surname}`} description={`${row.context.institution.name} · ${row.note}`} action={<span className={`followup-badge followup-badge--${row.alertState.toLowerCase()}`}>{row.status === 'COMPLETED' ? 'مكتملة' : attention}</span>} />
            <CardContent><dl className="followup-context"><div><dt>الإجراء</dt><dd>{row.note}</dd></div><div><dt>تاريخ الاستحقاق</dt><dd><time dateTime={row.dueDate}>{row.dueDate}</time></dd></div><div><dt>حالة المتابعة</dt><dd>{row.status === 'OPEN' ? 'مفتوحة' : 'مكتملة'}</dd></div><div><dt>المؤسسة وقت الزيارة</dt><dd>{row.context.institution.name}</dd></div>{row.completionNote ? <div><dt>نتيجة المتابعة</dt><dd>{row.completionNote}</dd></div> : null}</dl>
              {canMutate ? <div className="followup-actions"><Button variant="secondary" onClick={() => openAction(row, 'EDIT')}>تعديل الإجراء</Button><Button onClick={() => openAction(row, 'COMPLETE')}>إكمال الإجراء</Button></div> : <p className="followup-readonly">{row.status === 'COMPLETED' ? 'هذه المتابعة مكتملة وللقراءة فقط.' : 'للقراءة فقط؛ التعديل متاح لمالك المتابعة.'}</p>}
            </CardContent></Card></li>;
        })}</ul>
        <nav className="followup-pagination" aria-label="صفحات إجراءات المتابعة"><Button variant="secondary" disabled={history.length <= 1 || loading} onClick={() => { const previous = history.slice(0, -1); setHistory(previous); setCursor(previous.at(-1)); }}>السابق</Button><span>عرض {rows.length} من {total}</span><Button variant="secondary" disabled={!nextCursor || loading} onClick={() => movePage(nextCursor ?? undefined)}>التالي</Button></nav>
      </> : null}
      </CardContent>
    </Card>
    <Dialog open={mode !== null} title={mode === 'EDIT' ? 'تعديل إجراء المتابعة' : 'إكمال إجراء المتابعة'} description={mode === 'COMPLETE' ? 'بعد الإكمال تصبح المتابعة للقراءة فقط.' : undefined} onClose={() => { if (!busy) { setMode(null); setSelected(null); } }}>
      <form className="followup-form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
        {mode === 'EDIT' ? <><label className="followup-form__field">الإجراء المطلوب<textarea className="ui-input" required value={note} onChange={(event) => setNote(event.currentTarget.value)} /></label><Input id="followup-due" label="تاريخ الاستحقاق" type="date" required value={dueDate} onChange={(event) => setDueDate(event.currentTarget.value)} /></> : <label className="followup-form__field">نتيجة المتابعة<textarea className="ui-input" value={completionNote} onChange={(event) => setCompletionNote(event.currentTarget.value)} /></label>}
        <div className="followup-actions"><Button type="button" variant="secondary" disabled={busy} onClick={() => { setMode(null); setSelected(null); }}>إلغاء</Button><Button type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : mode === 'EDIT' ? 'حفظ التعديل' : 'تأكيد الإكمال'}</Button></div>
      </form>
    </Dialog>
  </div>;
}
