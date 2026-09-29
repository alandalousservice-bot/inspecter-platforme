import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError, getTeacherProfile, patchTeacherProfile, type TeacherProfile, type TeacherProfilePatch } from '../auth/client';
import { Button, Card, CardContent, CardHeader, ErrorState, Input, LoadingState, SuccessState } from '../ui';
import './teacher-profile.css';

const labels: Record<keyof TeacherProfilePatch, string> = {
  name: 'الاسم', surname: 'اللقب', birthDate: 'تاريخ الميلاد', placeOfBirth: 'مكان الميلاد',
  phone: 'رقم الهاتف', email: 'البريد الإلكتروني', professionalStatus: 'الصفة المهنية',
  employedAt: 'تاريخ التوظيف', confirmedAt: 'تاريخ الترسيم/التثبيت', qualifications: 'المؤهلات',
};
const editable = Object.keys(labels) as (keyof TeacherProfilePatch)[];
const nullable = new Set<keyof TeacherProfilePatch>(editable.filter((field) => field !== 'name' && field !== 'surname'));
const statusLabels: Record<string, string> = {
  ACTIVE: 'نشط', INACTIVE: 'غير نشط',
  PERMANENT: 'مرسم', TRAINEE: 'متربص', CONTRACT: 'متعاقد', TEMPORARY_CONTRACT: 'متعاقد مؤقت',
};

function Field({ label, value }: { label: string; value: string | null }) {
  return <div className="teacher-fact"><dt>{label}</dt><dd>{value || '—'}</dd></div>;
}

function initialDraft(profile: TeacherProfile): Record<keyof TeacherProfilePatch, string> {
  return Object.fromEntries(editable.map((field) => [field, profile[field] ?? ''])) as Record<keyof TeacherProfilePatch, string>;
}

