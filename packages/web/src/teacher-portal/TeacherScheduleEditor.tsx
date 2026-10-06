import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { WeeklySchedule, WeeklyScheduleSlotInput } from '../auth/client';
import { Button, EmptyState, ErrorState, FormGrid, FormSection, Input, LoadingState, SuccessState } from '../ui';
import { portalFetch, stateLabels, type Place, type ScheduleReview } from './client';
import './portal.css';

const days = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
const displayTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export function WeekBoard({ slots, places, onRemove }: { slots: Array<WeeklyScheduleSlotInput & { institution?: { name: string } | null }>; places: Place[]; onRemove?: (index: number) => void }) {
  const total = slots.reduce((n, s) => n + s.endMinute - s.startMinute, 0);
  return <section aria-label="لوحة أيام الأسبوع"><p>الحصص: {slots.length} · مجموع مدد الحصص المسجلة: {Math.floor(total / 60)} ساعة و{total % 60} دقيقة</p><div className="week-board">{days.map((day, index) => <article key={day}><h3>{day}</h3><ol>{slots.map((slot, position) => ({ slot, position })).filter(({ slot }) => slot.dayOfWeek === index + 1).sort((a, b) => a.slot.startMinute - b.slot.startMinute).map(({ slot, position }) => <li key={position}><strong><bdi>{slot.groupLabel ?? slot.levelLabel ?? 'حصة'}</bdi></strong><p><bdi dir="ltr">{displayTime(slot.startMinute)} — {displayTime(slot.endMinute)}</bdi></p><p><bdi>{slot.institution?.name ?? places.find((p) => p.id === slot.institutionId)?.name ?? 'مؤسسة تاريخية'}</bdi></p><small>{slot.validFrom ?? 'سريان تاريخي غير محدد'}{slot.validTo ? ` ← ${slot.validTo}` : ''}</small>{onRemove ? <Button variant="ghost" onClick={() => onRemove(position)} aria-label={`حذف حصة ${day} ${displayTime(slot.startMinute)}`}>إزالة من المسودة</Button> : null}</li>)}</ol>{!slots.some((s) => s.dayOfWeek === index + 1) ? <p>لا حصص</p> : null}</article>)}</div></section>;
}
export function TeacherScheduleEditor({ places }: { places: Place[] }) {
  const [year, setYear] = useState(''); const [loadedYear, setLoadedYear] = useState(''); const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [slots, setSlots] = useState<WeeklyScheduleSlotInput[]>([]); const [correction, setCorrection] = useState<ScheduleReview | null>(null); const [reviews, setReviews] = useState<ScheduleReview[]>([]);
  const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const editable = Boolean(loadedYear && correction?.status !== 'SUBMITTED');
  const epoch = useRef(0); useEffect(() => () => { epoch.current += 1; }, []);
  async function load(event?: FormEvent) {
    event?.preventDefault(); const current = ++epoch.current; const requestedYear = year; setLoading(true); setError(''); setMessage(''); setLoadedYear('');
    try {
      const result = await portalFetch<{ data: { schedule: WeeklySchedule | null; correction: ScheduleReview | null; reviews: ScheduleReview[] } }>(`/teacher/schedules?academicYear=${encodeURIComponent(requestedYear)}`);
      if (epoch.current !== current) return;
      setSchedule(result.data.schedule); setCorrection(result.data.correction); setReviews(result.data.reviews ?? []); setLoadedYear(requestedYear);
      setSlots(result.data.schedule?.slots.filter((s) => s.institutionId && s.validFrom).map((s) => ({ institutionId: s.institutionId!, validFrom: s.validFrom!, validTo: s.validTo, dayOfWeek: s.dayOfWeek, startMinute: s.startMinute, endMinute: s.endMinute, levelLabel: s.levelLabel, groupLabel: s.groupLabel, notes: s.notes })) ?? []);
    } catch (e) { if (epoch.current === current) setError(e instanceof Error ? e.message : 'تعذر تحميل التوزيع.'); } finally { if (epoch.current === current) setLoading(false); }
  }
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const value = (key: string) => String(data.get(key) ?? '');
    const minute = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    const startMinute = minute(value('start')); const endMinute = minute(value('end'));
    if (startMinute >= endMinute || slots.length >= 100 || !value('institutionId')) { setError('تحقق من المؤسسة والأوقات وعدد الحصص.'); return; }
    setSlots((current) => [...current, { institutionId: value('institutionId'), validFrom: value('validFrom'), validTo: value('validTo') || null, dayOfWeek: Number(value('day')), startMinute, endMinute, groupLabel: value('group') || null, levelLabel: value('level') || null, notes: null }]); setError('');
  }
  async function submit() {
    setSaving(true); setError(''); setMessage('');
    try {
      const payload = { academicYear: loadedYear, slots };
      if (correction?.status === 'REQUESTED') await portalFetch(`/teacher/schedule-corrections/${correction.id}`, { ...payload, expectedRevision: correction.revision });
      else await portalFetch('/teacher/schedules', { ...payload, ...(schedule ? { expectedRevision: schedule.revision } : {}) });
      await load(); setMessage(correction ? 'تم إرسال التصحيح للمفتش. يبقى الجدول السابق ساريًا حتى الاعتماد.' : schedule ? 'تم إرسال التحديث للمراجعة. يبقى الجدول الساري دون تغيير حتى الاعتماد.' : 'تم تسجيل التوزيع الأولي.');
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إرسال التوزيع.'); } finally { setSaving(false); }
  }
  return <section aria-label="توزيعي الأسبوعي"><form onSubmit={(e) => { void load(e); }}><Input id="teacher-portal-year" label="السنة الدراسية" placeholder="2026-2027" required pattern="[0-9]{4}-[0-9]{4}" value={year} onChange={(e) => setYear(e.target.value)} /><Button type="submit" loading={loading}>عرض التوزيع</Button></form>
    {error ? <ErrorState compact title={error} /> : null}{message ? <SuccessState title={message} /> : null}{loading ? <LoadingState compact /> : null}
    {loadedYear ? <>
      <p>السنة المعروضة: <bdi>{loadedYear}</bdi></p>
      {schedule?.slots.some((s) => !s.institutionId || !s.validFrom) && editable ? <p role="alert">يتضمن الجدول حصصًا تاريخية غير مكتملة المرجع. أعد إدخال ما يلزم في المسودة؛ عند الاعتماد تُحفظ نسخة الجدول السابق كاملة.</p> : null}
      {correction ? <aside role="status"><strong>{stateLabels[correction.status]} — {correction.origin === 'TEACHER_UPDATE' ? 'تحديث مستقل من الأستاذ' : 'تصحيح بطلب المفتش'}</strong><p><bdi>{correction.note}</bdi></p></aside> : null}
      {schedule ? <><h2>الجدول الساري</h2><WeekBoard slots={schedule.slots as unknown as WeeklyScheduleSlotInput[]} places={places} /></> : <EmptyState compact title="لا يوجد توزيع لهذه السنة بعد" />}
      {correction?.proposedSlots ? <><h2>المقترح المرسل — غير ساري بعد</h2><WeekBoard slots={correction.proposedSlots} places={places} /></> : null}
      {editable ? <FormSection title={correction ? 'مسودة التصحيح — لا تستبدل الجدول الساري بعد' : schedule ? 'مسودة تحديث مستقل — بانتظار اعتماد المفتش بعد الإرسال' : 'إعداد التوزيع الأولي'}>
        <form onSubmit={add}><FormGrid><div className="ui-field"><label htmlFor="portal-slot-day">اليوم</label><select id="portal-slot-day" name="day" className="ui-input">{days.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></div>
          <div className="ui-field"><label htmlFor="portal-slot-place">المؤسسة المعتمدة</label><select id="portal-slot-place" name="institutionId" className="ui-input" required defaultValue=""><option value="">اختر المؤسسة</option>{places.map((p) => <option key={`${p.role}-${p.id}`} value={p.id}>{p.name}</option>)}</select></div>
          <Input id="portal-slot-start" name="start" label="بداية الحصة" type="time" required /><Input id="portal-slot-end" name="end" label="نهاية الحصة" type="time" required />
          <Input id="portal-slot-from" name="validFrom" label="سارية من" type="date" required /><Input id="portal-slot-to" name="validTo" label="سارية إلى — اختياري" type="date" />
          <Input id="portal-slot-level" name="level" label="المستوى — اختياري" maxLength={100} /><Input id="portal-slot-group" name="group" label="القسم — اختياري" maxLength={100} />
        </FormGrid><Button type="submit" disabled={saving || places.length === 0}>إضافة إلى المسودة</Button></form><WeekBoard slots={slots} places={places} onRemove={saving ? undefined : (position) => setSlots((all) => all.filter((_s, i) => i !== position))} /><Button onClick={() => { void submit(); }} loading={saving} disabled={slots.length === 0}>{correction ? 'إرسال التصحيح للمراجعة' : schedule ? 'إرسال التحديث للمراجعة' : 'تسجيل التوزيع الأولي'}</Button>
        {!places.length ? <p role="status">يلزم اعتماد مكان عمل قبل تسجيل حصة.</p> : null}
      </FormSection> : schedule ? <p>يوجد مقترح مرسل للمراجعة. يبقى الجدول الساري دون تغيير حتى قرار المفتش.</p> : null}
      {reviews.filter((r) => r.status === 'ACCEPTED' || r.status === 'REJECTED').map((r) => <section key={r.id} aria-label="نتيجة مراجعة الجدول"><h3>{stateLabels[r.status]} — {r.origin === 'TEACHER_UPDATE' ? 'تحديث مستقل' : 'تصحيح'}</h3>{r.decisionNote ? <p>سبب الرفض: <bdi>{r.decisionNote}</bdi></p> : null}</section>)}
    </> : null}
  </section>;
}
