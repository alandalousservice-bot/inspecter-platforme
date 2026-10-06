import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { getWeeklySchedule, type WeeklySchedule, type WeeklyScheduleSlotInput } from '../auth/client';
import { Button, Card, CardContent, EmptyState, ErrorState, Input, LoadingState } from '../ui';
import { WeekBoard } from './TeacherScheduleEditor';
export function DossierWeeklyReference({ teacherId }: { teacherId: string }) {
  const [year, setYear] = useState(''); const [loaded, setLoaded] = useState(''); const [schedule, setSchedule] = useState<WeeklySchedule | null>(null); const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  async function load(event: FormEvent) { event.preventDefault(); setBusy(true); setFailed(false); setLoaded('');
    try { const result = await getWeeklySchedule(teacherId, year); setSchedule(result.data.schedule); setLoaded(year); } catch { setFailed(true); } finally { setBusy(false); }
  }
  return <Card><CardContent><h2>مرجع التوزيع والتخطيط</h2><details><summary>عرض التوزيع داخل الملف</summary><form className="portal-actions" onSubmit={(e) => { void load(e); }}><Input id="dossier-schedule-year" label="سنة التوزيع داخل الملف" value={year} required pattern="[0-9]{4}-[0-9]{4}" placeholder="2026-2027" onChange={(e) => setYear(e.target.value)} /><Button type="submit" loading={busy}>عرض المرجع</Button></form>
    {busy ? <LoadingState compact /> : failed ? <ErrorState compact title="تعذر تحميل التوزيع المرجعي" /> : loaded ? schedule ? <WeekBoard slots={schedule.slots as unknown as WeeklyScheduleSlotInput[]} places={[]} /> : <EmptyState compact title="لا يوجد توزيع لهذه السنة" /> : null}
    {loaded ? <Link to={`/app/teachers/${teacherId}/schedules?academicYear=${loaded}`}>متابعة التصحيحات لهذه السنة</Link> : null}</details><Link to={`/app/visits/new?teacherId=${teacherId}`}>برمجة زيارة لهذا الأستاذ</Link><p>الجدول مرجع للتخطيط؛ لا ينشئ زيارة تلقائيًا.</p></CardContent></Card>;
}
