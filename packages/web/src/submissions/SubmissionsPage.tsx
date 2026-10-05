import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, EmptyState, ErrorState, FilterBar, Input, LoadingState, PageHeader, Pagination, StatusBadge, WorkspaceStack, type StatusTone } from '../ui';
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
      <WorkspaceStack density="operational">
      <PageHeader variant="compact" title="طلبات الأساتذة" description="تصريحات واردة للمراجعة؛ التشابه المحتمل لا يحدد قرار المفتش." />
          <FilterBar variant="workspace" summary={<span aria-live="polite">إجمالي النتائج: {loading ? '…' : failed ? 'غير متاح' : total}</span>}>
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

          {loading ? <LoadingState compact label="جارٍ تحميل الطلبات…" /> : null}
          {!loading && failed ? <ErrorState compact title="تعذر تحميل الطلبات" description="حدثت مشكلة أثناء جلب القائمة. أعد المحاولة." action={<Button variant="secondary" onClick={() => setRefreshKey((key) => key + 1)}>إعادة المحاولة</Button>} /> : null}
          {!loading && !failed && rows.length === 0 ? (
            <EmptyState compact kind={activeQuery ? 'no-results' : 'no-data'} title={activeQuery ? 'لا توجد نتائج مطابقة' : 'لا توجد طلبات في هذه الحالة'} description={activeQuery ? 'جرّب عبارة بحث أخرى.' : 'ستظهر هنا الطلبات الواردة ضمن نطاقك.'} />
          ) : null}
          {!loading && !failed && rows.length > 0 ? (
            <table className="submission-review-table" role="table">
              <caption className="ui-table__caption--accessible-only">طلبات الأساتذة</caption>
              <thead role="rowgroup"><tr role="row">
                {['هوية المرسل المعلنة', 'جهة العمل المصرح بها', 'الإرسال وحالة المراجعة', 'التشابه المحتمل', 'المراجعة'].map((label) => <th scope="col" role="columnheader" key={label}>{label}</th>)}
              </tr></thead>
              <tbody role="rowgroup">{rows.map((row) => <tr role="row" key={row.id}>
                <td role="cell" data-label="هوية المرسل المعلنة"><strong><Link to={`/app/submissions/${encodeURIComponent(row.id)}`}><bdi>{row.firstName} {row.lastName}</bdi></Link></strong><span className="submission-record-meta">تاريخ الميلاد: <bdi>{formatDate(row.dateOfBirth)}</bdi></span></td>
                <td role="cell" data-label="جهة العمل المصرح بها"><bdi>{row.primaryInstitutionName}</bdi><span className="submission-record-meta">تصريح غير معتمد</span></td>
                <td role="cell" data-label="الإرسال وحالة المراجعة"><StatusBadge tone={statusTones[row.status]}>{statusLabels.get(row.status) ?? 'غير محددة'}</StatusBadge><time className="submission-record-meta" dateTime={row.submittedAt}><bdi>{formatDateTime(row.submittedAt)}</bdi></time></td>
                <td role="cell" data-label="التشابه المحتمل">{row.hasPotentialDuplicates ? <span className="submission-advisory">قد توجد طلبات مشابهة</span> : <span className="submission-record-meta">لا توجد إشارة تشابه</span>}</td>
                <td role="cell" data-label="المراجعة"><Link className="ui-button ui-button--secondary" aria-label={`مراجعة طلب ${row.firstName} ${row.lastName}`} to={`/app/submissions/${encodeURIComponent(row.id)}`}>مراجعة الطلب</Link></td>
              </tr>)}</tbody>
            </table>
          ) : null}

          {!loading && !failed ? (
            <Pagination label="صفحات الطلبات" currentPage={Math.min(pageIndex + 1, pageCount)} rangeStart={total ? pageIndex * PAGE_SIZE + 1 : 0}
              rangeEnd={pageIndex * PAGE_SIZE + rows.length} total={total} hasPrevious={pageIndex > 0} hasNext={Boolean(nextCursor)}
              onPrevious={previousPage} onNext={nextPage} />
          ) : null}
      </WorkspaceStack>
    </div>
  );
}
