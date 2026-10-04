import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiRequestError, getCurrentDistricts, getCurrentInspector, listFollowUps, patchFollowUp, type DistrictOption, type FollowUp } from '../auth/client';
import { Button, Card, CardContent, CardHeader, DataTable, Dialog, EmptyState, ErrorState, FilterBar, Input, LoadingState, PageHeader, Pagination, StatusBadge, SuccessState, Textarea, type DataTableColumn, type StatusTone } from '../ui';
import { ShellIcon } from '../ui/ShellIcon';
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
  const columns = useMemo<DataTableColumn<FollowUp>[]>(() => [
    { id: 'teacher', header: 'الأستاذ', render: (row) => <span className="followup-teacher"><ShellIcon name="teachers" /><bdi dir="auto">{row.context.teacher.name} {row.context.teacher.surname}</bdi></span> },
    { id: 'institution', header: 'مؤسسة الزيارة', render: (row) => <span className="followup-context"><ShellIcon name="institutions" /><bdi dir="auto">{row.context.institution.name}</bdi></span> },
    { id: 'action', header: 'الإجراء المطلوب', render: (row) => <span className="followup-note"><ShellIcon name="follow-ups" /><bdi dir="auto">{row.note}</bdi></span> },
    { id: 'dueDate', header: 'تاريخ الاستحقاق', render: (row) => <time className="followup-date" dateTime={row.dueDate} dir="auto">{row.dueDate}</time> },
    { id: 'status', header: 'الحالة', render: (row) => {
      const attention = row.alertState === 'OVERDUE' ? 'متأخرة' : row.alertState === 'DUE_TODAY' ? 'مستحقة اليوم' : 'مفتوحة';
      const tone: StatusTone = row.status === 'COMPLETED' ? 'success' : row.alertState === 'OVERDUE' ? 'danger' : row.alertState === 'DUE_TODAY' ? 'warning' : 'neutral';
      return <span className="followup-state"><ShellIcon name={row.status === 'COMPLETED' ? 'check-circle' : 'alert'} /><StatusBadge tone={tone}>{row.status === 'COMPLETED' ? 'مكتملة' : attention}</StatusBadge></span>;
    } },
    { id: 'result', header: 'نتيجة المتابعة', render: (row) => row.completionNote ? <span className="followup-result"><bdi dir="auto">{row.completionNote}</bdi></span> : '—' },
    { id: 'actions', header: 'الإجراءات', render: (row) => row.status === 'OPEN' && row.ownerInspectorId === inspectorId
      ? <div className="followup-actions"><Button variant="secondary" onClick={() => openAction(row, 'EDIT')}>تعديل الإجراء</Button><Button onClick={() => openAction(row, 'COMPLETE')}>إكمال الإجراء</Button></div>
      : 'للقراءة فقط' },
  ], [inspectorId, openAction]);

  return <div className="followups-page" dir="rtl">
    <PageHeader eyebrow="المرافقة البيداغوجية · إجراء مستقل" title="إجراءات المتابعة" description="متابعات مرتبطة بتقارير المرافقة النهائية." />
    {notice ? <SuccessState title={notice} /> : null}
    {mutationError ? <ErrorState title={mutationError} action={conflict ? <Button variant="secondary" onClick={() => { setMode(null); setSelected(null); setMutationError(''); setConflict(false); void load(); }}>تحديث البيانات</Button> : undefined} /> : null}
    <Card className="followups-card"><CardHeader title="قائمة المتابعة" description={`الحالة: ${statusLabel} · ${total} إجراء`} action={<span className="followups-card__mark" aria-hidden="true"><ShellIcon name="follow-ups" /></span>} />
      <CardContent><FilterBar title="مرشحات المتابعة"><div className="followups-filters">
        <label>الحالة<select className="ui-input" value={status} onChange={(event) => changeFilter(() => setStatus(event.currentTarget.value as 'OPEN' | 'COMPLETED'))}><option value="OPEN">مفتوحة</option><option value="COMPLETED">مكتملة</option></select></label>
        <label>المقاطعة<select className="ui-input" value={districtId} onChange={(event) => changeFilter(() => setDistrictId(event.currentTarget.value))}><option value="">كل المقاطعات المتاحة</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></label>
        {status === 'OPEN' ? <label>الاستحقاق<select className="ui-input" value={alert} onChange={(event) => changeFilter(() => setAlert(event.currentTarget.value))}><option value="">كل المواعيد</option><option value="OVERDUE">متأخرة</option><option value="DUE_TODAY">مستحقة اليوم</option></select></label> : null}
      </div></FilterBar>
      {loading ? <LoadingState label="جارٍ تحميل إجراءات المتابعة…" /> : null}
      {!loading && loadError ? <ErrorState title="تعذر تحميل إجراءات المتابعة" description="تحقق من الاتصال والصلاحية ثم أعد المحاولة." action={<Button variant="secondary" onClick={() => void load()}>إعادة التحميل</Button>} /> : null}
      {!loading && !loadError && rows.length === 0 ? <EmptyState title={status === 'OPEN' ? 'لا توجد إجراءات مفتوحة' : 'لا توجد إجراءات مكتملة'} description="ستظهر هنا إجراءات المتابعة المصرح بها ضمن مقاطعاتك." /> : null}
      {!loading && !loadError && rows.length ? <>
        <DataTable caption="إجراءات المتابعة" columns={columns} rows={rows} rowKey={(row) => row.id} />
        <Pagination label="صفحات إجراءات المتابعة" currentPage={history.length} rangeStart={total ? (history.length - 1) * 25 + 1 : 0}
          rangeEnd={(history.length - 1) * 25 + rows.length} total={total} hasPrevious={history.length > 1} hasNext={Boolean(nextCursor)}
          onPrevious={() => { const previous = history.slice(0, -1); setHistory(previous); setCursor(previous.at(-1)); }} onNext={() => movePage(nextCursor ?? undefined)} disabled={loading} />
      </> : null}
      </CardContent>
    </Card>
    <Dialog open={mode !== null} title={mode === 'EDIT' ? 'تعديل إجراء المتابعة' : 'إكمال إجراء المتابعة'} description={mode === 'COMPLETE' ? 'بعد الإكمال تصبح المتابعة للقراءة فقط.' : undefined} onClose={() => { if (!busy) { setMode(null); setSelected(null); } }}>
      <form className="followup-form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
        {selected ? <dl className="followup-dialog-context">
          <div><dt>الأستاذ</dt><dd><bdi dir="auto">{selected.context.teacher.name} {selected.context.teacher.surname}</bdi></dd></div>
          <div><dt>مؤسسة الزيارة</dt><dd><bdi dir="auto">{selected.context.institution.name}</bdi></dd></div>
          <div><dt>تاريخ الاستحقاق</dt><dd><time dateTime={selected.dueDate} dir="auto">{selected.dueDate}</time></dd></div>
        </dl> : null}
        {mode === 'EDIT' ? <><Textarea id="followup-action-note" label="الإجراء المطلوب" className="followup-form__note" required value={note} onChange={(event) => setNote(event.currentTarget.value)} /><Input id="followup-due" label="تاريخ الاستحقاق" type="date" required value={dueDate} onChange={(event) => setDueDate(event.currentTarget.value)} /></> : <Textarea id="followup-completion-note" label="نتيجة المتابعة" className="followup-form__note" value={completionNote} onChange={(event) => setCompletionNote(event.currentTarget.value)} />}
        <div className="followup-actions"><Button type="button" variant="secondary" disabled={busy} onClick={() => { setMode(null); setSelected(null); }}>إلغاء</Button><Button type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : mode === 'EDIT' ? 'حفظ التعديل' : 'تأكيد الإكمال'}</Button></div>
      </form>
    </Dialog>
  </div>;
}
