import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiRequestError, getCurrentDistricts, listPedagogicalVisits, type DistrictOption, type Institution, type PedagogicalVisit, type PedagogicalVisitStatus, type TeacherDirectoryItem, type VisitFilters } from '../auth/client';
import { Button, Card, CardContent, CardHeader, DataTable, EmptyState, ErrorState, Input, LoadingState, type DataTableColumn } from '../ui';
import { InstitutionPicker, TeacherPicker } from './VisitPickers';
import { formatAlgiers, localDateTimeToOffset, nextLocalDate } from './time';
import './visits.css';

const PAGE_SIZE = 25;
const statusLabels: Record<PedagogicalVisitStatus, string> = { PLANNED: 'مخططة', COMPLETED: 'مكتملة', CANCELLED: 'ملغاة' };
const allowedKeys = ['districtId', 'teacherId', 'institutionId', 'status', 'fromDate', 'toDate'] as const;

function normalizeParams(params: URLSearchParams) {
  const next = new URLSearchParams();
  for (const key of allowedKeys) { const value = params.get(key); if (value) next.set(key, value); }
  return next;
}

function buildFilters(params: URLSearchParams, cursor?: string): VisitFilters {
  const filters: VisitFilters = { limit: PAGE_SIZE };
  for (const key of ['districtId', 'teacherId', 'institutionId', 'status'] as const) {
    const value = params.get(key);
    if (value) Object.assign(filters, { [key]: value });
  }
  const fromDate = params.get('fromDate'); const toDate = params.get('toDate');
  if (fromDate) filters.from = localDateTimeToOffset(`${fromDate}T00:00` ) ?? undefined;
  if (toDate) {
    const dayAfter = nextLocalDate(toDate);
    filters.to = dayAfter ? localDateTimeToOffset(`${dayAfter}T00:00`) ?? undefined : undefined;
  }
  if (cursor) filters.cursor = cursor;
  return filters;
}

