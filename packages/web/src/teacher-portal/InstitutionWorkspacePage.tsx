import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { listTeachers, type TeacherDirectoryItem } from '../auth/client';
import { Button, Card, CardContent, EmptyState, ErrorState, Input, LoadingState, PageHeader } from '../ui';
import { portalFetch } from './client';
import './portal.css';
type Workspace = { id: string; districtId: string; name: string; municipality: string | null; address: string | null; district: { name: string }; email: string | null; directorPhone: string | null };
export function InstitutionWorkspacePage() {
  const { id = '' } = useParams(); const [place, setPlace] = useState<Workspace | null>(null); const [teachers, setTeachers] = useState<TeacherDirectoryItem[]>([]);
  const [q, setQ] = useState(''); const [search, setSearch] = useState(''); const [cursor, setCursor] = useState<string | null>(null); const [next, setNext] = useState<string | null>(null); const [total, setTotal] = useState(0); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const current = ++epoch.current;
    setLoading(true); setError(''); setPlace(null);
    try { const [workspace, records] = await Promise.all([portalFetch<{ data: Workspace }>(`/institutions/${id}/workspace`), listTeachers({ institutionId: id, q: q || undefined, cursor: cursor ?? undefined, limit: 25 })]); if (epoch.current !== current) return; setPlace(workspace.data); setTeachers(records.data); setNext(records.page.nextCursor); setTotal(records.page.total); }
    catch { if (epoch.current === current) setError('تعذر عرض المؤسسة أو أساتذتها ضمن نطاقك.'); } finally { if (epoch.current === current) setLoading(false); }
  }, [id, q, cursor]);
  useEffect(() => { void load(); return () => { epoch.current += 1; }; }, [load]);
  return <section dir="rtl"><PageHeader variant="compact" title={place?.name ?? 'مساحة المؤسسة'} breadcrumbs={[{ label: 'المؤسسات', to: '/app/institutions' }, { label: 'مساحة المؤسسة' }]} />
    {loading ? <LoadingState compact /> : error ? <ErrorState compact title={error} action={<Button onClick={() => { void load(); }}>إعادة المحاولة</Button>} /> : <>
      {place ? <Card><CardContent><dl className="portal-facts"><div><dt>المقاطعة</dt><dd>{place.district.name}</dd></div><div><dt>البلدية</dt><dd>{place.municipality ?? 'غير محددة'}</dd></div><div><dt>العنوان</dt><dd>{place.address ?? 'غير مسجل'}</dd></div><div><dt>البريد</dt><dd><bdi>{place.email ?? 'غير مسجل'}</bdi></dd></div></dl><Link to={`/app/teachers?districtId=${place.districtId}${place.municipality ? `&municipality=${encodeURIComponent(place.municipality)}` : ''}`}>دليل الأساتذة ضمن السياق الجغرافي</Link></CardContent></Card> : null}
      <h2>الأساتذة المرتبطون حاليًا — أصلية أو تكملة نصاب</h2><form onSubmit={(e) => { e.preventDefault(); setQ(search); setCursor(null); }}><Input id="institution-teacher-search" label="البحث ضمن أساتذة المؤسسة" maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)} /><Button type="submit">بحث</Button></form><p role="status">إجمالي النتائج: {total}</p>
      {teachers.length ? <ul className="teacher-directory__cards">{teachers.map((teacher) => <li className="teacher-directory__card" key={teacher.id}><Link to={`/app/teachers/${teacher.id}`}><bdi>{teacher.name} {teacher.surname}</bdi></Link><p>{teacher.currentInstitution?.id === id ? 'المؤسسة الأصلية' : 'تكملة نصاب سارية'}</p><Link to={`/app/teachers/${teacher.id}/schedules`}>التوزيع الأسبوعي</Link></li>)}</ul> : <EmptyState compact title="لا توجد نتائج مطابقة" />}
      <div className="portal-actions">{cursor ? <Button variant="secondary" onClick={() => setCursor(null)}>بداية القائمة</Button> : null}<Button variant="secondary" disabled={!next || loading} onClick={() => setCursor(next)}>النتائج التالية</Button></div>
    </>}
  </section>;
}
