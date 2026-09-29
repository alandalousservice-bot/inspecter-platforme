import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Button, Card, CardContent, CardHeader, DataTable, Dialog, EmptyState, ErrorState, Input, LoadingState, SuccessState, type DataTableColumn } from '../ui';
import { createInstitution, getCurrentDistricts, listInstitutions, type DistrictOption, type Institution } from '../auth/client';
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
  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

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
    { id: 'name', header: 'اسم المؤسسة', render: (row) => row.name },
    { id: 'externalCode', header: 'الرمز الخارجي', render: (row) => row.externalCode || '—' },
  ], []);

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
      setCreateError(error instanceof Error ? error.message : 'تعذر إنشاء المؤسسة. تحقق من البيانات وحاول مجددًا.');
    } finally {
      setCreating(false);
    }
  }

  const canCreate = !districtsLoading && !districtsError && districts.length > 0;

  return (
    <div className="institutions-page" dir="rtl">
      <header className="institutions-heading">
        <div>
          <p className="institutions-eyebrow">دليل المؤسسات</p>
          <h1>المؤسسات</h1>
          <p>استعرض المؤسسات ضمن المقاطعات المتاحة لك، أو أضف مؤسسة جديدة.</p>
        </div>
        <Button disabled={!canCreate} onClick={openCreateDialog}>إضافة مؤسسة</Button>
      </header>

      {successMessage ? <SuccessState title={successMessage} /> : null}

      {districtsError ? (
        <ErrorState title="تعذر تحميل المقاطعات المتاحة" description="لم نتمكن من تجهيز اختيار المقاطعة. أعد المحاولة." action={<Button variant="secondary" onClick={() => void loadDistricts()}>إعادة المحاولة</Button>} />
      ) : null}
      {!districtsLoading && !districtsError && districts.length === 0 ? (
        <EmptyState title="لا توجد مقاطعة حالية متاحة" description="لا يمكن إنشاء مؤسسة قبل توفر عضوية سارية في مقاطعة." />
      ) : null}

      <Card className="institutions-card">
        <CardHeader title="قائمة المؤسسات" description="ابحث في المؤسسات المتاحة لك، وتصفح النتائج من الخادم." />
        <CardContent>
          <form className="institutions-search" onSubmit={submitSearch} role="search">
            <Input id="institution-search" label="البحث عن مؤسسة" value={searchText} onChange={(event) => setSearchText(event.currentTarget.value)} placeholder="اكتب اسم المؤسسة" />
            <Button type="submit">بحث</Button>
          </form>

          <p className="institutions-result-count" aria-live="polite">إجمالي النتائج: {listLoading ? '…' : total}</p>

          {listLoading ? <LoadingState label="جارٍ تحميل المؤسسات…" /> : null}
          {!listLoading && listError ? <ErrorState title="تعذر تحميل المؤسسات" description="حدثت مشكلة أثناء جلب القائمة. أعد المحاولة." action={<Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>إعادة المحاولة</Button>} /> : null}
          {!listLoading && !listError && rows.length === 0 ? (
            <EmptyState title={activeQuery ? 'لا توجد نتائج مطابقة' : 'لا توجد مؤسسات بعد'} description={activeQuery ? 'جرّب عبارة بحث أخرى.' : 'يمكنك إضافة أول مؤسسة من المقاطعات المتاحة لك.'} />
          ) : null}
          {!listLoading && !listError && rows.length > 0 ? <DataTable caption="قائمة المؤسسات" columns={columns} rows={rows} rowKey={(row) => row.id} /> : null}

          {!listLoading && !listError ? (
            <nav className="institutions-pagination" aria-label="صفحات المؤسسات">
              <Button variant="secondary" disabled={pageIndex === 0} onClick={goToPreviousPage}>السابق</Button>
              <span aria-live="polite">الصفحة {pageIndex + 1} من {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
              <Button variant="secondary" disabled={!nextCursor} onClick={goToNextPage}>التالي</Button>
            </nav>
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
            <div className="ui-field">
              <label className="ui-field__label" htmlFor="institution-district">المقاطعة <span aria-hidden="true">*</span></label>
              <select id="institution-district" className="ui-input" required value={selectedDistrictId} aria-invalid={formErrors.districtId ? true : undefined} aria-describedby={formErrors.districtId ? 'institution-district-error' : undefined} onChange={(event) => setSelectedDistrictId(event.currentTarget.value)}>
                <option value="">اختر المقاطعة</option>
                {districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}
              </select>
              {formErrors.districtId ? <p className="ui-field__error" id="institution-district-error" role="alert">{formErrors.districtId}</p> : null}
            </div>
          ) : null}
          <Input id="institution-name" label="اسم المؤسسة" required maxLength={200} value={name} error={formErrors.name} onChange={(event) => setName(event.currentTarget.value)} />
          <Input id="institution-code" label="الرمز الخارجي" hint="اختياري" maxLength={100} value={externalCode} error={formErrors.externalCode} onChange={(event) => setExternalCode(event.currentTarget.value)} />
          {createError ? <ErrorState description={createError} /> : null}
          <div className="institution-form__actions">
            <Button type="submit" disabled={creating || districtsLoading || districtsError || districts.length === 0}>{creating ? 'جارٍ الإنشاء…' : 'إنشاء المؤسسة'}</Button>
            <Button type="button" variant="secondary" disabled={creating} onClick={() => setDialogOpen(false)}>إلغاء</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