export function VisitListPage() {
  const [rawParams, setParams] = useSearchParams();
  const params = useMemo(() => normalizeParams(rawParams), [rawParams]);
  const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [districtError, setDistrictError] = useState(false);
  const [teacher, setTeacher] = useState<TeacherDirectoryItem | null>(null);
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [rows, setRows] = useState<PedagogicalVisit[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [filterError, setFilterError] = useState('');
  const filterKey = params.toString();
  const activeCursor = cursorHistory[pageIndex];

  useEffect(() => { let active = true;
    void getCurrentDistricts().then((items) => { if (active) { setDistricts(items); setDistrictError(false); } })
      .catch(() => { if (active) { setDistricts([]); setDistrictError(true); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true; setLoading(true); setLoadError(false);
    void listPedagogicalVisits(buildFilters(new URLSearchParams(filterKey), activeCursor))
      .then((result) => { if (active) { setRows(result.data); setTotal(result.page.total); setNextCursor(result.page.nextCursor); } })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiRequestError && error.code === 'NOT_FOUND' && activeCursor) {
          setCursorHistory([undefined]); setPageIndex(0); setNextCursor(null);
        } else setLoadError(true);
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filterKey, activeCursor, retry]);

  const updateFilters = useCallback((changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    setFilterError(''); setCursorHistory([undefined]); setPageIndex(0); setNextCursor(null); setParams(next);
  }, [params, setParams]);

  const columns = useMemo<DataTableColumn<PedagogicalVisit>[]>(() => [
    { id: 'teacher', header: 'الأستاذ', render: (visit) => <Link to={`/app/visits/${encodeURIComponent(visit.id)}${filterKey ? `?${filterKey}` : ''}`}>{visit.teacher.name} {visit.teacher.surname}</Link> },
    ...(districts.length > 1 ? [{ id: 'district', header: 'المقاطعة', render: (visit: PedagogicalVisit) => districts.find((district) => district.id === visit.districtId)?.name ?? 'ضمن النطاق الحالي' }] : []),
    { id: 'institution', header: 'مؤسسة الزيارة وقت التخطيط', render: (visit) => visit.institution.name },
    { id: 'time', header: 'موعد الزيارة', render: (visit) => <span dir="auto">{formatAlgiers(visit.scheduledStartAt)} — {formatAlgiers(visit.scheduledEndAt)}</span> },
    { id: 'status', header: 'الحالة', render: (visit) => <span className={`visit-status visit-status--${visit.status.toLowerCase()}`}>{statusLabels[visit.status]}</span> },
  ], [districts, filterKey]);

  function applyDateFilter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const fromDate = String(form.get('fromDate') ?? ''); const toDate = String(form.get('toDate') ?? '');
    if (fromDate && !localDateTimeToOffset(`${fromDate}T00:00`)) { setFilterError('تحقق من تاريخ البداية.'); return; }
    if (toDate && !localDateTimeToOffset(`${toDate}T00:00`)) { setFilterError('تحقق من تاريخ النهاية.'); return; }
    if (fromDate && toDate && fromDate > toDate) { setFilterError('يجب ألا يسبق تاريخ النهاية تاريخ البداية.'); return; }
    updateFilters({ fromDate: fromDate || undefined, toDate: toDate || undefined });
  }

  const selectedDistrict = params.get('districtId') ?? '';
  const teacherScope = selectedDistrict || (districts.length === 1 ? districts[0].id : '');
  const institutionScope = teacher?.districtId ?? teacherScope;
  return <section className="visit-page" dir="rtl">
    <header className="visit-page__header"><div><h1>الزيارات التربوية</h1><p>متابعة مواعيد الزيارات وحالاتها.</p></div><Link className="ui-button ui-button--primary" to={`/app/visits/new${filterKey ? `?${filterKey}` : ''}`}>زيارة جديدة</Link></header>
    <Card><CardHeader title="مرشحات الزيارات" description="تطبق المرشحات على الخادم قبل احتساب النتائج." /><CardContent>
      {districtError ? <p role="alert">تعذر تحميل المقاطعات. تبقى صلاحيات البيانات محددة من الخادم.</p> : null}
      {districts.length > 1 ? <div className="visit-filter"><label className="ui-field__label" htmlFor="visit-filter-district">المقاطعة</label><select id="visit-filter-district" className="ui-input" value={selectedDistrict} onChange={(event) => { setTeacher(null); setInstitution(null); updateFilters({ districtId: event.currentTarget.value || undefined, teacherId: undefined, institutionId: undefined }); }}><option value="">كل المقاطعات الحالية</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></div> : null}
      {teacherScope ? <TeacherPicker districtId={teacherScope} selected={teacher} onSelect={(value) => { setTeacher(value); updateFilters({ teacherId: value?.id }); }} /> : null}
      {!teacherScope && districts.length > 1 ? <p>اختر مقاطعة لتحديد أستاذ أو مؤسسة.</p> : null}
      {institutionScope ? <InstitutionPicker districtId={institutionScope} selected={institution} onSelect={(value) => { setInstitution(value); updateFilters({ institutionId: value?.id }); }} /> : null}
      <div className="visit-filter"><label className="ui-field__label" htmlFor="visit-filter-status">حالة الزيارة</label><select id="visit-filter-status" className="ui-input" value={params.get('status') ?? ''} onChange={(event) => updateFilters({ status: event.currentTarget.value || undefined })}><option value="">كل الحالات</option><option value="PLANNED">مخططة</option><option value="COMPLETED">مكتملة</option><option value="CANCELLED">ملغاة</option></select></div>
      <form className="visit-date-filter" onSubmit={applyDateFilter}>
        <Input id="visit-filter-from" name="fromDate" label="من تاريخ الموعد" type="date" defaultValue={params.get('fromDate') ?? ''} />
        <Input id="visit-filter-to" name="toDate" label="إلى تاريخ الموعد (شامل)" type="date" defaultValue={params.get('toDate') ?? ''} />
        <Button type="submit">تطبيق التاريخ</Button>
      </form>
      {filterError ? <p role="alert">{filterError}</p> : null}
      <Button variant="secondary" onClick={() => { setTeacher(null); setInstitution(null); updateFilters(Object.fromEntries(allowedKeys.map((key) => [key, undefined]))); }}>مسح المرشحات</Button>
    </CardContent></Card>
    <Card><CardHeader title="قائمة الزيارات" description={`إجمالي النتائج: ${total}`} />
      <CardContent>
        {loading ? <LoadingState label="جارٍ تحميل الزيارات…" /> : null}
        {!loading && loadError ? <ErrorState title="تعذر تحميل الزيارات" description="تحقق من الاتصال ثم أعد المحاولة." action={<Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>إعادة المحاولة</Button>} /> : null}
        {!loading && !loadError && !rows.length ? <EmptyState title="لا توجد زيارات مطابقة" description="جرّب تغيير المرشحات أو خطط زيارة جديدة." /> : null}
        {!loading && !loadError && rows.length ? <>
          <div className="visit-desktop-list"><DataTable caption="قائمة الزيارات التربوية" columns={columns} rows={rows} rowKey={(visit) => visit.id} /></div>
          <div className="visit-mobile-list">{rows.map((visit) => <article className="visit-mobile-card" key={visit.id}>
            <h2><Link to={`/app/visits/${encodeURIComponent(visit.id)}${filterKey ? `?${filterKey}` : ''}`}>{visit.teacher.name} {visit.teacher.surname}</Link></h2>
            {districts.length > 1 ? <p><strong>المقاطعة:</strong> {districts.find((district) => district.id === visit.districtId)?.name ?? 'ضمن النطاق الحالي'}</p> : null}
            <p><strong>مؤسسة الزيارة وقت التخطيط:</strong> {visit.institution.name}</p>
            <p><strong>موعد الزيارة:</strong> <span dir="auto">{formatAlgiers(visit.scheduledStartAt)} — {formatAlgiers(visit.scheduledEndAt)}</span></p>
            <p><strong>الحالة:</strong> <span className={`visit-status visit-status--${visit.status.toLowerCase()}`}>{statusLabels[visit.status]}</span></p>
          </article>)}</div>
          <nav className="visit-pagination" aria-label="صفحات الزيارات"><span>صفحة {pageIndex + 1} — إجمالي النتائج: {total}</span>
            <Button variant="secondary" disabled={pageIndex === 0 || loading} onClick={() => setPageIndex((index) => Math.max(0, index - 1))}>السابق</Button>
            <Button variant="secondary" disabled={!nextCursor || loading} onClick={() => { if (!nextCursor) return; setCursorHistory((history) => [...history.slice(0, pageIndex + 1), nextCursor]); setPageIndex((index) => index + 1); }}>النتائج التالية</Button>
          </nav>
        </> : null}
      </CardContent>
    </Card>
  </section>;
}
