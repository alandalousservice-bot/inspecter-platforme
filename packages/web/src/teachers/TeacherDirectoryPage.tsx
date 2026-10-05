import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiRequestError, getCurrentDistricts, listInstitutions, listTeachers, type DistrictOption, type Institution, type TeacherDirectoryFilters, type TeacherDirectoryItem } from '../auth/client';
import { Button, DataTable, EmptyState, ErrorState, FilterBar, Input, LoadingState, PageHeader, Pagination, RecordList, RecordRow, SecondaryControls, StatusBadge, WorkspaceStack, type DataTableColumn } from '../ui';
import './teacher-directory.css';

const LIMIT = 25;
const PROFESSIONAL_LABELS = { PERMANENT: 'مرسم', TRAINEE: 'متربص', CONTRACT: 'متعاقد', TEMPORARY_CONTRACT: 'متعاقد مؤقت', SUBSTITUTE: 'مستخلف' } as const;
const DAYS = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
const SEARCH_KEYS = ['q', 'districtId', 'institutionId', 'hasCurrentInstitution', 'professionalStatus', 'recordStatus', 'academicYear', 'dayOfWeek', 'minuteOfDay', 'worksToday', 'worksNow'] as const;

function validAcademicYear(value: string) {
  return /^\d{4}-\d{4}$/u.test(value) && Number(value.slice(5)) === Number(value.slice(0, 4)) + 1;
}

