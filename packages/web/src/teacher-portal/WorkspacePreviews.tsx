import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { listTeachers, type TeacherDirectoryItem } from '../auth/client';
import { Card, CardContent, EmptyState, LoadingState } from '../ui';
import { portalFetch } from './client';
import { TeacherAvatar } from './TeacherAvatar';
type Geography = { id: string; name: string; municipalities: Array<{ name: string; institutionCount: number }> };
export function WorkspacePreviews({ refreshKey = 0 }: { refreshKey?: number }) {
  const [teachers, setTeachers] = useState<TeacherDirectoryItem[] | null>(null); const [districts, setDistricts] = useState<Geography[] | null>(null); const [failed, setFailed] = useState(false);
  useEffect(() => { let active = true; setTeachers(null); setDistricts(null); setFailed(false);
    void Promise.all([listTeachers({ limit: 3 }), portalFetch<{ data: { districts: Geography[] } }>('/me/geography')]).then(([records, geography]) => { if (active) { setTeachers(records.data); setDistricts(geography.data.districts); } }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [refreshKey]);
  return <section className="portal-previews" aria-label="دليل الملفات والسياق الجغرافي"><Card><CardContent><h2>ملفات الأساتذة</h2><Link to="/app/teachers">فتح دليل الأساتذة</Link>
    {failed ? <p role="status">تعذرت معاينة الملفات؛ الدليل متاح عبر الرابط.</p> : !teachers ? <LoadingState compact /> : teachers.length ? <ul className="portal-preview-list">{teachers.map((t) => <li key={t.id}><TeacherAvatar teacherId={t.id} name={t.name} available={t.hasPhoto ?? false} /><div><Link to={`/app/teachers/${t.id}`}><bdi>{t.name} {t.surname}</bdi></Link><p><bdi>{t.currentInstitution?.name ?? 'مؤسسة أصلية غير معتمدة'}</bdi></p></div></li>)}</ul> : <EmptyState compact title="لا توجد ملفات نشطة في نطاقك" />}
  </CardContent></Card><Card><CardContent><h2>المقاطعات والبلديات</h2><Link to="/app/institutions">فتح مساحة المؤسسات</Link>
    {failed ? <p role="status">تعذر تحميل السياق الجغرافي.</p> : !districts ? <LoadingState compact /> : <ul>{districts.slice(0, 3).map((d) => <li key={d.id}><Link to={`/app/institutions?districtId=${d.id}`}><bdi>{d.name}</bdi></Link><ul>{d.municipalities.slice(0, 3).map((m) => <li key={m.name}><Link to={`/app/institutions?districtId=${d.id}&municipality=${encodeURIComponent(m.name)}`}><bdi>{m.name}</bdi> — {m.institutionCount} مؤسسة</Link></li>)}</ul></li>)}</ul>}
    <p>معاينة محدودة؛ القوائم الكاملة والبحث خادميان داخل المساحات.</p>
  </CardContent></Card></section>;
}
