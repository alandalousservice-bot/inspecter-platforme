import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, CardContent, ErrorState, LoadingState } from '../ui';
import { portalFetch, requestLabels } from './client';
import './portal.css';
type Alerts = { requests: Array<{ kind: string; count: number }>; corrections: number; correctionItems: Array<{ id: string; academicYear: string; teacher: { id: string; name: string; surname: string } }> };
export function OperationalAlerts({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<Alerts | null>(null); const [error, setError] = useState(false); const [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; setError(false); setData(null);
    void portalFetch<{ data: Alerts }>('/me/work-alerts').then((r) => { if (active) setData(r.data); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [refreshKey, retry]);
  return <Card><CardContent><h2>تحديثات الحسابات والتوزيع</h2>{error ? <ErrorState compact title="تعذر تحميل تحديثات الأساتذة" action={<Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>إعادة تحميل التحديثات</Button>} /> : !data ? <LoadingState compact label="جارٍ تحميل التحديثات…" /> : <>
    <div className="portal-actions">{data.requests.map((r) => <Link key={r.kind} to={`/app/teacher-requests?kind=${r.kind}`}>{requestLabels[r.kind]}: {r.count}</Link>)}</div>
    <p>تصحيحات تنتظر الاعتماد: <bdi>{data.corrections}</bdi></p>
    {data.correctionItems.length ? <ul>{data.correctionItems.map((c) => <li key={c.id}><Link to={`/app/teachers/${c.teacher.id}/schedules?academicYear=${c.academicYear}`}><bdi>{c.teacher.name} {c.teacher.surname}</bdi> — <bdi>{c.academicYear}</bdi></Link></li>)}</ul> : null}
    {!data.requests.length && !data.corrections ? <p>لا توجد تحديثات حسابات تحتاج إجراءً الآن.</p> : null}
    <Link to="/app/teacher-requests">مراجعة تحديثات الأساتذة</Link>
  </>}</CardContent></Card>;
}
