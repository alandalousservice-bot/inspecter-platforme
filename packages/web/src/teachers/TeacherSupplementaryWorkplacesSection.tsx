import { useEffect, useState, type FormEvent } from 'react';
import {
  ApiRequestError, createSupplementaryWorkplace, listInstitutions, listSupplementaryWorkplaces, patchSupplementaryWorkplace,
  type Institution, type SupplementaryWorkplace, type SupplementaryWorkplacePatch,
} from '../auth/client';
import { Button, Card, CardContent, CardHeader, EmptyState, ErrorState, Input, LoadingState } from '../ui';

type Mode = 'CREATE' | 'EDIT' | 'CLOSE' | null;
type DatesDraft = { validFrom: string; validTo: string };
const labels = { CURRENT: 'الحالية', FUTURE: 'المستقبلية', PAST: 'السابقة' } as const;
const dateValid = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
function todayAlgiers(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function safeError(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 404) return 'الأستاذ أو المؤسسة غير متاح ضمن نطاق الوصول.';
  if (error instanceof ApiRequestError && error.status === 409) return 'يتعارض هذا الإجراء مع المؤسسة الأم أو فترة أخرى. حدّث البيانات ثم حاول مجددًا.';
  return 'تعذر إكمال العملية. أعد المحاولة.';
}

