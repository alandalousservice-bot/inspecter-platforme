import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError, addWeeklyScheduleSlot, createWeeklySchedule, deleteWeeklyScheduleSlot, getTeacherProfile, getWeeklySchedule, getValidWorkplaces, patchWeeklyScheduleSlot,
  type TeacherProfile, type WeeklySchedule, type WeeklyScheduleSlot, type WeeklyScheduleSlotInput, type ValidWorkplaceOption } from '../auth/client';
import { Button, Card, CardContent, CardHeader, EmptyState, ErrorState, Input, LoadingState, SuccessState } from '../ui';
import { formatTime, normalizeOptionalText, parseTime, weekdays } from './weekly-schedule-domain';
import './weekly-schedule.css';

type Draft = { dayOfWeek: number; start: string; end: string; validFrom: string; validTo: string; institutionId: string; levelLabel: string; groupLabel: string; notes: string };
const blankDraft = (): Draft => ({ dayOfWeek: 1, start: '', end: '', validFrom: '', validTo: '', institutionId: '', levelLabel: '', groupLabel: '', notes: '' });
const messages: Record<string, string> = {
  WEEKLY_SCHEDULE_SLOT_OVERLAP: 'تتداخل هذه الحصة مع حصة أخرى في اليوم نفسه.',
  WEEKLY_SCHEDULE_REVISION_CONFLICT: 'تم تعديل التوزيع الأسبوعي منذ فتحه. حدّث البيانات ثم أعد المحاولة.',
  WEEKLY_SCHEDULE_ALREADY_EXISTS: 'يوجد توزيع لهذه السنة؛ تم تحديث البيانات الحالية.',
  CONFLICT: 'تعذر اعتماد المؤسسة أو فترة السريان. تحقق من صلاحيتها ومن عدم التداخل.',
  TEACHER_CURRENT_INSTITUTION_REQUIRED: 'اعتمد المؤسسة الحالية للأستاذ أولًا قبل تعديل التوزيع الأسبوعي.',
};

function errorText(error: unknown) {
  return error instanceof ApiRequestError ? messages[error.code ?? ''] ?? 'تعذر إكمال العملية. راجع البيانات وحاول مجددًا.' : 'تعذر الاتصال بالخدمة. حاول مجددًا.';
}

function slotInput(draft: Draft): WeeklyScheduleSlotInput | null {
  const startMinute = parseTime(draft.start);
  const endMinute = parseTime(draft.end, true);
  if (startMinute === null || endMinute === null || startMinute >= endMinute) return null;
  const text = (value: string, max: number) => {
    if (value.length === 0) return null;
    const normalized = normalizeOptionalText(value);
    if (!normalized || Array.from(normalized).length > max || /[\p{Cc}]/u.test(value)) return undefined;
    return normalized;
  };
  const levelLabel = text(draft.levelLabel, 100); const groupLabel = text(draft.groupLabel, 100); const notes = text(draft.notes, 500);
  if (levelLabel === undefined || groupLabel === undefined || notes === undefined) return null;
  if (!draft.institutionId || !/^\d{4}-\d{2}-\d{2}$/u.test(draft.validFrom) || (draft.validTo && (!/^\d{4}-\d{2}-\d{2}$/u.test(draft.validTo) || draft.validTo <= draft.validFrom))) return null;
  return { institutionId: draft.institutionId, validFrom: draft.validFrom, validTo: draft.validTo || null,
    dayOfWeek: draft.dayOfWeek, startMinute, endMinute, levelLabel, groupLabel, notes };
}

