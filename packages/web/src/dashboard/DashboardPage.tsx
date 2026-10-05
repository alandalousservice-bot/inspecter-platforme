import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { getDashboardSummary, type DashboardSummary } from '../auth/client';
import { Button, Card, EmptyState, ErrorState, LoadingState, StatusBadge } from '../ui';
import { ShellIcon, type ShellIconName } from '../ui/ShellIcon';
import { formatAlgiers } from '../visits/time';
import { visitTypeLabel } from '../visits/visit-type-labels';
import './dashboard.css';

type CountCardProps = {
  title: string;
  total: number;
  to: string;
  icon: ShellIconName;
  tone: 'warning' | 'info' | 'primary';
  children?: ReactNode;
};

function CountCard({ title, total, to, icon, tone, children }: CountCardProps) {
  return (
    <Card className={`dashboard-count dashboard-count--${tone}`} aria-label={`${title}: ${total}`}>
      <div className="dashboard-count__top">
        <span className="dashboard-count__icon"><ShellIcon name={icon} /></span>
        <h3 className="dashboard-count__title">{title}</h3>
      </div>
      <p className="dashboard-count__value" aria-label={`العدد: ${total}`}><bdi dir="ltr">{total}</bdi></p>
      <Link className="dashboard-count__link" to={to} aria-label={`عرض القسم: ${title}`}>عرض القسم <span aria-hidden="true">←</span></Link>
      {children ? <ul className="dashboard-count__items">{children}</ul> : null}
    </Card>
  );
}