export function TeacherProfilePage() {
  const { id = '' } = useParams();
  const [profile, setProfile] = useState<TeacherProfile>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<keyof TeacherProfilePatch, string>>();
  const [cleared, setCleared] = useState<Set<keyof TeacherProfilePatch>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setProfile(undefined);
    setEditing(false);
    void getTeacherProfile(id).then(({ data }) => { if (active) setProfile(data); })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  function beginEdit() {
    if (!profile) return;
    setDraft(initialDraft(profile));
    setCleared(new Set());
    setErrors({});
    setSaveError('');
    setSuccess(false);
    setEditing(true);
  }

  function change(field: keyof TeacherProfilePatch, value: string) {
    setDraft((previous) => previous ? { ...previous, [field]: value } : previous);
    setCleared((previous) => { const next = new Set(previous); next.delete(field); return next; });
    setErrors((previous) => { const next = { ...previous }; delete next[field]; return next; });
  }

  function clear(field: keyof TeacherProfilePatch) {
    setDraft((previous) => previous ? { ...previous, [field]: '' } : previous);
    setCleared((previous) => new Set(previous).add(field));
    setErrors((previous) => { const next = { ...previous }; delete next[field]; return next; });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !profile || !draft) return;
    const nextErrors: Record<string, string> = {};
    const patch: Record<string, string | null> = {};
    for (const field of editable) {
      const value = draft[field].trim();
      if (cleared.has(field)) {
        if (profile[field] !== null) patch[field] = null;
      } else if (!value) {
        if (field === 'name' || field === 'surname' || profile[field] !== null) nextErrors[field] = 'أدخل قيمة أو استخدم زر المسح.';
      } else if (value !== profile[field]) {
        patch[field] = value;
      }
    }
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    if (Object.keys(patch).length === 0) { setEditing(false); return; }
    setSaving(true);
    setSaveError('');
    try {
      const { data } = await patchTeacherProfile(profile.id, patch as TeacherProfilePatch);
      setProfile(data);
      setEditing(false);
      setSuccess(true);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 400) {
        setErrors(Object.fromEntries(Object.entries(error.fields ?? {}).map(([field, messages]) => [field, messages[0] ?? 'قيمة غير صالحة.'])));
        setSaveError('تحقق من الحقول المدخلة.');
      } else if (error instanceof ApiRequestError && error.status === 404) {
        setSaveError('ملف الأستاذ غير متاح ضمن نطاق الوصول.');
      } else {
        setSaveError('تعذر حفظ الملف. أعد المحاولة.');
      }
    } finally {
      setSaving(false);
    }
  }

  return <div className="teacher-profile" dir="rtl">
    <nav aria-label="مسار التنقل"><Link to="/app/submissions">طلبات الأساتذة</Link><span aria-hidden="true"> / </span>ملف الأستاذ</nav>
    <h1>ملف الأستاذ</h1>
    {loading ? <LoadingState label="جارٍ تحميل ملف الأستاذ…" /> : null}
    {!loading && loadError ? <ErrorState title="تعذر عرض ملف الأستاذ" description="الملف غير متاح ضمن نطاق الوصول أو تعذر تحميله." /> : null}
    {!loading && profile ? <>
      {success ? <SuccessState title="تم حفظ الملف بنجاح." /> : null}
      {!editing ? <>
        <div className="teacher-profile__actions"><Button onClick={beginEdit}>تعديل الملف</Button></div>
        <Card><CardHeader title="الهوية" /><CardContent><dl className="teacher-profile__facts">
          <Field label="الاسم" value={profile.name} /><Field label="اللقب" value={profile.surname} />
          <Field label="تاريخ الميلاد" value={profile.birthDate} /><Field label="مكان الميلاد" value={profile.placeOfBirth} />
          <Field label="حالة السجل" value={statusLabels[profile.recordStatus] ?? 'غير محددة'} />
        </dl></CardContent></Card>
        <Card><CardHeader title="معلومات الاتصال" /><CardContent><dl className="teacher-profile__facts">
          <Field label="رقم الهاتف" value={profile.phone} /><Field label="البريد الإلكتروني" value={profile.email} />
        </dl></CardContent></Card>
        <Card><CardHeader title="المعلومات المهنية" /><CardContent><dl className="teacher-profile__facts">
          <Field label="الصفة المهنية" value={profile.professionalStatus ? statusLabels[profile.professionalStatus] ?? 'غير محددة' : null} />
          <Field label="تاريخ التوظيف" value={profile.employedAt} /><Field label="تاريخ الترسيم/التثبيت" value={profile.confirmedAt} />
          <Field label="المؤهلات" value={profile.qualifications} />
        </dl></CardContent></Card>
        <Card><CardHeader title="المؤسسات المصرح بها" description="معلومات صرّح بها المرسل — غير معتمدة، وليست إسنادات للمؤسسات." />
          <CardContent>{profile.declaredInstitutions ? <dl className="teacher-profile__facts">
            <Field label="المؤسسة الأساسية المصرح بها" value={profile.declaredInstitutions.primaryInstitutionName} />
            <Field label="مؤسسات إضافية مصرح بها" value={profile.declaredInstitutions.additionalInstitutionNames.join('، ')} />
          </dl> : <p>لا توجد تصريحات مؤسسات مرتبطة بهذا الملف.</p>}</CardContent>
        </Card>
      </> : <form onSubmit={(event) => { void save(event); }} noValidate aria-busy={saving}>
        <h2>تعديل الملف المهني</h2>
        {saveError ? <p role="alert">{saveError}</p> : null}
        <div className="teacher-profile__form">
          {editable.map((field) => <div key={field} className="teacher-profile__field">
            {field === 'professionalStatus' ? <div className="ui-field">
              <label className="ui-field__label" htmlFor={`teacher-${field}`}>{labels[field]}</label>
              <select id={`teacher-${field}`} className="ui-input" value={draft?.[field] ?? ''}
                aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `teacher-${field}-error` : undefined}
                onChange={(event) => change(field, event.target.value)} disabled={saving}>
                <option value="">اختر الصفة المهنية</option>
                {(['PERMANENT', 'TRAINEE', 'CONTRACT', 'TEMPORARY_CONTRACT'] as const).map((value) =>
                  <option key={value} value={value}>{statusLabels[value]}</option>)}
              </select>{errors[field] ? <p id={`teacher-${field}-error`} role="alert">{errors[field]}</p> : null}
            </div> : <Input id={`teacher-${field}`} label={labels[field]}
              type={['birthDate', 'employedAt', 'confirmedAt'].includes(field) ? 'date' : field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
              value={draft?.[field] ?? ''} onChange={(event) => change(field, event.target.value)}
              error={errors[field]} required={!nullable.has(field)} disabled={saving} />}
            {nullable.has(field) ? <Button variant="subtle" disabled={saving} onClick={() => clear(field)}
              aria-label={`مسح ${labels[field]}`}>مسح {labels[field]}</Button> : null}
            {cleared.has(field) ? <span role="status">سيُمسح هذا الحقل عند الحفظ.</span> : null}
          </div>)}
        </div>
        <div className="teacher-profile__actions"><Button type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}</Button>
          <Button variant="secondary" disabled={saving} onClick={() => { setEditing(false); setDraft(undefined); setErrors({}); setSaveError(''); }}>إلغاء</Button>
        </div>
      </form>}
    </> : null}
  </div>;
}
