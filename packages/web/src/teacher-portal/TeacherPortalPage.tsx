import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Card, CardContent, EmptyState, ErrorState, FormGrid, FormSection, Input, LoadingState, PageHeader, StatusBadge, SuccessState } from '../ui';
import { portalFetch, professionalLabels, requestLabels, stateLabels, trainingLabels, type Place, type PortalRequest, type TeacherOwnProfile } from './client';
import { TeacherAvatar } from './TeacherAvatar';
import { TeacherScheduleEditor } from './TeacherScheduleEditor';
import { InstitutionalContext } from './InstitutionalContext';
import './portal.css';

export function TeacherPortalPage() {
  const [profile, setProfile] = useState<TeacherOwnProfile | null>(null); const [places, setPlaces] = useState<Place[]>([]); const [districts, setDistricts] = useState<Place[]>([]);
  const [requests, setRequests] = useState<PortalRequest[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [message, setMessage] = useState('');
  const [actions, setActions] = useState<Array<{ id: string; academicYear: string; status: string; note: string | null; decisionNote?: string | null }>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [section, setSection] = useState('profile'); const [kind, setKind] = useState('CONTACT'); const [saving, setSaving] = useState(false); const [photoVersion, setPhotoVersion] = useState(0);
  const navigate = useNavigate();
  const load = useCallback(async () => {
    setLoading(true); setError(''); setProfile(null);
    try {
      const [own, work, inbox, routing, alerts] = await Promise.all([portalFetch<{ data: { teacher: TeacherOwnProfile } }>('/teacher/me'), portalFetch<{ data: { items: Place[] } }>('/teacher/workplaces'), portalFetch<{ data: PortalRequest[]; page: { nextCursor: string | null } }>('/teacher/requests'), portalFetch<{ data: { items: Place[] } }>('/teacher/districts'), portalFetch<{ data: { corrections: typeof actions } }>('/teacher/actions')]);
      setProfile(own.data.teacher); setPlaces(work.data.items); setRequests(inbox.data); setDistricts(routing.data.items);
      setNextCursor(inbox.page.nextCursor); setActions(alerts.data.corrections);
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل بياناتك.'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function logout() { try { await portalFetch('/teacher/auth/logout', {}); navigate('/teacher/login', { replace: true }); } catch { setError('تعذر تسجيل الخروج. حاول مجددًا.'); } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const value = (key: string) => String(data.get(key) ?? '').trim();
    let payload: Record<string, unknown>;
    if (kind === 'CONTACT') payload = Object.fromEntries(['phone', 'email', 'personalAddress'].filter((key) => value(key)).map((key) => [key, value(key)]));
    else if (kind === 'PROFILE') payload = Object.fromEntries(['name', 'surname', 'birthDate', 'placeOfBirth', 'professionalStatus', 'employedAt', 'confirmedAt', 'qualifications'].filter((key) => value(key)).map((key) => [key, value(key)]));
    else if (kind === 'TRAINING') payload = { status: value('status'), ...(value('note') ? { note: value('note') } : {}) };
    else if (kind === 'TRANSFER') payload = { destinationDistrictId: value('districtId'), reason: value('reason') };
    else if (kind === 'LOCATION') payload = { institutionId: value('institutionId'), latitude: Number(value('latitude')), longitude: Number(value('longitude')) };
    else payload = { institutionName: value('institutionName'), ...(value('municipality') ? { municipality: value('municipality') } : {}) };
    setSaving(true); setError(''); setMessage('');
    try { await portalFetch('/teacher/requests', { kind, payload }); form.reset(); await load(); setMessage('تم إرسال التصريح للمفتش. البيانات المعتمدة لم تتغير تلقائيًا.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر إرسال الطلب.'); } finally { setSaving(false); }
  }
  async function upload(file?: File) {
    if (!file) return; setSaving(true); setMessage(''); setError('');
    try { if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('اختر PNG أو JPEG لا تتجاوز 2 ميغابايت.'); await portalFetch('/teacher/photo', undefined, { file }); setPhotoVersion((n) => n + 1); setMessage('تم تحديث الصورة الشخصية.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر رفع الصورة.'); } finally { setSaving(false); }
  }
  return <main className="teacher-portal" dir="rtl"><PageHeader title="مساحتي المهنية" secondaryActions={<Button variant="secondary" onClick={() => { void logout(); }}>تسجيل الخروج</Button>} />
    {loading ? <LoadingState label="جارٍ تحميل بياناتك…" /> : null}
    {error ? <ErrorState compact title={error} action={<Button onClick={() => { void load(); }}>إعادة المحاولة</Button>} /> : null}
    {message ? <SuccessState title={message} /> : null}
    {profile ? <>
      <InstitutionalContext district={profile.district.name} />
      <header className="portal-identity"><TeacherAvatar key={photoVersion} own name={profile.name} revision={photoVersion} /><div><h2><bdi>{profile.name} {profile.surname}</bdi></h2><p>{professionalLabels[profile.professionalStatus ?? ''] ?? 'صفة غير مسجلة'}</p><p><bdi>{profile.district.name}</bdi> · <bdi>{profile.institution?.name ?? 'لم تعتمد مؤسسة أصلية'}</bdi></p><p>{profile.institution?.municipality}</p></div></header>
      <nav className="portal-navigation" aria-label="أقسام مساحة الأستاذ">{[['profile', 'بياناتي وأماكن العمل'], ['schedule', 'التوزيع الأسبوعي'], ['requests', 'الطلبات والتحديثات']].map(([key, label]) => <Button key={key} variant={section === key ? 'primary' : 'secondary'} aria-pressed={section === key} onClick={() => setSection(key!)}>{label}</Button>)}</nav>
      {actions.length ? <aside aria-label="تنبيهات المفتش"><h2>مراجعات التوزيع والمتابعة</h2>{actions.map((a) => <Card key={a.id}><CardContent><h3>{stateLabels[a.status]} — <bdi>{a.academicYear}</bdi></h3><p>{a.note}</p>{a.decisionNote ? <p>سبب الرفض: <bdi>{a.decisionNote}</bdi></p> : null}<Button variant="secondary" onClick={() => setSection('schedule')}>فتح التوزيع الأسبوعي</Button></CardContent></Card>)}</aside> : null}
      {section === 'profile' ? <>
        <Card><CardContent><h2>بيانات معتمدة</h2><dl className="portal-facts"><div><dt>البريد المهني</dt><dd><bdi>{profile.email ?? 'غير مسجل'}</bdi></dd></div><div><dt>الهاتف</dt><dd><bdi>{profile.phone ?? 'غير مسجل'}</bdi></dd></div><div><dt>التكوين البيداغوجي</dt><dd>{trainingLabels[profile.trainingStatus ?? ''] ?? 'غير محدد'}{profile.trainingVerifiedAt ? ' — موثق' : ' — لا يوجد إثبات إتمام معتمد'}</dd></div></dl>
          <dl className="portal-facts">{[['تاريخ الميلاد', profile.birthDate?.slice(0, 10)], ['مكان الميلاد', profile.placeOfBirth], ['تاريخ التوظيف', profile.employedAt?.slice(0, 10)], ['تاريخ التثبيت', profile.confirmedAt?.slice(0, 10)], ['الإطار المهني', profile.professionalFramework]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd><bdi>{value ?? 'غير مسجل'}</bdi></dd></div>)}</dl>
          <label className="ui-field__label" htmlFor="teacher-photo-upload">الصورة الشخصية — PNG / JPEG، حتى 2 ميغابايت</label><input id="teacher-photo-upload" type="file" accept="image/png,image/jpeg" disabled={saving} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        </CardContent></Card>
        <Card><CardContent><h2>أماكن العمل المعتمدة</h2>{places.length ? <ul>{places.map((place) => <li key={`${place.role}-${place.id}`}><bdi>{place.name}</bdi> · {place.role === 'HOME' ? 'مؤسسة أصلية' : 'تكملة نصاب'} · <bdi>{place.municipality ?? 'البلدية غير محددة'}</bdi></li>)}</ul> : <EmptyState compact title="لا توجد مؤسسة معتمدة متاحة" />}</CardContent></Card>
        <Card><CardContent><h2>الشهادات المعتمدة</h2>{profile.qualificationsStructured.length ? <ul>{profile.qualificationsStructured.map((q) => <li key={q.id}><bdi>{q.name}</bdi>{q.issuingBody ? <> · <bdi>{q.issuingBody}</bdi></> : null}{q.qualificationDate ? <> · <bdi>{q.qualificationDate.slice(0, 10)}</bdi></> : null}</li>)}</ul> : <p>لا توجد شهادات منظمة معتمدة بعد.</p>}</CardContent></Card>
      </> : section === 'schedule' ? <TeacherScheduleEditor places={places} /> : <>
        <FormSection title="إرسال تحديث أو طلب"><label className="ui-field__label" htmlFor="portal-request-kind">نوع الطلب</label><select id="portal-request-kind" className="ui-input" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(requestLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <form key={kind} onSubmit={(e) => { void submit(e); }}><FormGrid>
            {kind === 'PROFILE' ? <><Input id="portal-name" name="name" label="الاسم المقترح" maxLength={100} /><Input id="portal-surname" name="surname" label="اللقب المقترح" maxLength={100} /><Input id="portal-birth" name="birthDate" label="تاريخ الميلاد المقترح" type="date" /><Input id="portal-birthplace" name="placeOfBirth" label="مكان الميلاد المقترح" maxLength={150} /><div className="ui-field"><label htmlFor="portal-professional-status">الصفة المهنية المقترحة</label><select id="portal-professional-status" className="ui-input" name="professionalStatus" defaultValue=""><option value="">دون تغيير</option>{Object.entries(professionalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><Input id="portal-employment" name="employedAt" label="تاريخ التوظيف المقترح" type="date" /><Input id="portal-confirmation" name="confirmedAt" label="تاريخ التثبيت المقترح" type="date" /><Input id="portal-qualifications" name="qualifications" label="المؤهلات المصرح بها" maxLength={1000} /><p>البيانات المهنية تحتاج مراجعة المفتش؛ الشهادات المنظمة لا تنشأ آليًا من التصريح النصي.</p></> : null}
            {kind === 'CONTACT' ? <><Input id="portal-phone" name="phone" label="الهاتف المقترح" type="tel" maxLength={16} /><Input id="portal-email" name="email" label="البريد المقترح" type="email" maxLength={254} /><Input id="portal-address" name="personalAddress" label="العنوان المقترح" maxLength={300} /></> : null}
            {kind === 'TRAINING' ? <><div className="ui-field"><label htmlFor="portal-training">حالة التكوين المصرح بها</label><select id="portal-training" name="status" className="ui-input">{Object.entries(trainingLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div><Input id="portal-training-note" name="note" label="تفصيل اختياري" maxLength={500} /><p>التصريح بالإتمام لا يمنح إثبات إتمام أو أهلية تثبيت آلية.</p></> : null}
            {kind === 'TRANSFER' ? <><div className="ui-field"><label htmlFor="portal-destination">المقاطعة المقصودة</label><select id="portal-destination" name="districtId" className="ui-input" required defaultValue=""><option value="">اختر المقاطعة</option>{districts.filter((d) => d.id !== profile.district.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div><Input id="portal-transfer-reason" name="reason" label="سبب طلب الانتقال" maxLength={500} required /><p>موافقة المصدر لا تنقل ملفك أو صلاحياته قبل إتمام عقد المقاطعة المستقبلة.</p></> : null}
            {kind === 'WORKPLACE' ? <><Input id="portal-workplace-name" name="institutionName" label="اسم المؤسسة المصرح به" maxLength={200} required /><Input id="portal-workplace-municipality" name="municipality" label="البلدية" maxLength={150} /><p>التصريح لا ينشئ مؤسسة أو إسنادًا معتمدًا.</p></> : null}
            {kind === 'LOCATION' ? <><div className="ui-field"><label htmlFor="portal-location-institution">المؤسسة المعتمدة</label><select id="portal-location-institution" name="institutionId" className="ui-input" required defaultValue=""><option value="">اختر المؤسسة</option>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div><Input id="portal-latitude" name="latitude" label="خط العرض المقترح" type="number" min={-90} max={90} step="0.000001" required /><Input id="portal-longitude" name="longitude" label="خط الطول المقترح" type="number" min={-180} max={180} step="0.000001" required /><p>إدخال يدوي فقط؛ لا يتتبع النظام موقعك.</p></> : null}
          </FormGrid><Button type="submit" loading={saving}>إرسال للمراجعة</Button></form>
        </FormSection>
        <section aria-label="طلباتي"><h2>الطلبات المسجلة</h2>{requests.length ? requests.map((r) => <Card key={r.id}><CardContent><h3>{requestLabels[r.kind]}</h3><StatusBadge tone={r.status === 'ACCEPTED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'neutral'}>{stateLabels[r.status]}</StatusBadge>{r.decisionNote ? <p><bdi>{r.decisionNote}</bdi></p> : null}</CardContent></Card>) : <EmptyState compact title="لا توجد طلبات مسجلة" />}<p>التصريحات منفصلة عن البيانات المعتمدة.</p>{nextCursor ? <Button variant="secondary" disabled={loading || saving} onClick={() => { setSaving(true); void portalFetch<{ data: PortalRequest[]; page: { nextCursor: string | null } }>(`/teacher/requests?cursor=${nextCursor}`).then((r) => { setRequests((all) => [...all, ...r.data]); setNextCursor(r.page.nextCursor); }).catch(() => setError('تعذر تحميل بقية الطلبات.')).finally(() => setSaving(false)); }}>تحميل طلبات أقدم</Button> : null}</section>
      </>}
    </> : !loading ? <Link to="/teacher/login">تسجيل دخول الأستاذ</Link> : null}
  </main>;
}
