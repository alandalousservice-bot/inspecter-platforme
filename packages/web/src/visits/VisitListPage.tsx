import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiRequestError, getCurrentDistricts, listPedagogicalVisits, type DistrictOption, type Institution, type PedagogicalVisit, type TeacherDirectoryItem, type VisitFilters } from '../auth/client';
import { Button, DataTable, EmptyState, ErrorState, FilterBar, Input, LoadingState, PageHeader, RecordList, RecordRow, SecondaryControls, WorkspaceStack, type DataTableColumn } from '../ui';
import { InstitutionPicker, TeacherPicker } from './VisitPickers';
import { VisitStatusBadge } from './VisitStatusBadge';
import { VisitTypeBadge } from './VisitTypeBadge';
import { visitTypeLabels } from './visit-type-labels';
import { formatAlgiers, localDateTimeToOffset, nextLocalDate } from './time';
import './visits.css';
import './visit-workspace.css';

const PAGE_SIZE = 25;
const allowedKeys = ['districtId', 'teacherId', 'institutionId', 'status', 'visitType', 'fromDate', 'toDate'] as const;
function VisitPeriod({ visit }: { visit: PedagogicalVisit }) {
  const start = visit.actualStartAt ?? visit.scheduledStartAt; const end = visit.actualEndAt ?? visit.scheduledEndAt;
  return <div className="visit-workspace__period"><small>{visit.intervalKind === 'ACTUAL_RETROSPECTIVE' ? 'الفترة الفعلية للزيارة' : 'الموعد المخطط'}</small>{start && end ? <><span>من <time dateTime={start}><bdi dir="auto">{formatAlgiers(start)}</bdi></time></span><span>إلى <time dateTime={end}><bdi dir="auto">{formatAlgiers(end)}</bdi></time></span></> : <span>الفترة غير متاحة</span>}</div>;
}

function normalizeParams(params: URLSearchParams) {
  const next = new URLSearchParams();
  for (const key of allowedKeys) { const value = params.get(key); if (value) next.set(key, value); }
  return next;
}