export function TeacherSupplementaryWorkplacesSection({ teacherId, districtId, homeInstitutionId }: { teacherId: string; districtId: string; homeInstitutionId: string | null }) {
  const [items, setItems] = useState<SupplementaryWorkplace[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [mode, setMode] = useState<Mode>(null);
  const [activeItem, setActiveItem] = useState<SupplementaryWorkplace | null>(null);
  const [draft, setDraft] = useState<DatesDraft>({ validFrom: '', validTo: '' });
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [cursorStack, setCursorStack] = useState<string[]>(['']);
  const [page, setPage] = useState(0);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState(false);
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true); setLoadError(false);
    void listSupplementaryWorkplaces(teacherId).then(({ items: result }) => { if (live) setItems(result); })
      .catch(() => { if (live) setLoadError(true); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [teacherId, refresh]);

  useEffect(() => {
    if (mode !== 'CREATE') return undefined;
    let live = true;
    setPickerLoading(true); setPickerError(false);
    void listInstitutions({ districtId, q: query || undefined, limit: 25, cursor: cursorStack[page] || undefined })
      .then((result) => { if (live) { setInstitutions(result.data); setNextCursor(result.page.nextCursor); } })
      .catch(() => { if (live) { setInstitutions([]); setPickerError(true); } })
      .finally(() => { if (live) setPickerLoading(false); });
    return () => { live = false; };
  }, [mode, districtId, query, cursorStack, page]);

  function openCreate() {
    setMode('CREATE'); setActiveItem(null); setSelectedInstitution(null); setDraft({ validFrom: todayAlgiers(), validTo: '' });
    setQuery(''); setQ(''); setCursorStack(['']); setPage(0); setMessage(''); setValidation('');
  }

  function openEdit(item: SupplementaryWorkplace, nextMode: 'EDIT' | 'CLOSE') {
    const today = todayAlgiers();
    const nextDate = new Date(`${item.validFrom}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const closeDate = today > item.validFrom ? today : nextDate.toISOString().slice(0, 10);
    setActiveItem(item); setMode(nextMode); setDraft({ validFrom: item.validFrom, validTo: nextMode === 'CLOSE' ? closeDate : item.validTo ?? '' }); setMessage(''); setValidation('');
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCursorStack(['']); setPage(0); setQuery(q.trim());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!dateValid(draft.validFrom) || (draft.validTo && !dateValid(draft.validTo))) { setValidation('أدخل تاريخًا تقويميًا صحيحًا.'); return; }
    if (draft.validTo && draft.validTo <= draft.validFrom) { setValidation('يجب أن يكون تاريخ النهاية بعد تاريخ البداية.'); return; }
    if (mode === 'CREATE' && (!selectedInstitution || selectedInstitution.id === homeInstitutionId)) { setValidation('اختر مؤسسة متاحة ومختلفة عن المؤسسة الأم.'); return; }
    setBusy(true); setMessage(''); setValidation('');
    try {
      if (mode === 'CREATE' && selectedInstitution) {
        await createSupplementaryWorkplace(teacherId, { institutionId: selectedInstitution.id, validFrom: draft.validFrom, validTo: draft.validTo || null });
        setMessage('تمت إضافة مؤسسة تكملة النصاب.');
      } else if (activeItem) {
        const patch: SupplementaryWorkplacePatch = {};
        if (draft.validFrom !== activeItem.validFrom) patch.validFrom = draft.validFrom;
        if ((draft.validTo || null) !== activeItem.validTo) patch.validTo = draft.validTo || null;
        await patchSupplementaryWorkplace(teacherId, activeItem.id, patch);
        setMessage(mode === 'CLOSE' ? 'تم إنهاء العلاقة وحُفظ سجلها.' : 'تم تصحيح تواريخ العلاقة.');
      }
      setMode(null); setActiveItem(null); setRefresh((value) => value + 1);
    } catch (error) { setMessage(safeError(error)); }
    finally { setBusy(false); }
  }

  const grouped = {
    CURRENT: items.filter((item) => item.isCurrent),
    FUTURE: items.filter((item) => !item.isCurrent && item.validFrom > todayAlgiers()),
    PAST: items.filter((item) => !item.isCurrent && item.validFrom <= todayAlgiers()),
  };

  return <Card className="teacher-supplementary">
    <CardHeader title="مؤسسات تكملة النصاب" description="علاقات معتمدة مستقلة عن المؤسسة الأم، مع حفظ الفترات السابقة." action={<Button onClick={openCreate}>إضافة مؤسسة تكملة النصاب</Button>} />
    <CardContent>
      {message ? <p role="status">{message}</p> : null}
      {loading ? <LoadingState label="جارٍ تحميل مؤسسات تكملة النصاب…" /> : null}
      {!loading && loadError ? <ErrorState title="تعذر تحميل العلاقات" description="أعد المحاولة. لم تتغير بيانات الأستاذ." action={<Button variant="secondary" onClick={() => setRefresh((value) => value + 1)}>إعادة المحاولة</Button>} /> : null}
      {!loading && !loadError && items.length === 0 ? <EmptyState title="لا توجد مؤسسات تكملة نصاب مسجلة" description="يمكن إضافة مؤسسة معتمدة في مقاطعة الأستاذ." /> : null}
      {!loading && !loadError ? (['CURRENT', 'FUTURE', 'PAST'] as const).map((state) => {
        if (state !== 'CURRENT' && grouped[state].length === 0) return null;
        const content = <section className="teacher-supplementary__group" aria-labelledby={`supplementary-${state}`}>
        <h3 id={`supplementary-${state}`}>{labels[state]} ({grouped[state].length})</h3>
        {grouped[state].length ? <ul className="teacher-supplementary__list">{grouped[state].map((item) => <li key={item.id}>
          <div><strong><bdi dir="auto">{item.institution.name}</bdi></strong>{item.institution.municipality ? <span> — <bdi dir="auto">{item.institution.municipality}</bdi></span> : null}
            {item.institution.archivedAt ? <span className="teacher-supplementary__archived"> (مؤسسة مؤرشفة)</span> : null}
            <p>من <bdi dir="ltr">{item.validFrom}</bdi> إلى <bdi dir="auto">{item.validTo ?? 'مفتوحة'}</bdi></p>
          </div>
          <div className="teacher-profile__actions">
            <Button variant="secondary" onClick={() => openEdit(item, 'EDIT')}>تصحيح التواريخ</Button>
            {item.isCurrent && item.validTo === null ? <Button variant="secondary" onClick={() => openEdit(item, 'CLOSE')}>إنهاء العلاقة</Button> : null}
          </div>
        </li>)}</ul> : <p className="teacher-profile__unassigned">لا توجد علاقات ضمن هذه الفئة.</p>}
      </section>;
        return state === 'CURRENT' ? <div key={state}>{content}</div> : <details key={state} className="teacher-dossier__disclosure"><summary>علاقات تكملة النصاب {labels[state]} ({grouped[state].length})</summary>{content}</details>;
      }) : null}
    </CardContent>
    {mode ? <div className="teacher-supplementary__editor" role="region" aria-labelledby="supplementary-editor-title">
      <h3 id="supplementary-editor-title">{mode === 'CREATE' ? 'إضافة مؤسسة تكملة النصاب' : mode === 'CLOSE' ? 'إنهاء العلاقة' : 'تصحيح تواريخ العلاقة'}</h3>
      {mode === 'CREATE' ? <>
        <form onSubmit={submitSearch} className="teacher-workplace__search" role="search">
          <Input id="supplementary-search" label="البحث عن مؤسسة نشطة" value={q} onChange={(event) => setQ(event.currentTarget.value)} />
          <Button type="submit" disabled={pickerLoading}>بحث</Button>
        </form>
        {pickerLoading ? <LoadingState label="جارٍ تحميل المؤسسات…" /> : null}
        {!pickerLoading && pickerError ? <ErrorState title="تعذر تحميل المؤسسات" description="أعد المحاولة." action={<Button variant="secondary" onClick={() => setQuery((value) => `${value} `)}>إعادة المحاولة</Button>} /> : null}
        {!pickerLoading && !pickerError && institutions.length === 0 ? <EmptyState title="لا توجد مؤسسات مطابقة" description="استخدم البحث عن مؤسسة نشطة في مقاطعة الأستاذ." /> : null}
        {!pickerLoading && !pickerError ? <ul className="teacher-workplace__institution-list">{institutions.filter((institution) => institution.id !== homeInstitutionId && institution.archivedAt === null).map((institution) => <li key={institution.id}>
          <Button type="button" variant="secondary" aria-pressed={selectedInstitution?.id === institution.id} onClick={() => { setSelectedInstitution(institution); setValidation(''); }}>
            {institution.name}{institution.municipality ? ` — ${institution.municipality}` : ''}
          </Button>
        </li>)}</ul> : null}
        <div className="teacher-profile__actions">
          <Button type="button" variant="secondary" disabled={page === 0 || pickerLoading} onClick={() => setPage((value) => Math.max(0, value - 1))}>السابق</Button>
          <Button type="button" variant="secondary" disabled={!nextCursor || pickerLoading} onClick={() => { if (!nextCursor) return; setCursorStack((stack) => [...stack.slice(0, page + 1), nextCursor]); setPage((value) => value + 1); }}>التالي</Button>
        </div>
        {selectedInstitution ? <p role="status">المؤسسة المختارة: {selectedInstitution.name}</p> : null}
      </> : <p>{activeItem?.institution.name}</p>}
      <form className="teacher-supplementary__dates" onSubmit={(event) => { void submit(event); }} noValidate aria-busy={busy}>
        <Input id="supplementary-valid-from" type="date" label="تاريخ بداية العلاقة" required value={draft.validFrom} onChange={(event) => { const validFrom = event.currentTarget.value; setDraft((current) => ({ ...current, validFrom })); }} />
        <Input id="supplementary-valid-to" type="date" label="تاريخ نهاية العلاقة (اختياري)" value={draft.validTo} onChange={(event) => { const validTo = event.currentTarget.value; setDraft((current) => ({ ...current, validTo })); }} />
        {validation ? <p role="alert">{validation}</p> : null}
        <div className="teacher-profile__actions"><Button type="submit" disabled={busy || (mode === 'CREATE' && !selectedInstitution)}>{busy ? 'جارٍ الحفظ…' : mode === 'CLOSE' ? 'تأكيد الإنهاء' : 'حفظ'}</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => { setMode(null); setActiveItem(null); setValidation(''); }}>إلغاء</Button>
        </div>
      </form>
    </div> : null}
  </Card>;
}