export function parseTimeToMinute(value: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/u.exec(value);
  if (!match) return undefined;
  const hours = Number(match[1]); const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

function minuteToTime(value: string | null) {
  if (value === null || !/^\d{1,4}$/u.test(value)) return '';
  const minute = Number(value);
  if (minute < 0 || minute > 1439) return '';
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function buildFilters(params: URLSearchParams, cursor?: string): TeacherDirectoryFilters {
  const filters: TeacherDirectoryFilters = { limit: LIMIT };
  if (cursor) filters.cursor = cursor;
  for (const key of SEARCH_KEYS) {
    const value = params.get(key);
    if (value !== null && value !== '') Object.assign(filters, { [key]: value });
  }
  if (params.has('hasCurrentInstitution')) filters.hasCurrentInstitution = params.get('hasCurrentInstitution') === 'true';
  const year = params.get('academicYear') ?? '';
  const hasSchedule = params.has('dayOfWeek') || params.has('minuteOfDay') || params.has('worksToday') || params.has('worksNow');
  if (!validAcademicYear(year) || !hasSchedule) {
    delete filters.academicYear;
    delete filters.dayOfWeek;
    delete filters.minuteOfDay;
    delete filters.worksToday;
    delete filters.worksNow;
  } else {
    filters.academicYear = year;
    const day = Number(params.get('dayOfWeek'));
    if (day >= 1 && day <= 7) filters.dayOfWeek = day;
    const rawMinute = params.get('minuteOfDay');
    const minute = rawMinute === null ? undefined : Number(rawMinute);
    if (minute !== undefined && Number.isInteger(minute) && minute >= 0 && minute <= 1439 && filters.dayOfWeek !== undefined) filters.minuteOfDay = minute;
    if (params.get('worksToday') === 'true') filters.worksToday = true;
    if (params.get('worksNow') === 'true') filters.worksNow = true;
  }
  return filters;
}

function updateParams(current: URLSearchParams, changes: Record<string, string | undefined>) {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') next.delete(key);
    else next.set(key, value);
  }
  return next;
}

function displayStatus(status: TeacherDirectoryItem['recordStatus']) {
  return status === 'ACTIVE' ? 'نشط' : 'غير نشط';
}

function TeacherIdentity({ row, includeRecordState = false }: { row: TeacherDirectoryItem; includeRecordState?: boolean }) {
  return <div className="teacher-directory__identity"><Link className="teacher-directory__identity-link" to={`/app/teachers/${encodeURIComponent(row.id)}`}><bdi dir="auto">{row.name} {row.surname}</bdi></Link>
    <div className="teacher-directory__record-context"><span className="teacher-directory__professional">{row.professionalStatus ? PROFESSIONAL_LABELS[row.professionalStatus] : 'غير محددة'}</span>{includeRecordState ? <span role="group" aria-label="حالة السجل"><StatusBadge tone={row.recordStatus === 'ACTIVE' ? 'success' : 'neutral'}>{displayStatus(row.recordStatus)}</StatusBadge></span> : null}</div></div>;
}

function TeacherActions({ row }: { row: TeacherDirectoryItem }) {
  return <span className="teacher-directory__actions"><Link to={`/app/teachers/${encodeURIComponent(row.id)}/schedules`} aria-label={`التوزيع الأسبوعي — ${row.name} ${row.surname}`}>التوزيع الأسبوعي</Link>
    <Link to={`/app/teachers/${encodeURIComponent(row.id)}/information-card`} aria-label={`بطاقة معلومات الأستاذ — ${row.name} ${row.surname}`}>بطاقة المعلومات</Link></span>;
}

function TeacherWorkplace({ row }: { row: TeacherDirectoryItem }) {
  return row.currentInstitution ? <span className="teacher-directory__institution"><bdi dir="auto">{row.currentInstitution.name}</bdi>{row.currentInstitution.municipality ? <small className="teacher-directory__municipality"><bdi dir="auto">{row.currentInstitution.municipality}</bdi></small> : null}</span> : <span className="teacher-directory__unassigned">لم تُعتمد مؤسسة حالية</span>;
}

export function TeacherDirectoryPage() {
  // Mount one representation only, including at real browser zoom. No duplicate
  // interactive records or off-screen desktop links in the accessibility tree.
  const [structured, setStructured] = useState(() => window.matchMedia?.('(max-width: 64rem)').matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 64rem)');
    if (!media) return;
    const update = () => setStructured(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const [params, setParams] = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(params.get('q') ?? '');
  const searchTimer = useRef<number | undefined>(undefined);
  const searchEditPending = useRef(false);
  const searchNavigation = useRef<string | null>(null);
  const [yearDraft, setYearDraft] = useState(params.get('academicYear') ?? '');
  const [rows, setRows] = useState<TeacherDirectoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [resetNotice, setResetNotice] = useState('');
  const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [districtError, setDistrictError] = useState(false);
  const [institutionQuery, setInstitutionQuery] = useState('');
  const [institutionDraft, setInstitutionDraft] = useState('');
  const [institutionOptions, setInstitutionOptions] = useState<Institution[]>([]);
  const [institutionLoading, setInstitutionLoading] = useState(false);
  const [institutionError, setInstitutionError] = useState(false);

  const activeCursor = cursorHistory[pageIndex];
  const searchKey = params.toString();

  const applyChanges = useCallback((changes: Record<string, string | undefined>) => {
    const next = updateParams(params, changes);
    next.delete('cursor');
    setCursorHistory([undefined]); setPageIndex(0); setNextCursor(null); setResetNotice('');
    setParams(next);
  }, [params, setParams]);

  useEffect(() => {
    const query = params.get('q') ?? '';
    const ownSearchCommit = searchNavigation.current === query;
    searchNavigation.current = null;
    // Committing our earlier query must not erase text typed since that push.
    // A POP explicitly clears this marker and always restores the URL instead.
    if (ownSearchCommit && searchEditPending.current) return;
    searchEditPending.current = false;
    window.clearTimeout(searchTimer.current);
    setSearchDraft(query);
  }, [params]);
  useEffect(() => { setYearDraft(params.get('academicYear') ?? ''); }, [params]);

  useEffect(() => {
    // Browser history changes synchronously, but BrowserRouter commits through
    // a React transition. A rapid push/POP can skip the intermediate params
    // render entirely. Reconcile from the restored URL at the native POP boundary.
    const restoreSearch = () => {
      searchNavigation.current = null;
      searchEditPending.current = false;
      window.clearTimeout(searchTimer.current);
      setSearchDraft(new URLSearchParams(window.location.search).get('q') ?? '');
    };
    window.addEventListener('popstate', restoreSearch);
    return () => {
      window.removeEventListener('popstate', restoreSearch);
      window.clearTimeout(searchTimer.current);
    };
  }, []);

  useEffect(() => {
    // Only a user edit may schedule a search, never a history-restored draft.
    if (!searchEditPending.current) return;
    const normalized = searchDraft.trim().replace(/\s+/gu, ' ');
    if (normalized === (params.get('q') ?? '')) return;
    const timer = window.setTimeout(() => {
      searchNavigation.current = normalized;
      searchEditPending.current = false;
      applyChanges({ q: normalized || undefined });
    }, 350);
    searchTimer.current = timer;
    return () => window.clearTimeout(timer);
  }, [searchDraft, params, applyChanges]);

  useEffect(() => {
    let active = true;
    void getCurrentDistricts().then((items) => { if (active) { setDistricts(items); setDistrictError(false); } })
      .catch(() => { if (active) { setDistricts([]); setDistrictError(true); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!institutionQuery.trim()) { setInstitutionOptions([]); setInstitutionLoading(false); setInstitutionError(false); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setInstitutionLoading(true); setInstitutionError(false);
      void listInstitutions({ q: institutionQuery.trim(), districtId: params.get('districtId') ?? undefined, limit: 25 })
        .then((result) => { if (active) setInstitutionOptions(result.data); })
        .catch(() => { if (active) { setInstitutionOptions([]); setInstitutionError(true); } })
        .finally(() => { if (active) setInstitutionLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [institutionQuery, params]);

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(false);
    void listTeachers(buildFilters(new URLSearchParams(searchKey), activeCursor))
      .then((result) => {
        if (!active) return;
        setRows(result.data); setTotal(result.page.total); setNextCursor(result.page.nextCursor);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiRequestError && error.code === 'NOT_FOUND' && activeCursor) {
          setCursorHistory([undefined]); setPageIndex(0); setNextCursor(null);
          setResetNotice('تغيّرت النتائج أو انتهت صلاحية مؤشر الصفحة؛ عُدنا إلى بداية القائمة.');
        } else setLoadError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [searchKey, activeCursor, refreshKey]);

  const columns = useMemo<DataTableColumn<TeacherDirectoryItem>[]>(() => [
    { id: 'teacher', header: 'الأستاذ / الصفة المهنية', render: (row) => <TeacherIdentity row={row} /> },
    { id: 'institution', header: 'المؤسسة الحالية المعتمدة', render: (row) => <><TeacherWorkplace row={row} />{districts.length > 1 ? <small className="teacher-directory__district">{districts.find((district) => district.id === row.districtId)?.name ?? 'غير متاحة'}</small> : null}</> },
    { id: 'status', header: 'حالة السجل', render: (row) => <StatusBadge tone={row.recordStatus === 'ACTIVE' ? 'success' : 'neutral'}>{displayStatus(row.recordStatus)}</StatusBadge> },
    { id: 'actions', header: 'روابط مساندة', render: (row) => <TeacherActions row={row} /> },
  ], [districts]);

  function handleYearChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.currentTarget.value;
    setYearDraft(value);
    if (!value) applyChanges({ academicYear: undefined, dayOfWeek: undefined, minuteOfDay: undefined, worksToday: undefined, worksNow: undefined });
    else if (validAcademicYear(value)) applyChanges({ academicYear: value });
  }

  function handleDayChange(event: ChangeEvent<HTMLSelectElement>) {
    const dayOfWeek = event.currentTarget.value;
    applyChanges({ dayOfWeek: dayOfWeek || undefined, minuteOfDay: undefined });
  }

  function handleTimeChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.currentTarget.value;
    const minute = value ? parseTimeToMinute(value) : undefined;
    applyChanges({ minuteOfDay: minute === undefined ? undefined : String(minute) });
  }

  function handleNext() {
    if (!nextCursor) return;
    setCursorHistory((history) => [...history.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((index) => index + 1);
  }

  function handlePrevious() {
    if (pageIndex === 0) return;
    setPageIndex((index) => index - 1);
  }

  function resetFilters() {
    setSearchDraft(''); setYearDraft(''); setInstitutionDraft(''); setInstitutionQuery('');
    setCursorHistory([undefined]); setPageIndex(0); setNextCursor(null); setParams({});
  }

  const filtered = [...params.keys()].some((key) => SEARCH_KEYS.includes(key as typeof SEARCH_KEYS[number]));
  const yearIsValid = validAcademicYear(yearDraft);
  const timeIsAvailable = yearIsValid && !!params.get('dayOfWeek');
  const activeScheduleCount = ['dayOfWeek', 'minuteOfDay', 'worksToday', 'worksNow'].filter((key) => params.has(key)).length;

  return <section className="teacher-directory" dir="rtl">
    <WorkspaceStack density="compact">
    <PageHeader variant="compact" title="دليل الأساتذة" description="ابحث عن أستاذ وافتح ملفه المهني." />
        <FilterBar variant="workspace" summary={<span aria-live="polite">إجمالي النتائج: {loading ? '…' : loadError ? 'غير متاح' : total}</span>}
          activeFilters={filtered ? <span>مرشحات نشطة</span> : null}
          actions={filtered ? <Button variant="secondary" onClick={resetFilters}>مسح المرشحات</Button> : null}>
        <div className="teacher-directory__filters">
          <Input id="teacher-directory-search" label="البحث عن أستاذ" placeholder="الاسم أو اللقب أو بيانات البحث المتاحة" value={searchDraft} onChange={(event) => { searchEditPending.current = true; setSearchDraft(event.currentTarget.value); }} autoComplete="off" />
          {districts.length > 1 ? <div className="ui-field"><label className="ui-field__label" htmlFor="teacher-district-filter">المقاطعة</label><select id="teacher-district-filter" className="ui-input" value={params.get('districtId') ?? ''} onChange={(event) => applyChanges({ districtId: event.currentTarget.value || undefined, institutionId: undefined })}><option value="">كل المقاطعات المتاحة</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></div> : null}
          {districtError ? <p className="teacher-directory__hint" role="status">تعذر تحميل أسماء المقاطعات؛ تبقى صلاحية النطاق لدى الخادم.</p> : null}
          <div className="teacher-directory__institution-filter"><Input id="teacher-institution-search" label="البحث عن مؤسسة حالية معتمدة" value={institutionDraft} onChange={(event) => { setInstitutionDraft(event.currentTarget.value); setInstitutionQuery(event.currentTarget.value); }} placeholder="اكتب للبحث في المؤسسات المتاحة" autoComplete="off" />
            {institutionLoading ? <span className="teacher-directory__hint" role="status">جارٍ البحث عن المؤسسات…</span> : null}
            {institutionError ? <span className="teacher-directory__hint" role="alert">تعذر تحميل المؤسسات المطابقة.</span> : null}
            {institutionOptions.length ? <select aria-label="نتائج المؤسسات" className="ui-input" value={params.get('institutionId') ?? ''} onChange={(event) => { const selected = institutionOptions.find((item) => item.id === event.currentTarget.value); setInstitutionDraft(selected?.name ?? ''); applyChanges({ institutionId: selected?.id, hasCurrentInstitution: selected ? 'true' : undefined }); }}><option value="">كل المؤسسات الحالية</option>{institutionOptions.map((institution) => <option value={institution.id} key={institution.id}>{institution.name}</option>)}</select> : null}
            {params.has('institutionId') && !institutionDraft ? <span className="teacher-directory__hint" role="status">هناك تصفية محفوظة حسب مؤسسة حالية.</span> : null}
            {params.has('institutionId') ? <Button variant="secondary" onClick={() => { setInstitutionDraft(''); setInstitutionQuery(''); applyChanges({ institutionId: undefined }); }}>مسح اختيار المؤسسة</Button> : null}
          </div>
          <div className="ui-field"><label className="ui-field__label" htmlFor="teacher-assignment-filter">المؤسسة الحالية المعتمدة</label><select id="teacher-assignment-filter" className="ui-input" value={params.get('hasCurrentInstitution') ?? ''} onChange={(event) => applyChanges({ hasCurrentInstitution: event.currentTarget.value || undefined, institutionId: event.currentTarget.value === 'false' ? undefined : params.get('institutionId') ?? undefined })}><option value="">الكل</option><option value="true">لديه مؤسسة حالية معتمدة</option><option value="false">لم تُعتمد له مؤسسة حالية</option></select></div>
          <div className="ui-field"><label className="ui-field__label" htmlFor="teacher-professional-filter">الصفة المهنية</label><select id="teacher-professional-filter" className="ui-input" value={params.get('professionalStatus') ?? ''} onChange={(event) => applyChanges({ professionalStatus: event.currentTarget.value || undefined })}><option value="">كل الصفات</option><option value="PERMANENT">مرسم</option><option value="TRAINEE">متربص</option><option value="CONTRACT">متعاقد</option><option value="TEMPORARY_CONTRACT">متعاقد مؤقت</option><option value="SUBSTITUTE">مستخلف</option></select></div>
          <div className="ui-field"><label className="ui-field__label" htmlFor="teacher-record-filter">حالة السجل</label><select id="teacher-record-filter" className="ui-input" value={params.get('recordStatus') ?? 'ACTIVE'} onChange={(event) => applyChanges({ recordStatus: event.currentTarget.value === 'ACTIVE' ? undefined : event.currentTarget.value })}><option value="ACTIVE">نشط — الافتراضي</option><option value="INACTIVE">غير نشط</option></select></div>
        </div>
        <SecondaryControls label="مرشحات التوزيع الأسبوعي" defaultExpanded={params.has('academicYear') || activeScheduleCount > 0} hasErrors={Boolean(yearDraft && !yearIsValid)} activeIndicator={activeScheduleCount ? <span className="teacher-directory__hint">مرشحات جدول نشطة: {activeScheduleCount}</span> : null}>
        <fieldset className="teacher-directory__schedule-filters"><legend>فترة العمل</legend>
          <div className="teacher-directory__schedule-grid">
            <Input id="teacher-academic-year" label="السنة الدراسية" placeholder="2026-2027" value={yearDraft} onChange={handleYearChange} hint="أدخل السنة صراحةً بصيغة YYYY-YYYY؛ لا تُختار تلقائيًا." error={yearDraft && !yearIsValid ? 'تحقق من صيغة السنة وأن تكون السنتان متتاليتين.' : undefined} />
            <div className="ui-field"><label className="ui-field__label" htmlFor="teacher-day-filter">يوم العمل</label><select id="teacher-day-filter" className="ui-input" disabled={!yearIsValid} value={params.get('dayOfWeek') ?? ''} onChange={handleDayChange}><option value="">كل الأيام</option>{DAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select>{!yearIsValid ? <span className="teacher-directory__hint">حدد سنة دراسية صحيحة أولًا.</span> : null}</div>
            <Input id="teacher-time-filter" label="وقت الحصة" type="time" value={minuteToTime(params.get('minuteOfDay'))} disabled={!timeIsAvailable} onChange={handleTimeChange} hint={!params.get('dayOfWeek') ? 'حدد السنة واليوم أولًا.' : 'يُبحث ضمن الحصة التي تشمل هذا الوقت.'} />
            <label className="teacher-directory__check"><input type="checkbox" checked={params.get('worksToday') === 'true'} disabled={!yearIsValid} onChange={(event) => applyChanges({ worksToday: event.currentTarget.checked ? 'true' : undefined })} /> يعمل اليوم</label>
            <label className="teacher-directory__check"><input type="checkbox" checked={params.get('worksNow') === 'true'} disabled={!yearIsValid} onChange={(event) => applyChanges({ worksNow: event.currentTarget.checked ? 'true' : undefined })} /> يعمل الآن</label>
          </div>
        </fieldset>
        </SecondaryControls>
        </FilterBar>
    <div className="teacher-directory__results">
        {resetNotice ? <p className="teacher-directory__notice" role="status">{resetNotice}</p> : null}
        {loading ? <LoadingState compact label="جارٍ تحميل دليل الأساتذة…" /> : null}
        {!loading && loadError ? <ErrorState compact title="تعذر تحميل دليل الأساتذة" description="حدثت مشكلة أثناء جلب النتائج. أعد المحاولة." action={<Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>إعادة المحاولة</Button>} /> : null}
        {!loading && !loadError && rows.length === 0 ? <EmptyState compact kind={filtered ? 'no-results' : 'no-data'} title={filtered ? 'لا توجد نتائج مطابقة' : 'لا توجد سجلات أساتذة ظاهرة'} description={filtered ? 'غيّر البحث أو المرشحات ثم حاول مجددًا.' : 'ستظهر هنا السجلات النشطة ضمن المقاطعات المصرح بها.'} action={filtered ? <Button variant="secondary" onClick={resetFilters}>مسح المرشحات</Button> : undefined} /> : null}
        {!loading && !loadError && rows.length > 0 ? structured ? <RecordList label="دليل الأساتذة" density="compact">{rows.map((row) => <RecordRow key={row.id} identity={<TeacherIdentity row={row} includeRecordState />} context={<TeacherWorkplace row={row} />} metadata={districts.length > 1 ? districts.find((district) => district.id === row.districtId)?.name ?? 'غير متاحة' : undefined} actions={<TeacherActions row={row} />} />)}</RecordList> : <DataTable caption="دليل الأساتذة" captionVisibility="accessible-only" columns={columns} rows={rows} rowKey={(row) => row.id} /> : null}
        {!loading && !loadError ? <Pagination label="التنقل بين نتائج الأساتذة" currentPage={pageIndex + 1}
          rangeStart={rows.length ? pageIndex * LIMIT + 1 : 0} rangeEnd={pageIndex * LIMIT + rows.length} total={total}
          hasPrevious={pageIndex > 0} hasNext={Boolean(nextCursor)} onPrevious={handlePrevious} onNext={handleNext} nextLabel="النتائج التالية" /> : null}
    </div>
    </WorkspaceStack>
  </section>;
}
