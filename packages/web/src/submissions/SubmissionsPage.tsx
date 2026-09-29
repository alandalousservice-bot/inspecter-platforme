import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, Card, CardContent, CardHeader, EmptyState, ErrorState, Input, LoadingState } from '../ui';
import { listSubmissions, type SubmissionListItem, type SubmissionStatus } from '../auth/client';
import './submissions.css';

const PAGE_SIZE = 25;
const statusOptions: { value: SubmissionStatus; label: string }[] = [
  { value: 'PENDING', label: 'قيد الانتظار' },
  { value: 'INTERNAL_REVIEW', label: 'قيد المراجعة الداخلية' },
  { value: 'ACCEPTED', label: 'مقبول' },
  { value: 'REJECTED', label: 'مرفوض' },
];

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
      <header className="submissions-heading">
        <div>
          <p className="submissions-eyebrow">استقبال الأساتذة</p>
          <h1>طلبات الأساتذة</h1>
          <p>استعرض الطلبات الواردة ضمن المقاطعات المتاحة لك.</p>
        </div>
      </header>

      <Card>
        <CardHeader title="قائمة الطلبات" description="تُحدّث النتائج والفلاتر من الخادم." />
        <CardContent>
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

          <p className="submissions-result-count" aria-live="polite">إجمالي النتائج: {loading ? '…' : total}</p>
          {loading ? <LoadingState label="جارٍ تحميل الطلبات…" /> : null}
          {!loading && failed ? <ErrorState title="تعذر تحميل الطلبات" description="حدثت مشكلة أثناء جلب القائمة. أعد المحاولة." action={<Button variant="secondary" onClick={() => setRefreshKey((key) => key + 1)}>إعادة المحاولة</Button>} /> : null}
          {!loading && !failed && rows.length === 0 ? (
            <EmptyState title={activeQuery ? 'لا توجد نتائج مطابقة' : 'لا توجد طلبات في هذه الحالة'} description={activeQuery ? 'جرّب عبارة بحث أخرى.' : 'ستظهر هنا الطلبات الواردة ضمن نطاقك.'} />
          ) : null}
          {!loading && !failed && rows.length > 0 ? (
            <ul className="submission-list" aria-label="طلبات الأساتذة">
              {rows.map((row) => (
                <li key={row.id}>
                  <Card className="submission-list-card">
                    <CardContent>
                      <div className="submission-list-card__main">
                        <h3><Link to={`/app/submissions/${encodeURIComponent(row.id)}`}>{row.firstName} {row.lastName}</Link></h3>
                        {row.hasPotentialDuplicates ? <p className="submission-similarity" aria-label="قد توجد طلبات مشابهة">قد توجد طلبات مشابهة</p> : null}
                      </div>
                      <dl className="submission-list-card__facts">
                        <div><dt>تاريخ الميلاد</dt><dd>{formatDate(row.dateOfBirth)}</dd></div>
                        <div><dt>جهة العمل المصرح بها</dt><dd>{row.primaryInstitutionName}</dd></div>
                        <div><dt>تاريخ الإرسال</dt><dd>{formatDateTime(row.submittedAt)}</dd></div>
                        <div><dt>الحالة</dt><dd>{statusLabels.get(row.status) ?? 'غير محددة'}</dd></div>
                      </dl>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          ) : null}

          {!loading && !failed ? (
            <nav className="submissions-pagination" aria-label="صفحات الطلبات">
              <Button variant="secondary" disabled={pageIndex === 0} onClick={previousPage}>السابق</Button>
              <span aria-live="polite">الصفحة {Math.min(pageIndex + 1, pageCount)} من {pageCount}</span>
              <Button variant="secondary" disabled={!nextCursor} onClick={nextPage}>التالي</Button>
            </nav>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
