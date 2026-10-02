import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, Card, CardContent, CardHeader, DataTable, EmptyState, ErrorState, FilterBar, Input, LoadingState, PageHeader, Pagination, StatusBadge, type DataTableColumn, type StatusTone } from '../ui';
import { listSubmissions, type SubmissionListItem, type SubmissionStatus } from '../auth/client';
import './submissions.css';

const PAGE_SIZE = 25;
const statusOptions: { value: SubmissionStatus; label: string }[] = [
  { value: 'PENDING', label: 'قيد الانتظار' },
  { value: 'INTERNAL_REVIEW', label: 'قيد المراجعة الداخلية' },
  { value: 'ACCEPTED', label: 'مقبول' },
  { value: 'REJECTED', label: 'مرفوض' },
];
const statusTones: Record<SubmissionStatus, StatusTone> = {
  PENDING: 'warning', INTERNAL_REVIEW: 'info', ACCEPTED: 'success', REJECTED: 'danger',
};

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('ar-DZ', { dateStyle: 'medium' }).format(parsed);
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('ar-DZ', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

export function SubmissionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeQuery = searchParams.get('q') ?? '';
  const activeStatus = (searchParams.get('status') as SubmissionStatus | null) ?? 'PENDING';
  const [searchText, setSearchText] = useState(activeQuery);
  const [cursorHistory, setCursorHistory] = useState<string[]>(['']);
  const [pageIndex, setPageIndex] = useState(0);
  const [rows, setRows] = useState<SubmissionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const currentCursor = cursorHistory[pageIndex] ?? '';
  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const result = await listSubmissions({ q: activeQuery, status: activeStatus, cursor: currentCursor || undefined, limit: PAGE_SIZE });
      setRows(result.data);
      setTotal(result.page.total);
      setNextCursor(result.page.nextCursor);
    } catch {
      setRows([]);
      setTotal(0);
      setNextCursor(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [activeQuery, activeStatus, currentCursor, refreshKey]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSearchText(activeQuery); }, [activeQuery]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const statusLabels = useMemo(() => new Map(statusOptions.map(({ value, label }) => [value, label])), []);
  const columns = useMemo<DataTableColumn<SubmissionListItem>[]>(() => [
    { id: 'teacher', header: 'الأستاذ', render: (row) => <Link to={`/app/submissions/${encodeURIComponent(row.id)}`}>{row.firstName} {row.lastName}</Link> },
    { id: 'birthDate', header: 'تاريخ الميلاد', render: (row) => formatDate(row.dateOfBirth) },
    { id: 'institution', header: 'جهة العمل المصرح بها', render: (row) => row.primaryInstitutionName },
    { id: 'submittedAt', header: 'تاريخ الإرسال', render: (row) => formatDateTime(row.submittedAt) },
    { id: 'status', header: 'الحالة', render: (row) => <StatusBadge tone={statusTones[row.status]}>{statusLabels.get(row.status) ?? 'غير محددة'}</StatusBadge> },
    { id: 'duplicates', header: 'التنبيه', render: (row) => row.hasPotentialDuplicates ? 'قد توجد طلبات مشابهة' : '—' },
  ], [statusLabels]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = searchText.trim();
    const status = (event.currentTarget.elements.namedItem('submission-status') as HTMLSelectElement).value;
    setCursorHistory(['']);
    setPageIndex(0);
    setSearchParams({ ...(q ? { q } : {}), ...(status !== 'PENDING' ? { status } : {}) });
  }

  function nextPage() {
    if (!nextCursor) return;
    setCursorHistory((history) => [...history.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((index) => index + 1);
  }

  function previousPage() {
    if (pageIndex === 0) return;
    setPageIndex((index) => index - 1);
  }

  return (
    <div className="submissions-page" dir="rtl">
      <PageHeader eyebrow="استقبال الأساتذة" title="طلبات الأساتذة" description="استعرض الطلبات الواردة ضمن المقاطعات المتاحة لك." />

      <Card>
        <CardHeader title="قائمة الطلبات" description="تُحدّث النتائج والفلاتر من الخادم." />
        <CardContent>
          <FilterBar title="البحث والمرشحات" description="تُحدّث النتائج والفلاتر من الخادم.">
          <form className="submissions-filters" onSubmit={applyFilters} role="search">
            <Input id="submission-search" label="البحث في الطلبات" value={searchText} onChange={(event) => setSearchText(event.currentTarget.value)} placeholder="الاسم أو المؤسسة الأساسية" />
            <div className="ui-field">
              <label className="ui-field__label" htmlFor="submission-status">حالة الطلب</label>
              <select id="submission-status" name="submission-status" className="ui-input" defaultValue={activeStatus} key={activeStatus}>
                {statusOptions.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
              </select>
            </div>
            <Button type="submit">تطبيق</Button>
          </form>
          </FilterBar>

          <p className="submissions-result-count" aria-live="polite">إجمالي النتائج: {loading ? '…' : total}</p>
          {loading ? <LoadingState label="جارٍ تحميل الطلبات…" /> : null}
          {!loading && failed ? <ErrorState title="تعذر تحميل الطلبات" description="حدثت مشكلة أثناء جلب القائمة. أعد المحاولة." action={<Button variant="secondary" onClick={() => setRefreshKey((key) => key + 1)}>إعادة المحاولة</Button>} /> : null}
          {!loading && !failed && rows.length === 0 ? (
            <EmptyState title={activeQuery ? 'لا توجد نتائج مطابقة' : 'لا توجد طلبات في هذه الحالة'} description={activeQuery ? 'جرّب عبارة بحث أخرى.' : 'ستظهر هنا الطلبات الواردة ضمن نطاقك.'} />
          ) : null}
          {!loading && !failed && rows.length > 0 ? <DataTable caption="طلبات الأساتذة" columns={columns} rows={rows} rowKey={(row) => row.id} /> : null}

          {!loading && !failed ? (
            <Pagination label="صفحات الطلبات" currentPage={Math.min(pageIndex + 1, pageCount)} rangeStart={total ? pageIndex * PAGE_SIZE + 1 : 0}
              rangeEnd={pageIndex * PAGE_SIZE + rows.length} total={total} hasPrevious={pageIndex > 0} hasNext={Boolean(nextCursor)}
              onPrevious={previousPage} onNext={nextPage} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