function buildFilters(params: URLSearchParams, cursor?: string): VisitFilters {
  const filters: VisitFilters = { limit: PAGE_SIZE };
  for (const key of ['districtId', 'teacherId', 'institutionId', 'status', 'visitType'] as const) {
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
  const [mobile, setMobile] = useState(() => window.matchMedia?.('(max-width: 64rem)').matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 64rem)');
    if (!query) return;
    const update = () => setMobile(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

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

  const identity = (visit: PedagogicalVisit) => <Link className="visit-workspace__identity" to={`/app/teachers/${encodeURIComponent(visit.teacher.id)}`}><bdi dir="auto">{visit.teacher.name} {visit.teacher.surname}</bdi></Link>;
  const context = (visit: PedagogicalVisit) => <div className="visit-workspace__context"><bdi dir="auto">{visit.institution.name}</bdi><VisitTypeBadge type={visit.visitType} />{districts.length > 1 ? <small>{districts.find((district) => district.id === visit.districtId)?.name ?? 'ضمن النطاق الحالي'}</small> : null}</div>;
  const period = (visit: PedagogicalVisit) => <VisitPeriod visit={visit} />;
  const action = (visit: PedagogicalVisit) => <Link className="ui-button ui-button--secondary" aria-label={`تفاصيل الزيارة — ${visit.teacher.name} ${visit.teacher.surname}`} to={`/app/visits/${encodeURIComponent(visit.id)}${filterKey ? `?${filterKey}` : ''}`}>تفاصيل الزيارة</Link>;
  const columns: DataTableColumn<PedagogicalVisit>[] = [
    { id: 'teacher', header: 'الأستاذ', render: identity },
    { id: 'context', header: 'مؤسسة الزيارة ونوعها', render: context },
    { id: 'time', header: 'الفترة', render: period },
    { id: 'status', header: 'الحالة', render: (visit) => <VisitStatusBadge status={visit.status} /> },
    { id: 'action', header: 'الإجراء', render: action },
  ];

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
  return <section className="visit-page visit-workspace" dir="rtl"><WorkspaceStack density="operational">
    <PageHeader variant="compact" title="الزيارات التربوية"
      primaryAction={<Link className="ui-button ui-button--primary" to={`/app/visits/new${filterKey ? `?${filterKey}` : ''}`}>زيارة جديدة</Link>} />
    <FilterBar variant="workspace" className="visit-workspace__filters" summary={<span aria-live="polite">{loading ? 'جارٍ تحميل النتائج…' : loadError ? 'إجمالي النتائج: غير متاح' : `إجمالي النتائج: ${total}`}</span>}
      secondaryControls={<SecondaryControls label="فترة الزيارة" defaultExpanded={Boolean(params.get('fromDate') || params.get('toDate'))} hasErrors={Boolean(filterError)} activeIndicator={params.get('fromDate') || params.get('toDate') ? <span>مرشح التاريخ مفعّل</span> : undefined}>
        <form className="visit-date-filter" onSubmit={applyDateFilter}>
          <Input id="visit-filter-from" name="fromDate" label="من تاريخ الموعد" type="date" defaultValue={params.get('fromDate') ?? ''} />
          <Input id="visit-filter-to" name="toDate" label="إلى تاريخ الموعد (شامل)" type="date" defaultValue={params.get('toDate') ?? ''} />
          <Button type="submit">تطبيق التاريخ</Button>
        </form>{filterError ? <p role="alert">{filterError}</p> : null}
      </SecondaryControls>}>
      {districtError ? <p role="alert">تعذر تحميل المقاطعات. تبقى صلاحيات البيانات محددة من الخادم.</p> : null}
      {districts.length > 1 ? <div className="visit-filter"><label className="ui-field__label" htmlFor="visit-filter-district">المقاطعة</label><select id="visit-filter-district" className="ui-input" value={selectedDistrict} onChange={(event) => { setTeacher(null); setInstitution(null); updateFilters({ districtId: event.currentTarget.value || undefined, teacherId: undefined, institutionId: undefined }); }}><option value="">كل المقاطعات الحالية</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></div> : null}
      <SecondaryControls label="الأستاذ والمؤسسة" defaultExpanded={Boolean(params.get('teacherId') || params.get('institutionId'))} activeIndicator={params.get('teacherId') || params.get('institutionId') ? <span>تحديد الأستاذ أو المؤسسة مفعّل</span> : undefined}>
      {teacherScope ? <TeacherPicker districtId={teacherScope} selected={teacher} onSelect={(value) => { setTeacher(value); updateFilters({ teacherId: value?.id }); }} /> : null}
      {!teacherScope && districts.length > 1 ? <p>اختر مقاطعة لتحديد أستاذ أو مؤسسة.</p> : null}
      {institutionScope ? <InstitutionPicker districtId={institutionScope} selected={institution} onSelect={(value) => { setInstitution(value); updateFilters({ institutionId: value?.id }); }} /> : null}
      </SecondaryControls>
      <div className="visit-filter"><label className="ui-field__label" htmlFor="visit-filter-status">حالة الزيارة</label><select id="visit-filter-status" className="ui-input" value={params.get('status') ?? ''} onChange={(event) => updateFilters({ status: event.currentTarget.value || undefined })}><option value="">كل الحالات</option><option value="PLANNED">مخططة</option><option value="COMPLETED">مكتملة</option><option value="CANCELLED">ملغاة</option></select></div>
      <div className="visit-filter"><label className="ui-field__label" htmlFor="visit-filter-type">نوع الزيارة</label><select id="visit-filter-type" className="ui-input" value={params.get('visitType') ?? ''} onChange={(event) => updateFilters({ visitType: event.currentTarget.value || undefined })}><option value="">كل الأنواع، بما فيها السجلات السابقة غير الموثقة</option>{Object.entries(visitTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <Button variant="secondary" onClick={() => { setTeacher(null); setInstitution(null); updateFilters(Object.fromEntries(allowedKeys.map((key) => [key, undefined]))); }}>مسح المرشحات</Button>
      </FilterBar>
    <div className="visit-workspace__results">
        {loading ? <LoadingState compact label="جارٍ تحميل الزيارات…" /> : null}
        {!loading && loadError ? <ErrorState compact title="تعذر تحميل الزيارات" description="تحقق من الاتصال ثم أعد المحاولة." action={<Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>إعادة المحاولة</Button>} /> : null}
        {!loading && !loadError && !rows.length ? <EmptyState compact kind={filterKey ? 'no-results' : 'no-data'} title={filterKey ? 'لا توجد زيارات مطابقة' : 'لا توجد زيارات بعد'} description={filterKey ? 'جرّب تغيير المرشحات.' : 'خطط زيارة جديدة لبدء متابعة العمل الميداني.'} /> : null}
        {!loading && !loadError && rows.length ? <>
          {mobile ? <RecordList label="قائمة الزيارات التربوية" density="operational">{rows.map((visit) => <RecordRow key={visit.id} identity={identity(visit)} context={context(visit)} metadata={period(visit)} status={<VisitStatusBadge status={visit.status} />} actions={action(visit)} />)}</RecordList> : <DataTable caption="قائمة الزيارات التربوية" captionVisibility="accessible-only" columns={columns} rows={rows} rowKey={(visit) => visit.id} />}
          <nav className="visit-pagination" aria-label="صفحات الزيارات"><span>صفحة {pageIndex + 1} — إجمالي النتائج: {total}</span>
            <Button variant="secondary" disabled={pageIndex === 0 || loading} onClick={() => setPageIndex((index) => Math.max(0, index - 1))}>السابق</Button>
            <Button variant="secondary" disabled={!nextCursor || loading} onClick={() => { if (!nextCursor) return; setCursorHistory((history) => [...history.slice(0, pageIndex + 1), nextCursor]); setPageIndex((index) => index + 1); }}>النتائج التالية</Button>
          </nav>
        </> : null}
    </div>
  </WorkspaceStack></section>;
}
