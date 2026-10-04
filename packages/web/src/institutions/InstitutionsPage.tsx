import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Button, Card, CardContent, CardHeader, DataTable, Dialog, EmptyState, ErrorState, FilterBar, Input, LoadingState, PageHeader, Pagination, Select, SuccessState, type DataTableColumn } from '../ui';
import { ApiRequestError, createInstitution, getCurrentDistricts, listInstitutions, updateInstitution, type DistrictOption, type Institution } from '../auth/client';
import { ShellIcon } from '../ui/ShellIcon';
import './institutions.css';

const PAGE_SIZE = 25;

export function InstitutionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeQuery = searchParams.get('q') ?? '';
  const [searchText, setSearchText] = useState(activeQuery);
  const [cursorHistory, setCursorHistory] = useState<string[]>(['']);
  const [pageIndex, setPageIndex] = useState(0);
  const [rows, setRows] = useState<Institution[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [districtsLoading, setDistrictsLoading] = useState(true);
  const [districtsError, setDistrictsError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [email, setEmail] = useState('');
  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [editingInstitution, setEditingInstitution] = useState<Institution | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);

  const currentCursor = cursorHistory[pageIndex] ?? '';

  const loadDistricts = useCallback(async () => {
    setDistrictsLoading(true);
    setDistrictsError(false);
    try {
      setDistricts(await getCurrentDistricts());
    } catch {
      setDistricts([]);
      setDistrictsError(true);
    } finally {
      setDistrictsLoading(false);
    }
  }, []);

  useEffect(() => { void loadDistricts(); }, [loadDistricts]);

  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError(false);
    void listInstitutions({ q: activeQuery, cursor: currentCursor || undefined, limit: PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        setRows(result.data);
        setTotal(result.page.total);
        setNextCursor(result.page.nextCursor);
      })
      .catch(() => { if (active) setListError(true); })
      .finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [activeQuery, currentCursor, refreshKey]);

  useEffect(() => { setSearchText(activeQuery); }, [activeQuery]);

  const columns = useMemo<DataTableColumn<Institution>[]>(() => [
    { id: 'identity', header: 'المؤسسة', render: (row) => <span className="institutions-identity">
      <span className="institutions-identity__icon"><ShellIcon name="institutions" /></span>
      <span className="institutions-identity__copy"><strong>{row.name}</strong>{row.externalCode ? <small>الرمز الخارجي: <bdi dir="auto">{row.externalCode}</bdi></small> : null}</span>
    </span> },
    { id: 'location', header: 'الموقع الإداري', render: (row) => {
      const districtName = districts.length > 1 ? districts.find((district) => district.id === row.districtId)?.name : undefined;
      return <span className="institutions-location">
        <strong>{row.municipality || 'البلدية غير متاحة'}</strong>
        {districtName ? <small>المقاطعة: {districtName}</small> : null}
        {row.address ? <small>{row.address}</small> : null}
        {row.location ? <span className="institutions-location__canonical"><ShellIcon name="location" /><span><small>الموقع المعتمد للمؤسسة</small><bdi dir="ltr">{row.location.latitude}, {row.location.longitude}</bdi></span></span> : <small>لا يوجد موقع معتمد مسجل</small>}
      </span>;
    } },
    { id: 'contact', header: 'بيانات الاتصال', render: (row) => <span className="institutions-contact">
      {row.email ? <span><ShellIcon name="email" /><bdi dir="ltr">{row.email}</bdi></span> : <small>لا يوجد بريد مسجل</small>}
      {row.directorPhone ? <span><ShellIcon name="phone" /><bdi dir="ltr">{row.directorPhone}</bdi></span> : null}
    </span> },
    { id: 'actions', header: 'الإجراء المتاح', render: (row) => <Button variant="secondary" onClick={() => { setEditingInstitution(row); setEmailDraft(row.email ?? ''); setEmailError(''); }}><ShellIcon name="email" />تعديل البريد</Button> },
  ], [districts]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = searchText.trim();
    setCursorHistory(['']);
    setPageIndex(0);
    setSuccessMessage('');
    setSearchParams(q ? { q } : {});
  }

  function openCreateDialog() {
    setName('');
    setExternalCode('');
    setEmail('');
    setSelectedDistrictId(districts.length === 1 ? districts[0].id : '');
    setFormErrors({});
    setCreateError('');
    setDialogOpen(true);
  }

  function goToNextPage() {
    if (!nextCursor) return;
    setCursorHistory((history) => [...history.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((index) => index + 1);
  }

  function goToPreviousPage() {
    if (pageIndex === 0) return;
    setPageIndex((index) => index - 1);
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'أدخل اسم المؤسسة.';
    else if (name.trim().length > 200) errors.name = 'يجب ألا يتجاوز الاسم 200 حرف.';
    if (externalCode.trim().length > 100) errors.externalCode = 'يجب ألا يتجاوز الرمز 100 حرف.';
    const normalizedEmail = email.trim();
    if (normalizedEmail && (Array.from(normalizedEmail).length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalizedEmail))) errors.email = 'أدخل بريدًا إلكترونيًا صالحًا لا يتجاوز 254 حرفًا.';
    if (districts.length === 0) errors.districtId = 'لا توجد مقاطعة حالية متاحة لإنشاء مؤسسة.';
    else if (!selectedDistrictId || !districts.some((district) => district.id === selectedDistrictId)) {
      errors.districtId = 'اختر المقاطعة.';
    }
    setFormErrors(errors);
    setCreateError('');
    if (Object.keys(errors).length) return;

    setCreating(true);
    try {
      await createInstitution({
        districtId: selectedDistrictId,
        name: name.trim(),
        ...(externalCode.trim() ? { externalCode: externalCode.trim() } : {}),
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
      });
      setDialogOpen(false);
      setSuccessMessage('تم إنشاء المؤسسة بنجاح.');
      setSearchText('');
      setSearchParams({});
      setCursorHistory(['']);
      setPageIndex(0);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      const serverFields = (error as Error & { fields?: Record<string, string[]> })?.fields;
      if (serverFields) {
        const fieldErrors: Record<string, string> = {};
        for (const field of ['name', 'externalCode', 'districtId']) {
          const message = serverFields[field]?.[0];
          if (message) fieldErrors[field] = message;
        }
        setFormErrors(fieldErrors);
      }
      setCreateError(error instanceof ApiRequestError
        ? error.message
        : 'تعذر إنشاء المؤسسة. تحقق من البيانات والصلاحيات ثم حاول مجددًا.');
    } finally {
      setCreating(false);
    }
  }

  async function saveInstitutionEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingInstitution || emailSaving) return;
    const value = emailDraft.trim();
    if (value && (Array.from(value).length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value))) {
      setEmailError('أدخل بريدًا إلكترونيًا صالحًا لا يتجاوز 254 حرفًا.');
      return;
    }
    setEmailSaving(true);
    setEmailError('');
    try {
      await updateInstitution(editingInstitution.id, { email: value || null });
      setEditingInstitution(null);
      setSuccessMessage('تم تحديث بريد المؤسسة بنجاح.');
      setRefreshKey((current) => current + 1);
    } catch {
      setEmailError('تعذر تحديث البريد. تحقق من البيانات والصلاحيات ثم حاول مجددًا.');
    } finally {
      setEmailSaving(false);
    }
  }

  const canCreate = !districtsLoading && !districtsError && districts.length > 0;

  return (
    <div className="institutions-page" dir="rtl">
      <PageHeader eyebrow="دليل المؤسسات" title="المؤسسات" description="استعرض المؤسسات ضمن المقاطعات المتاحة لك، أو أضف مؤسسة جديدة."
        primaryAction={<Button disabled={!canCreate} onClick={openCreateDialog}>إضافة مؤسسة</Button>} />

      {successMessage ? <SuccessState title={successMessage} /> : null}

      {districtsError ? (
        <ErrorState title="تعذر تحميل المقاطعات المتاحة" description="لم نتمكن من تجهيز اختيار المقاطعة. أعد المحاولة." action={<Button variant="secondary" onClick={() => void loadDistricts()}>إعادة المحاولة</Button>} />
      ) : null}
      {!districtsLoading && !districtsError && districts.length === 0 ? (
        <EmptyState title="لا توجد مقاطعة حالية متاحة" description="لا يمكن إنشاء مؤسسة قبل توفر عضوية سارية في مقاطعة." />
      ) : null}

      <Card className="institutions-card">
        <CardHeader title="قائمة المؤسسات" description="معلومات المؤسسات المتاحة ضمن نطاق المقاطعات المسندة إليك." />
        <CardContent>
          <FilterBar className="institutions-filter" title="البحث في المؤسسات" description="تُطبّق عبارة البحث على النتائج في الخادم.">
          <form className="institutions-search" onSubmit={submitSearch} role="search">
            <Input id="institution-search" label="البحث عن مؤسسة" value={searchText} onChange={(event) => setSearchText(event.currentTarget.value)} placeholder="اكتب اسم المؤسسة" />
            <Button type="submit"><ShellIcon name="search" />بحث</Button>
          </form>
          </FilterBar>

          <div className="institutions-results-heading">
            <span className="institutions-results-heading__icon" aria-hidden="true"><ShellIcon name="institutions" /></span>
            <div><h2>النتائج</h2><p aria-live="polite">إجمالي المؤسسات: {listError ? 'غير متاح' : listLoading ? '…' : total}</p></div>
          </div>

          {listLoading ? <LoadingState label="جارٍ تحميل المؤسسات…" /> : null}
          {!listLoading && listError ? <ErrorState title="تعذر تحميل المؤسسات" description="حدثت مشكلة أثناء جلب القائمة. أعد المحاولة." action={<Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>إعادة المحاولة</Button>} /> : null}
          {!listLoading && !listError && rows.length === 0 ? (
            <EmptyState title={activeQuery ? 'لا توجد نتائج مطابقة' : 'لا توجد مؤسسات بعد'} description={activeQuery ? 'جرّب عبارة بحث أخرى.' : 'يمكنك إضافة أول مؤسسة من المقاطعات المتاحة لك.'} />
          ) : null}
          {!listLoading && !listError && rows.length > 0 ? <DataTable caption="قائمة المؤسسات" columns={columns} rows={rows} rowKey={(row) => row.id} /> : null}

          {!listLoading && !listError ? (
            <Pagination label="صفحات المؤسسات" currentPage={pageIndex + 1} rangeStart={total ? pageIndex * PAGE_SIZE + 1 : 0}
              rangeEnd={pageIndex * PAGE_SIZE + rows.length} total={total} hasPrevious={pageIndex > 0} hasNext={Boolean(nextCursor)}
              onPrevious={goToPreviousPage} onNext={goToNextPage} />
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} title="إضافة مؤسسة" onClose={() => setDialogOpen(false)} actions={null}>
        <form className="institution-form" onSubmit={(event) => void submitCreate(event)} noValidate>
          {districtsLoading ? <LoadingState label="جارٍ تحميل المقاطعات…" /> : null}
          {districtsError ? <ErrorState title="تعذر تحميل المقاطعات" description="أغلق النموذج وأعد المحاولة." /> : null}
          {!districtsLoading && !districtsError && districts.length === 0 ? <EmptyState title="لا توجد مقاطعة متاحة" description="تعذر إنشاء مؤسسة دون مقاطعة حالية." /> : null}
          {!districtsLoading && !districtsError && districts.length === 1 ? (
            <div className="institution-district-summary"><span>المقاطعة</span><strong>{districts[0].name}</strong></div>
          ) : null}
          {!districtsLoading && !districtsError && districts.length > 1 ? (
            <Select id="institution-district" label="المقاطعة" required error={formErrors.districtId} value={selectedDistrictId} onChange={(event) => setSelectedDistrictId(event.currentTarget.value)}>
              <option value="">اختر المقاطعة</option>
              {districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}
            </Select>
          ) : null}
          <Input id="institution-name" label="اسم المؤسسة" required maxLength={200} value={name} error={formErrors.name} onChange={(event) => setName(event.currentTarget.value)} />
          <Input id="institution-code" label="الرمز الخارجي" hint="اختياري" maxLength={100} value={externalCode} error={formErrors.externalCode} onChange={(event) => setExternalCode(event.currentTarget.value)} />
          <Input id="institution-email" label="البريد الإلكتروني" type="email" hint="اختياري" maxLength={254} value={email} error={formErrors.email} onChange={(event) => setEmail(event.currentTarget.value)} />
          {createError ? <ErrorState description={createError} /> : null}
          <div className="institution-form__actions">
            <Button type="submit" disabled={creating || districtsLoading || districtsError || districts.length === 0}>{creating ? 'جارٍ الإنشاء…' : 'إنشاء المؤسسة'}</Button>
            <Button type="button" variant="secondary" disabled={creating} onClick={() => setDialogOpen(false)}>إلغاء</Button>
          </div>
        </form>
      </Dialog>
      <Dialog open={editingInstitution !== null} title="تعديل بريد المؤسسة" onClose={() => { if (!emailSaving) setEditingInstitution(null); }} actions={null}>
        <form className="institution-form" onSubmit={(event) => void saveInstitutionEmail(event)} noValidate>
          <p>{editingInstitution?.name}</p>
          <Input id="institution-edit-email" label="البريد الإلكتروني" type="email" maxLength={254} hint="اتركه فارغًا لمسح البريد المسجل." value={emailDraft} error={emailError} onChange={(event) => setEmailDraft(event.currentTarget.value)} />
          {emailError && !emailError.includes('بريدًا') ? <p role="alert">{emailError}</p> : null}
          <div className="institution-form__actions">
            <Button type="submit" disabled={emailSaving}>{emailSaving ? 'جارٍ الحفظ…' : 'حفظ البريد'}</Button>
            <Button type="button" variant="secondary" disabled={emailSaving} onClick={() => setEditingInstitution(null)}>إلغاء</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
