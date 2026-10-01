import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiRequestError, getCurrentDistricts, listInstitutions, listTeachers, type DistrictOption, type Institution, type TeacherDirectoryFilters, type TeacherDirectoryItem } from '../auth/client';
import { Button, Card, CardContent, CardHeader, DataTable, ErrorState, Input, LoadingState, type DataTableColumn } from '../ui';
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

export function TeacherDirectoryPage() {
  const [params, setParams] = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(params.get('q') ?? '');
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

  useEffect(() => { setSearchDraft(params.get('q') ?? ''); }, [params]);
  useEffect(() => { setYearDraft(params.get('academicYear') ?? ''); }, [params]);

  useEffect(() => {
    const normalized = searchDraft.trim().replace(/\s+/gu, ' ');
    if (normalized === (params.get('q') ?? '')) return;
    const timer = window.setTimeout(() => applyChanges({ q: normalized || undefined }), 350);
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
    { id: 'teacher', header: 'الأستاذ', render: (row) => <Link to={`/app/teachers/${encodeURIComponent(row.id)}`}>{row.name} {row.surname}</Link> },
    ...(districts.length > 1 ? [{ id: 'district', header: 'المقاطعة', render: (row: TeacherDirectoryItem) => districts.find((district) => district.id === row.districtId)?.name ?? 'غير متاحة' }] : []),
    { id: 'professional', header: 'الصفة المهنية', render: (row) => row.professionalStatus ? PROFESSIONAL_LABELS[row.professionalStatus] : 'غير محددة' },
    { id: 'institution', header: 'المؤسسة الحالية المعتمدة', render: (row) => row.currentInstitution ? <span>{row.currentInstitution.name}{row.currentInstitution.municipality ? <small className="teacher-directory__municipality">{row.currentInstitution.municipality}</small> : null}</span> : 'لم تُعتمد مؤسسة حالية' },
    { id: 'status', header: 'حالة السجل', render: (row) => <span className="teacher-directory__status">{displayStatus(row.recordStatus)}</span> },
    { id: 'actions', header: 'الإجراءات', render: (row) => <span className="teacher-directory__actions"><Link className="teacher-directory__schedule-link" to={`/app/teachers/${encodeURIComponent(row.id)}/information-card`}>بطاقة معلومات الأستاذ</Link><Link className="teacher-directory__schedule-link" to={`/app/teachers/${encodeURIComponent(row.id)}/schedules`}>التوزيع الأسبوعي</Link></span> },
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

  return <section className="teacher-directory" dir="rtl">
    <header className="teacher-directory__heading">
      <div><p className="teacher-directory__eyebrow">إدارة ملفات الأستاذ</p><h1>دليل الأساتذة</h1><p>ابحث وتصفح سجلات الأساتذة ضمن نطاق المقاطعات المتاحة لك.</p></div>
    </header>

    <Card className="teacher-directory__filters-card">
      <CardHeader title="البحث والمرشحات" description="تُطبّق المرشحات على النتائج في الخادم." />
      <CardContent>
        <div className="teacher-directory__filters">
          <Input id="teacher-directory-search" label="البحث عن أستاذ" placeholder="الاسم أو اللقب أو بيانات البحث المتاحة" value={searchDraft} onChange={(event) => setSearchDraft(event.currentTarget.value)} autoComplete="off" />
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
        <fieldset className="teacher-directory__schedule-filters"><legend>مرشحات التوزيع الأسبوعي</legend>
          <div className="teacher-directory__schedule-grid">
            <Input id="teacher-academic-year" label="السنة الدراسية" placeholder="2026-2027" value={yearDraft} onChange={handleYearChange} hint="أدخل السنة صراحةً بصيغة YYYY-YYYY؛ لا تُختار تلقائيًا." error={yearDraft && !yearIsValid ? 'تحقق من صيغة السنة وأن تكون السنتان متتاليتين.' : undefined} />
            <div className="ui-field"><label className="ui-field__label" htmlFor="teacher-day-filter">يوم العمل</label><select id="teacher-day-filter" className="ui-input" disabled={!yearIsValid} value={params.get('dayOfWeek') ?? ''} onChange={handleDayChange}><option value="">كل الأيام</option>{DAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select>{!yearIsValid ? <span className="teacher-directory__hint">حدد سنة دراسية صحيحة أولًا.</span> : null}</div>
            <Input id="teacher-time-filter" label="وقت الحصة" type="time" value={minuteToTime(params.get('minuteOfDay'))} disabled={!timeIsAvailable} onChange={handleTimeChange} hint={!params.get('dayOfWeek') ? 'حدد السنة واليوم أولًا.' : 'يُبحث ضمن الحصة التي تشمل هذا الوقت.'} />
            <label className="teacher-directory__check"><input type="checkbox" checked={params.get('worksToday') === 'true'} disabled={!yearIsValid} onChange={(event) => applyChanges({ worksToday: event.currentTarget.checked ? 'true' : undefined })} /> يعمل اليوم</label>
            <label className="teacher-directory__check"><input type="checkbox" checked={params.get('worksNow') === 'true'} disabled={!yearIsValid} onChange={(event) => applyChanges({ worksNow: event.currentTarget.checked ? 'true' : undefined })} /> يعمل الآن</label>
          </div>
        </fieldset>
        {filtered ? <div className="teacher-directory__filter-actions"><Button variant="secondary" onClick={resetFilters}>مسح المرشحات</Button><span>تتغير النتائج وفق المرشحات المحددة.</span></div> : null}
      </CardContent>
    </Card>

    <Card>
      <CardHeader title="النتائج" description="تُعرض بيانات القائمة المصرح بها فقط؛ التفاصيل الشخصية في ملف الأستاذ." />
      <CardContent>
        <p className="teacher-directory__total" aria-live="polite">إجمالي النتائج: {loading ? '…' : total}</p>
        {resetNotice ? <p className="teacher-directory__notice" role="status">{resetNotice}</p> : null}
        {loading ? <LoadingState label="جارٍ تحميل دليل الأساتذة…" /> : null}
        {!loading && loadError ? <ErrorState title="تعذر تحميل دليل الأساتذة" description="حدثت مشكلة أثناء جلب النتائج. أعد المحاولة." action={<Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>إعادة المحاولة</Button>} /> : null}
        {!loading && !loadError && rows.length === 0 ? <div className="teacher-directory__empty"><h2>{filtered ? 'لا توجد نتائج مطابقة' : 'لا توجد سجلات أساتذة ظاهرة'}</h2><p>{filtered ? 'غيّر البحث أو المرشحات ثم حاول مجددًا.' : 'ستظهر هنا السجلات النشطة ضمن المقاطعات المصرح بها.'}</p>{filtered ? <Button variant="secondary" onClick={resetFilters}>مسح المرشحات</Button> : null}</div> : null}
        {!loading && !loadError && rows.length > 0 ? <DataTable caption="دليل الأساتذة" columns={columns} rows={rows} rowKey={(row) => row.id} /> : null}
        {!loading && !loadError ? <nav className="teacher-directory__pagination" aria-label="التنقل بين نتائج الأساتذة">
          <Button variant="secondary" disabled={pageIndex === 0} onClick={handlePrevious}>السابق</Button>
          <span aria-live="polite">النتائج {rows.length ? pageIndex * LIMIT + 1 : 0}–{pageIndex * LIMIT + rows.length} من {total}</span>
          <Button variant="secondary" disabled={!nextCursor} onClick={handleNext}>النتائج التالية</Button>
        </nav> : null}
      </CardContent>
    </Card>
  </section>;
}