export function WeeklySchedulePage() {
  const { id = '' } = useParams();
  const [profile, setProfile] = useState<TeacherProfile>();
  const [profileError, setProfileError] = useState(false);
  const [academicYear, setAcademicYear] = useState('');
  const [schedule, setSchedule] = useState<WeeklySchedule | null>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [editing, setEditing] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [workplaces, setWorkplaces] = useState<ValidWorkplaceOption[]>([]);
  const [workplaceLoading, setWorkplaceLoading] = useState(false);
  const [workplaceError, setWorkplaceError] = useState(false);

  useEffect(() => { let active = true; void getTeacherProfile(id).then(({ data }) => { if (active) setProfile(data); }).catch(() => { if (active) setProfileError(true); }); return () => { active = false; }; }, [id]);
  useEffect(() => {
    if (!draft.validFrom) { setWorkplaces([]); return undefined; }
    let active = true; setWorkplaceLoading(true); setWorkplaceError(false);
    void getValidWorkplaces(id, { validFrom: draft.validFrom, ...(draft.validTo ? { validTo: draft.validTo } : {}) })
      .then(({ data }) => { if (active) setWorkplaces(data.items); })
      .catch(() => { if (active) { setWorkplaces([]); setWorkplaceError(true); } })
      .finally(() => { if (active) setWorkplaceLoading(false); });
    return () => { active = false; };
  }, [id, draft.validFrom, draft.validTo]);

  const loadSchedule = useCallback(async (year = academicYear) => {
    if (!/^\d{4}-\d{4}$/u.test(year) || Number(year.slice(5)) !== Number(year.slice(0, 4)) + 1) { setFormError('أدخل سنة دراسية بصيغة صحيحة مثل 2026-2027.'); return; }
    setLoading(true); setLoadError(false); setMessage('');
    try { const result = await getWeeklySchedule(id, year); setAcademicYear(year); setSchedule(result.data.schedule); }
    catch { setLoadError(true); setSchedule(undefined); }
    finally { setLoading(false); }
  }, [academicYear, id]);

  const refresh = useCallback(() => loadSchedule(), [loadSchedule]);
  async function mutate(action: () => Promise<{ data: { schedule: WeeklySchedule } }>, success: string) {
    setSaving(true); setFormError(''); setMessage('');
    try { const result = await action(); setSchedule(result.data.schedule); setMessage(success); setEditing(null); setDraft(blankDraft()); }
    catch (error) {
      if (error instanceof ApiRequestError && error.code === 'WEEKLY_SCHEDULE_ALREADY_EXISTS') { setMessage(messages[error.code]); await loadSchedule(); }
      else { setFormError(errorText(error)); if (error instanceof ApiRequestError && error.code === 'WEEKLY_SCHEDULE_REVISION_CONFLICT') setSchedule(undefined); }
    } finally { setSaving(false); }
  }

  function submitLoad(event: FormEvent) { event.preventDefault(); setFormError(''); void loadSchedule(academicYear); }
  async function submitCreate() { await mutate(() => createWeeklySchedule(id, academicYear), 'تم إنشاء التوزيع الأسبوعي.'); }
  async function submitSlot(event: FormEvent) {
    event.preventDefault(); if (!schedule) return;
    const value = slotInput(draft);
    if (!value) { setFormError('تحقق من اليوم والأوقات والنصوص الاختيارية.'); return; }
    const existing = editing ? schedule.slots.find((slot) => slot.id === editing) : undefined;
    if (editing) {
      const changes: Partial<WeeklyScheduleSlotInput> = {};
      for (const key of ['institutionId', 'validFrom', 'validTo', 'dayOfWeek', 'startMinute', 'endMinute', 'levelLabel', 'groupLabel', 'notes'] as const) if (value[key] !== existing?.[key]) Object.assign(changes, { [key]: value[key] });
      if (Object.keys(changes).length === 0) { setFormError('لا توجد تغييرات لحفظها.'); return; }
      await mutate(() => patchWeeklyScheduleSlot(editing, schedule.revision, changes), 'تم تحديث الحصة.');
    } else await mutate(() => addWeeklyScheduleSlot(schedule.id, schedule.revision, value), 'تمت إضافة الحصة.');
  }

  function beginEdit(slot: WeeklyScheduleSlot) {
    setEditing(slot.id); setFormError(''); setDraft({ dayOfWeek: slot.dayOfWeek, start: formatTime(slot.startMinute), end: formatTime(slot.endMinute),
      validFrom: slot.validFrom ?? '', validTo: slot.validTo ?? '', institutionId: slot.institutionId ?? '',
      levelLabel: slot.levelLabel ?? '', groupLabel: slot.groupLabel ?? '', notes: slot.notes ?? '' });
  }

  return <section className="weekly-schedule" dir="rtl">
    <header className="weekly-schedule__header"><div><h1>التوزيع الأسبوعي</h1><p>الأستاذ: {profile ? `${profile.name} ${profile.surname}` : '…'}</p></div><Link to={`/app/teachers/${encodeURIComponent(id)}`}>ملف الأستاذ</Link></header>
    {profileError ? <ErrorState title="تعذر تحميل ملف الأستاذ" description="تحقق من الاتصال ثم أعد المحاولة." action={<Button variant="secondary" onClick={() => window.location.reload()}>إعادة المحاولة</Button>} /> : null}
    {profile ? <Card><CardHeader title="المؤسسة الأم الحالية" /><CardContent><p>{profile.currentInstitution?.name ?? 'لا توجد مؤسسة أم حالية؛ يمكن اختيار مؤسسة تكملة نصاب صالحة للفترة.'}</p></CardContent></Card> : null}
    <Card><CardHeader title="اختيار السنة الدراسية" description="أدخل السنة صراحةً؛ لا تُختار سنة تلقائيًا." /><CardContent>
      <form className="weekly-schedule__year" onSubmit={submitLoad}>
        <Input id="weekly-academic-year" label="السنة الدراسية" placeholder="2026-2027" value={academicYear} onChange={(event) => setAcademicYear(event.currentTarget.value)} aria-describedby="weekly-year-help" />
        <span id="weekly-year-help" className="weekly-schedule__hint">الصيغة: YYYY-YYYY، والسنة الثانية تلي الأولى.</span>
        <Button type="submit" disabled={loading || saving}>عرض التوزيع</Button>
      </form>
      {formError && !schedule ? <div role="alert" className="weekly-schedule__error"><p>{formError}</p>{formError === messages.WEEKLY_SCHEDULE_REVISION_CONFLICT ? <Button variant="secondary" disabled={loading || saving} onClick={refresh}>تحديث البيانات</Button> : null}</div> : null}
    </CardContent></Card>
    {loading ? <LoadingState label="جارٍ تحميل التوزيع الأسبوعي…" /> : null}
    {!loading && loadError ? <ErrorState title="تعذر تحميل التوزيع" description="أعد المحاولة." action={<Button variant="secondary" onClick={refresh}>إعادة التحميل</Button>} /> : null}
    {!loading && !loadError && schedule === null ? <Card><CardContent><EmptyState title="لا يوجد توزيع لهذه السنة" description="أنشئ سجلًا فارغًا ثم أضف الحصص." />
      <Button disabled={saving} onClick={() => void submitCreate()}>{saving ? 'جارٍ الإنشاء…' : 'إنشاء توزيع فارغ'}</Button></CardContent></Card> : null}
    {!loading && schedule ? <Card><CardHeader title={`السنة الدراسية ${schedule.academicYear}`} description={`عدد الحصص: ${schedule.slots.length}`} action={<Button variant="secondary" disabled={loading || saving} onClick={refresh}>تحديث البيانات</Button>} />
      <CardContent>
        {message ? <SuccessState title={message} /> : null}
        {formError ? <div className="weekly-schedule__error" role="alert">{formError}{formError.includes('تم تعديل التوزيع') ? <Button variant="secondary" disabled={saving} onClick={refresh}>تحديث البيانات</Button> : null}</div> : null}
        {!schedule.slots.length ? <EmptyState title="لا توجد حصص مسجلة" description="يمكنك إضافة الحصة الأولى أدناه." /> : null}
        <div className="weekly-schedule__slots">{schedule.slots.map((slot) => <article className="weekly-schedule__slot" key={slot.id}>
          <div><h2>{weekdays[slot.dayOfWeek - 1]}</h2><p dir="ltr">{formatTime(slot.startMinute)} – {formatTime(slot.endMinute)}</p></div>
          <dl><div><dt>مكان العمل</dt><dd>{slot.institution?.name ?? 'مكان العمل غير مسجل'}{slot.institution?.municipality ? ` — ${slot.institution.municipality}` : ''}</dd></div>
            <div><dt>فترة السريان</dt><dd>{slot.validFrom ? `${slot.validFrom} — ${slot.validTo ?? 'مفتوحة'}` : 'الفترة غير مسجلة'}</dd></div>
            {slot.consistency.status !== 'CONSISTENT' ? <div><dt>الحالة</dt><dd>{slot.consistency.status === 'LEGACY_UNKNOWN' ? 'المكان والفترة غير مسجلين' : 'يحتاج إلى تصحيح'}</dd></div> : null}
            {slot.levelLabel ? <div><dt>المستوى</dt><dd>{slot.levelLabel}</dd></div> : null}{slot.groupLabel ? <div><dt>الفوج</dt><dd>{slot.groupLabel}</dd></div> : null}{slot.notes ? <div><dt>ملاحظات</dt><dd>{slot.notes}</dd></div> : null}</dl>
          <div className="weekly-schedule__actions"><Button variant="secondary" disabled={saving} onClick={() => beginEdit(slot)}>تعديل</Button>
            <Button variant="danger" disabled={saving} onClick={() => { if (window.confirm('هل تريد حذف هذه الحصة؟')) void mutate(() => deleteWeeklyScheduleSlot(slot.id, schedule.revision), 'تم حذف الحصة.'); }}>حذف</Button></div>
        </article>)}</div>
        <form className="weekly-schedule__form" onSubmit={(event) => { void submitSlot(event); }} aria-busy={saving}>
          <h2>{editing ? 'تعديل الحصة' : 'إضافة حصة'}</h2>
        <div className="weekly-schedule__fields">
            <Input id="schedule-valid-from" label="بداية السريان" type="date" required value={draft.validFrom} onChange={(event) => setDraft({ ...draft, validFrom: event.currentTarget.value, institutionId: '' })} disabled={saving} />
            <Input id="schedule-valid-to" label="نهاية السريان (اختياري)" type="date" value={draft.validTo} onChange={(event) => setDraft({ ...draft, validTo: event.currentTarget.value, institutionId: '' })} disabled={saving} hint="تاريخ النهاية غير مشمول؛ اتركه فارغًا للفترة المفتوحة." />
            <div className="ui-field"><label className="ui-field__label" htmlFor="schedule-institution">مكان العمل</label><select id="schedule-institution" className="ui-input" required value={draft.institutionId} onChange={(event) => setDraft({ ...draft, institutionId: event.currentTarget.value })} disabled={saving || workplaceLoading || !draft.validFrom}>
              <option value="">اختر مكان العمل للفترة</option>
              {editing && schedule.slots.find((slot) => slot.id === editing)?.institution && !workplaces.some((place) => place.id === schedule.slots.find((slot) => slot.id === editing)?.institutionId)
                ? <option value={schedule.slots.find((slot) => slot.id === editing)!.institutionId!}>{schedule.slots.find((slot) => slot.id === editing)!.institution!.name} — يحتاج إلى تصحيح</option> : null}
              {workplaces.map((place) => <option key={place.id} value={place.id}>{place.name}{place.municipality ? ` — ${place.municipality}` : ''} ({place.role === 'HOME' ? 'أم' : 'تكملة نصاب'})</option>)}
            </select></div>
            {workplaceLoading ? <p role="status">جارٍ تحميل أماكن العمل الصالحة…</p> : null}
            {workplaceError ? <p role="alert">تعذر تحميل أماكن العمل للفترة المحددة.</p> : null}
            <div className="ui-field"><label className="ui-field__label" htmlFor="schedule-day">اليوم</label><select id="schedule-day" className="ui-input" value={draft.dayOfWeek} onChange={(event) => setDraft({ ...draft, dayOfWeek: Number(event.currentTarget.value) })} disabled={saving}>{weekdays.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></div>
            <Input id="schedule-start" label="وقت البداية" type="time" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.currentTarget.value })} disabled={saving} />
            <Input id="schedule-end" label="وقت النهاية" type="text" inputMode="numeric" placeholder="HH:mm" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.currentTarget.value })} disabled={saving} hint="يمكن إدخال 24:00 كنهاية لليوم." />
            <Input id="schedule-level" label="المستوى (اختياري)" value={draft.levelLabel} onChange={(event) => setDraft({ ...draft, levelLabel: event.currentTarget.value })} disabled={saving} />
            <Input id="schedule-group" label="الفوج (اختياري)" value={draft.groupLabel} onChange={(event) => setDraft({ ...draft, groupLabel: event.currentTarget.value })} disabled={saving} />
            <Input id="schedule-notes" label="ملاحظات (اختياري)" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.currentTarget.value })} disabled={saving} />
          </div>
          <div className="weekly-schedule__actions"><Button type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ…' : editing ? 'حفظ الحصة' : 'إضافة الحصة'}</Button>
            {editing ? <Button type="button" variant="secondary" disabled={saving} onClick={() => { setEditing(null); setDraft(blankDraft()); setFormError(''); }}>إلغاء التعديل</Button> : null}</div>
        </form>
      </CardContent></Card> : null}
  </section>;
}