const quickActions = [
  { label: 'جدولة زيارة', to: '/app/visits/new', icon: 'visits' },
  { label: 'دليل الأساتذة', to: '/app/teachers', icon: 'teachers' },
  { label: 'مراجعة الطلبات', to: '/app/submissions', icon: 'submissions' },
  { label: 'المتابعات', to: '/app/follow-ups', icon: 'follow-ups' },
] as const;

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    setSummary(null);
    try {
      const response = await getDashboardSummary();
      setSummary(response.data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const refresh = <Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
    <span className={loading ? 'dashboard-refresh-icon dashboard-refresh-icon--spinning' : 'dashboard-refresh-icon'} aria-hidden="true">↻</span>
    {loading ? 'جارٍ التحديث…' : 'تحديث اللوحة'}
  </Button>;

  const attention = summary?.attention;
  const followUpItems = attention?.ownedFollowUps.items ?? [];
  const pendingItems = attention?.pendingSubmissions.items ?? [];
  const reportItems = attention?.reports.items ?? [];
  const hasAttention = Boolean(attention && (
    attention.pendingSubmissions.total > 0 || attention.ownedFollowUps.overdueTotal > 0
    || attention.ownedFollowUps.dueTodayTotal > 0 || attention.reports.draftTotal > 0
    || attention.reports.completedVisitWithoutReportTotal > 0
  ));

  return (
    <div className="dashboard-page" dir="rtl">
      <header className="dashboard-hero">
        <div className="dashboard-hero__content">
          <span className="dashboard-hero__eyebrow"><ShellIcon name="dashboard" /> مساحة عمل المفتش</span>
          <h1>لوحة المتابعة</h1>
          <p>ملخص عملي للأعمال ضمن نطاق إشرافك الحالي، وما يحتاج انتباهك ومواعيدك القادمة.</p>
        </div>
        <div className="dashboard-hero__action">{refresh}</div>
        <span className="dashboard-hero__motif" aria-hidden="true"><ShellIcon name="shield" /></span>
      </header>

      <section className="dashboard-section" aria-labelledby="dashboard-attention-title">
        <div className="dashboard-section__heading">
          <span className="dashboard-section__icon"><ShellIcon name="follow-ups" /></span>
          <div className="dashboard-section__copy">
            <h2 id="dashboard-attention-title">يحتاج انتباهك</h2>
            {!loading && !failed && summary ? <p>ملخص الأعمال التي تستدعي المتابعة.</p> : null}
          </div>
        </div>
        {loading ? <LoadingState label="جارٍ تحميل لوحة المتابعة…" /> : null}
        {!loading && failed ? <div className="dashboard-feedback dashboard-feedback--error">
          <span className="dashboard-feedback__icon"><ShellIcon name="alert" /></span>
          <ErrorState
            title="تعذر تحميل لوحة المتابعة"
            description="لم تُحمّل بيانات اللوحة. أعد المحاولة."
            action={<Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>إعادة المحاولة</Button>}
          />
        </div> : null}
        {!loading && summary && attention ? <>
          {!hasAttention ? <div className="dashboard-neutral-empty" role="status"><span className="dashboard-empty-icon"><ShellIcon name="check-circle" /></span><p>لا توجد عناصر تحتاج انتباهك حاليًا.</p></div> : null}
          <div className="dashboard-count-grid">
            <CountCard title="المتابعات المتأخرة" total={attention.ownedFollowUps.overdueTotal} to="/app/follow-ups" icon="follow-ups" tone="warning">
              {followUpItems.filter((item) => item.alertState === 'OVERDUE').map((item) => <li key={item.id}>
                <Link to="/app/follow-ups"><bdi dir="auto">تاريخ الاستحقاق: {item.dueDate}</bdi></Link>
                <StatusBadge tone="warning">متأخرة</StatusBadge>
              </li>)}
            </CountCard>
            <CountCard title="المتابعات المستحقة اليوم" total={attention.ownedFollowUps.dueTodayTotal} to="/app/follow-ups" icon="follow-ups" tone="info">
              {followUpItems.filter((item) => item.alertState === 'DUE_TODAY').map((item) => <li key={item.id}>
                <Link to="/app/follow-ups"><bdi dir="auto">تاريخ الاستحقاق: {item.dueDate}</bdi></Link>
                <StatusBadge tone="info">مستحقة اليوم</StatusBadge>
              </li>)}
            </CountCard>
            <CountCard title="طلبات الأساتذة المعلقة" total={attention.pendingSubmissions.total} to="/app/submissions" icon="submissions" tone="primary">
              {pendingItems.map((item) => <li key={item.id}>
                <Link to={`/app/submissions/${encodeURIComponent(item.id)}`}>طلب وارد</Link>
                <time dateTime={item.submittedAt}><bdi dir="auto">{formatAlgiers(item.submittedAt)}</bdi></time>
              </li>)}
            </CountCard>
            <CountCard title="مسودات التقارير" total={attention.reports.draftTotal} to="/app/visits" icon="reports" tone="primary">
              {reportItems.filter((item) => item.kind === 'DRAFT_REPORT').map((item) => <li key={item.visitId}>
                <Link to={`/app/visits/${encodeURIComponent(item.visitId)}/report`}>فتح مسودة التقرير</Link>
                <time dateTime={item.referenceAt}><bdi dir="auto">{formatAlgiers(item.referenceAt)}</bdi></time>
              </li>)}
            </CountCard>
            <CountCard title="زيارات مكتملة بلا تقرير" total={attention.reports.completedVisitWithoutReportTotal} to="/app/visits" icon="visits" tone="primary">
              {reportItems.filter((item) => item.kind === 'NO_REPORT').map((item) => <li key={item.visitId}>
                <Link to={`/app/visits/${encodeURIComponent(item.visitId)}`}>عرض الزيارة</Link>
                <time dateTime={item.referenceAt}><bdi dir="auto">{formatAlgiers(item.referenceAt)}</bdi></time>
              </li>)}
            </CountCard>
          </div>
        </> : null}
      </section>

      <section className="dashboard-section" aria-labelledby="dashboard-visits-title">
        <div className="dashboard-section__heading">
          <span className="dashboard-section__icon"><ShellIcon name="visits" /></span>
          <div className="dashboard-section__copy">
            <h2 id="dashboard-visits-title">الزيارات القادمة</h2>
            <p>مواعيدك المخططة التالية.</p>
          </div>
        </div>
        {!loading && !failed && summary ? summary.upcomingVisits.length === 0
          ? <div className="dashboard-feedback dashboard-feedback--empty">
            <span className="dashboard-feedback__icon"><ShellIcon name="check-circle" /></span>
            <EmptyState title="لا توجد زيارات قادمة" description="يمكنك الوصول إلى جدولة زيارة من الإجراءات السريعة." />
          </div>
          : <div className="dashboard-visits">
            {summary.upcomingVisits.map((visit, index) => <Card key={visit.id} className={`dashboard-visit${index === 0 ? ' dashboard-visit--next' : ''}`}>
              <div className="dashboard-visit__topline">
                <span className="dashboard-visit__icon"><ShellIcon name="visits" /></span>
                <h3>{index === 0 ? 'الزيارة التالية' : 'زيارة مخططة'}</h3>
                {visit.visitType === null ? <StatusBadge tone="neutral">نوع الزيارة غير موثق (سجل سابق)</StatusBadge> : <StatusBadge tone="info">{visitTypeLabel(visit.visitType)}</StatusBadge>}
              </div>
              <p className="dashboard-visit__institution"><bdi dir="auto">{visit.institutionName}</bdi></p>
              <div className="dashboard-visit__schedule">
                <span className="dashboard-visit__schedule-label">الموعد</span>
                <p className="dashboard-visit__time">
                  <time dateTime={visit.scheduledStartAt}><bdi dir="auto">{formatAlgiers(visit.scheduledStartAt)}</bdi></time>
                  <span aria-hidden="true"> — </span>
                  <time dateTime={visit.scheduledEndAt}><bdi dir="auto">{formatAlgiers(visit.scheduledEndAt)}</bdi></time>
                </p>
              </div>
              <Link className="dashboard-visit__link" to={`/app/visits/${encodeURIComponent(visit.id)}`}>عرض تفاصيل الزيارة <span aria-hidden="true">←</span></Link>
            </Card>)}
          </div>
          : null}
        {loading ? <LoadingState label="جارٍ تحميل الزيارات القادمة…" /> : null}
        {!loading && failed ? <p className="dashboard-muted">ستظهر المواعيد عند نجاح تحميل بيانات اللوحة.</p> : null}
      </section>

      <section className="dashboard-section" aria-labelledby="dashboard-actions-title">
        <div className="dashboard-section__heading">
          <span className="dashboard-section__icon"><ShellIcon name="arrow-back" /></span>
          <div className="dashboard-section__copy">
            <h2 id="dashboard-actions-title">إجراءات سريعة</h2>
            <p>روابط مختصرة إلى مساحات العمل المتاحة.</p>
          </div>
        </div>
        <nav aria-label="إجراءات سريعة" className="dashboard-actions">
          {quickActions.map(({ label, to, icon }) => <Link className="dashboard-action" key={to} to={to}>
            <span className="dashboard-action__icon"><ShellIcon name={icon} /></span>
            <span className="dashboard-action__label">{label}</span>
            <span className="dashboard-action__arrow" aria-hidden="true">←</span>
          </Link>)}
        </nav>
      </section>

      {!loading && summary ? <p className="dashboard-freshness"><span className="dashboard-freshness__dot" aria-hidden="true" />آخر تحديث: <time dateTime={summary.asOf}><bdi dir="auto">{formatAlgiers(summary.asOf)}</bdi></time></p> : null}
    </div>
  );
}
