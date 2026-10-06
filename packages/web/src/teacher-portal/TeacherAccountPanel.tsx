import { useState } from 'react';
import { Button, Card, CardContent, Input } from '../ui';
import { portalFetch } from './client';
export function TeacherAccountPanel({ teacherId }: { teacherId: string }) {
  const [email, setEmail] = useState(''); const [confirmed, setConfirmed] = useState(false); const [link, setLink] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  async function issue() {
    setSaving(true); setError(''); setLink('');
    try { const result = await portalFetch<{ data: { activationToken: string } }>(`/teachers/${teacherId}/account-invitation`, { email, identityConfirmed: confirmed }, { inspector: true }); setLink(`${window.location.origin}/teacher/login#${result.data.activationToken}`); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر إصدار الدعوة.'); } finally { setSaving(false); }
  }
  return <details><summary>حساب الأستاذ — دعوة مقيدة بالملف</summary><Card><CardContent><p>تحقق من هوية الأستاذ ومن قناة تسليم الدعوة. الرابط سر تفعيل أحادي الاستخدام، صالح 8 ساعات ويُعرض مرة واحدة؛ لا ترسله لغير صاحب الملف.</p>
    <Input id="teacher-account-email" label="بريد تسجيل دخول الحساب" type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
    <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> تحققت من الهوية وقناة التسليم الخاصة بالأستاذ</label>
    <Button disabled={!confirmed || !email} loading={saving} onClick={() => { void issue(); }}>إصدار دعوة</Button>
    {error ? <p role="alert">{error}</p> : null}{link ? <><Input id="teacher-account-link" label="رابط التفعيل — لا تحفظه في ملفات المشروع" readOnly value={link} dir="ltr" /><Button variant="secondary" onClick={() => setLink('')}>إخفاء رابط التفعيل</Button></> : null}
  </CardContent></Card></details>;
}
