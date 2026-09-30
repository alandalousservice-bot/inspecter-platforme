import { useEffect, useState } from 'react';
import { ApiRequestError, listInstitutions, listTeachers, type Institution, type TeacherDirectoryItem } from '../auth/client';
import { Button, Input } from '../ui';

const PAGE_SIZE = 10;

export function TeacherPicker({ districtId, selected, onSelect, disabled = false, errorDescriptionId }: {
  districtId: string; selected: TeacherDirectoryItem | null; onSelect: (teacher: TeacherDirectoryItem | null) => void; disabled?: boolean; errorDescriptionId?: string;
}) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<TeacherDirectoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const cursor = cursorHistory[pageIndex];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = draft.trim().replace(/\s+/gu, ' ');
      if (normalized !== query) { setQuery(normalized); setCursorHistory([undefined]); setPageIndex(0); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, query]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(false);
    void listTeachers({ districtId, q: query || undefined, recordStatus: 'ACTIVE', limit: PAGE_SIZE, cursor })
      .then((result) => { if (active) { setItems(result.data); setTotal(result.page.total); setNextCursor(result.page.nextCursor); } })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof ApiRequestError && reason.code === 'NOT_FOUND' && cursor) {
          setCursorHistory([undefined]); setPageIndex(0); setNextCursor(null); setError(false);
        } else { setItems([]); setError(true); }
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [districtId, query, cursor, retry]);

  function advance() {
    if (!nextCursor) return;
    setCursorHistory((history) => [...history.slice(0, pageIndex + 1), nextCursor]); setPageIndex((index) => index + 1);
  }

  return <div className="visit-picker">
    <Input id="visit-teacher-search" label="البحث عن أستاذ" value={draft} onChange={(event) => { setDraft(event.currentTarget.value); onSelect(null); }} disabled={disabled} hint="اكتب الاسم أو اللقب للبحث في الدليل." aria-describedby={errorDescriptionId} />
    {selected ? <div className="visit-picker__selected" aria-live="polite"><span>الأستاذ المختار: {selected.name} {selected.surname}</span>
      {selected.currentInstitution ? <span>المؤسسة الحالية المعتمدة: {selected.currentInstitution.name}{selected.currentInstitution.municipality ? ` — ${selected.currentInstitution.municipality}` : ''}</span> : <span>لم تُعتمد مؤسسة حالية لهذا الأستاذ.</span>}
      <Button variant="subtle" disabled={disabled} onClick={() => onSelect(null)}>إلغاء اختيار الأستاذ</Button></div> : null}
    {loading ? <p role="status" aria-live="polite">جارٍ تحميل نتائج الأساتذة…</p> : null}
    {error ? <div role="alert"><p>تعذر تحميل دليل الأساتذة.</p><Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>إعادة المحاولة</Button></div> : null}
    {!loading && !error && !selected ? <>
      <ul className="visit-picker__results" aria-label="نتائج الأساتذة">{items.map((teacher) => <li key={teacher.id}>
        <button type="button" disabled={disabled} aria-pressed={false} onClick={() => onSelect(teacher)}>
          <span>{teacher.name} {teacher.surname}</span>
          {teacher.currentInstitution ? <small>{teacher.currentInstitution.name}{teacher.currentInstitution.municipality ? ` — ${teacher.currentInstitution.municipality}` : ''}</small> : <small>لم تُعتمد مؤسسة حالية</small>}
        </button>
      </li>)}</ul>
      {!items.length ? <p>{query ? 'لا توجد نتائج مطابقة.' : 'ابدأ بكتابة اسم الأستاذ للبحث.'}</p> : null}
      <div className="visit-picker__paging"><span>إجمالي النتائج: {total}</span>
        <Button variant="secondary" disabled={pageIndex === 0 || loading} onClick={() => setPageIndex((index) => Math.max(0, index - 1))}>السابق</Button>
        <Button variant="secondary" disabled={!nextCursor || loading} onClick={advance}>نتائج أخرى</Button></div>
    </> : null}
  </div>;
}

export function InstitutionPicker({ districtId, selected, onSelect, disabled = false }: {
  districtId?: string; selected: Institution | null; onSelect: (institution: Institution | null) => void; disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(draft.trim().replace(/\s+/gu, ' ')), 250);
    return () => window.clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    if (!districtId) { setItems([]); return undefined; }
    let active = true;
    setLoading(true); setError(false);
    void listInstitutions({ districtId, q: query || undefined, limit: PAGE_SIZE })
      .then((result) => { if (active) setItems(result.data); })
      .catch(() => { if (active) { setItems([]); setError(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [districtId, query]);
  return <div className="visit-picker">
    <Input id="visit-institution-search" label="البحث عن مؤسسة" value={draft} onChange={(event) => { setDraft(event.currentTarget.value); onSelect(null); }} disabled={disabled || !districtId} hint="اختياري؛ البحث محدود بالمؤسسات النشطة في المقاطعة." />
    {selected ? <div className="visit-picker__selected"><span>المؤسسة: {selected.name}</span><Button variant="subtle" disabled={disabled} onClick={() => onSelect(null)}>مسح المؤسسة</Button></div> : null}
    {loading ? <p role="status">جارٍ تحميل المؤسسات…</p> : null}
    {error ? <p role="alert">تعذر تحميل المؤسسات. عدّل البحث لإعادة المحاولة.</p> : null}
    {!selected && !loading && !error ? <ul className="visit-picker__results" aria-label="نتائج المؤسسات">{items.map((item) => <li key={item.id}><button type="button" disabled={disabled} onClick={() => onSelect(item)}>{item.name}</button></li>)}</ul> : null}
  </div>;
}
