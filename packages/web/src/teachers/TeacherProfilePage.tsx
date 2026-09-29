import { useEffect, useRef, useState, type FormEvent, type SyntheticEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  ApiRequestError, getTeacherProfile, listInstitutions, patchTeacherProfile, setTeacherCurrentInstitution,
  type Institution, type TeacherCurrentInstitutionInput, type TeacherProfile, type TeacherProfilePatch,
} from '../auth/client';
import { Button, Card, CardContent, CardHeader, Dialog, EmptyState, ErrorState, Input, LoadingState, SuccessState } from '../ui';
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
const PAGE_SIZE = 25;

type WorkflowStep = 'choices' | 'existing' | 'confirm-existing' | 'create' | 'confirm-create' | null;
type InstitutionDraft = { name: string; municipality: string; address: string; directorPhone: string };
type ReviewedInstitution = { name: string; municipality?: string; address?: string; directorPhone?: string };

function Field({ label, value }: { label: string; value: string | null }) {
  return <div className="teacher-fact"><dt>{label}</dt><dd dir="auto">{value || '—'}</dd></div>;
}

function initialDraft(profile: TeacherProfile): Record<keyof TeacherProfilePatch, string> {
  return Object.fromEntries(editable.map((field) => [field, profile[field] ?? ''])) as Record<keyof TeacherProfilePatch, string>;
}

function normalizeInstitutionText(raw: string): string {
  return raw.trim().replace(/\s+/gu, ' ');
}

function normalizeDirectorPhone(raw: string): string | null {
  const value = raw.trim();
  if (Array.from(value).length > 20 || !/^[+0-9 ]+$/u.test(value)) return null;
  const compact = value.replace(/ /gu, '');
  const national = compact.startsWith('+213') ? compact.slice(4) : compact.startsWith('0') ? compact.slice(1) : '';
  if (/^[234]\d{7}$/u.test(national) || /^[567]\d{8}$/u.test(national)) return `+213${national}`;
  return null;
}

function validateInstitutionDraft(draft: InstitutionDraft): { errors: Record<string, string>; value?: ReviewedInstitution } {
  const errors: Record<string, string> = {};
  const name = normalizeInstitutionText(draft.name);
  const municipality = normalizeInstitutionText(draft.municipality);
  const address = normalizeInstitutionText(draft.address);
  const directorPhone = draft.directorPhone.trim();
  const textHasControl = (value: string) => /[\p{Cc}]/u.test(value);

  if (!name) errors.name = 'أدخل اسم المؤسسة.';
  else if (Array.from(name).length > 200 || textHasControl(draft.name)) errors.name = 'تحقق من اسم المؤسسة (حتى 200 حرف).';
  if (municipality && (Array.from(municipality).length > 150 || textHasControl(draft.municipality))) errors.municipality = 'يجب ألا تتجاوز البلدية 150 حرفًا.';
  if (address && (Array.from(address).length > 300 || textHasControl(draft.address))) errors.address = 'يجب ألا يتجاوز العنوان 300 حرف.';

  let normalizedPhone: string | undefined;
  if (directorPhone) {
    normalizedPhone = normalizeDirectorPhone(directorPhone) ?? undefined;
    if (!normalizedPhone) errors.directorPhone = 'أدخل رقم هاتف جزائريًا ثابتًا أو محمولًا صالحًا.';
  }
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    value: {
      name,
      ...(municipality ? { municipality } : {}),
      ...(address ? { address } : {}),
      ...(normalizedPhone ? { directorPhone: normalizedPhone } : {}),
    },
  };
}

function institutionPrefill(profile: TeacherProfile): InstitutionDraft {
  return {
    name: profile.declaredWorkplace?.institutionName ?? '',
    municipality: profile.declaredWorkplace?.municipality ?? '',
    address: profile.declaredWorkplace?.institutionAddress ?? '',
    directorPhone: profile.declaredWorkplace?.directorPhone ?? '',
  };
}

function institutionDescription(institution: Pick<Institution, 'municipality' | 'address'>): string {
  return [institution.municipality, institution.address].filter(Boolean).join(' — ') || 'لا توجد تفاصيل إضافية مسجلة.';
}

export function TeacherProfilePage() {
  const { id = '' } = useParams();
  const [profile, setProfile] = useState<TeacherProfile>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<keyof TeacherProfilePatch, string>>();
  const [cleared, setCleared] = useState<Set<keyof TeacherProfilePatch>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [workflow, setWorkflow] = useState<WorkflowStep>(null);
  const [selectedInstitution, setSelectedInstitution] = useState<Institution>();
  const [institutionDraft, setInstitutionDraft] = useState<InstitutionDraft>({ name: '', municipality: '', address: '', directorPhone: '' });
  const [reviewedInstitution, setReviewedInstitution] = useState<ReviewedInstitution>();
  const [institutionFormErrors, setInstitutionFormErrors] = useState<Record<string, string>>({});
  const [workflowError, setWorkflowError] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const savingLinkRef = useRef(false);

  const [institutionSearchText, setInstitutionSearchText] = useState('');
  const [institutionQuery, setInstitutionQuery] = useState('');
  const [cursorHistory, setCursorHistory] = useState<string[]>(['']);
  const [pageIndex, setPageIndex] = useState(0);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionTotal, setInstitutionTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [institutionListLoading, setInstitutionListLoading] = useState(false);
  const [institutionListError, setInstitutionListError] = useState(false);
  const [institutionListRetry, setInstitutionListRetry] = useState(0);
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
  }, [id, profileRefreshKey]);

  useEffect(() => {
    if (workflow !== 'existing' || !profile) return undefined;
    let active = true;
    setInstitutionListLoading(true);
    setInstitutionListError(false);
    void listInstitutions({
      districtId: profile.districtId,
      q: institutionQuery || undefined,
      cursor: cursorHistory[pageIndex] || undefined,
      limit: PAGE_SIZE,
    }).then((result) => {
      if (!active) return;
      setInstitutions(result.data);
      setInstitutionTotal(result.page.total);
      setNextCursor(result.page.nextCursor);
    }).catch(() => {
      if (!active) return;
      setInstitutions([]);
      setInstitutionListError(true);
    }).finally(() => { if (active) setInstitutionListLoading(false); });
    return () => { active = false; };
  }, [workflow, profile?.districtId, institutionQuery, cursorHistory, pageIndex, institutionListRetry]);

  function beginEdit() {
    if (!profile) return;
    setDraft(initialDraft(profile));
    setCleared(new Set());
    setErrors({});
    setSuccessMessage('');
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

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingProfile || !profile || !draft) return;
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
    setSavingProfile(true);
    setSuccessMessage('');
    try {
      const { data } = await patchTeacherProfile(profile.id, patch as TeacherProfilePatch);
      setProfile(data);
      setEditing(false);
      setSuccessMessage('تم حفظ الملف بنجاح.');
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 400) {
        setErrors(Object.fromEntries(Object.entries(error.fields ?? {}).map(([field, messages]) => [field, messages[0] ?? 'قيمة غير صالحة.'])));
        setSuccessMessage('تحقق من الحقول المدخلة.');
      } else if (error instanceof ApiRequestError && error.status === 404) {
        setSuccessMessage('ملف الأستاذ غير متاح ضمن نطاق الوصول.');
      } else {
        setSuccessMessage('تعذر حفظ الملف. أعد المحاولة.');
      }
    } finally {
      setSavingProfile(false);
    }
  }

  function startApproval() {
    setSelectedInstitution(undefined);
    setReviewedInstitution(undefined);
    setWorkflowError('');
    setInstitutionFormErrors({});
    setInstitutionSearchText('');
    setInstitutionQuery('');
    setCursorHistory(['']);
    setPageIndex(0);
    setSuccess(false);
    setWorkflow('choices');
  }

  function closeWorkflow() {
    if (savingLinkRef.current) return;
    setWorkflow(null);
    setWorkflowError('');
    setSelectedInstitution(undefined);
  }

  function handleDialogCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (savingLinkRef.current) {
      event.preventDefault();
      return;
    }
    setWorkflow(null);
  }

  function searchInstitutions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCursorHistory(['']);
    setPageIndex(0);
    setInstitutionQuery(institutionSearchText.trim());
  }

  function chooseInstitution(institution: Institution) {
    setSelectedInstitution(institution);
    setWorkflowError('');
    setWorkflow('confirm-existing');
  }

  function continueCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateInstitutionDraft(institutionDraft);
    setInstitutionFormErrors(validation.errors);
    setWorkflowError('');
    if (!validation.value) return;
    setReviewedInstitution(validation.value);
    setWorkflow('confirm-create');
  }

  async function confirmInstitution(input: TeacherCurrentInstitutionInput) {
    if (!profile || savingLinkRef.current) return;
    savingLinkRef.current = true;
    setSavingLink(true);
    setWorkflowError('');
    try {
      await setTeacherCurrentInstitution(profile.id, {
        ...input,
        expectedInstitutionId: profile.currentInstitution?.id ?? null,
      } as TeacherCurrentInstitutionInput);
      const refreshed = await getTeacherProfile(profile.id);
      setProfile(refreshed.data);
      setSuccessMessage('تم تحديث المؤسسة الحالية بنجاح.');
      setSuccess(true);
      setWorkflow(null);
      setSelectedInstitution(undefined);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 400) {
        setInstitutionFormErrors(Object.fromEntries(Object.entries(error.fields ?? {}).map(([field, messages]) => [field, messages[0] ?? 'قيمة غير صالحة.'])));
        setWorkflowError('تحقق من بيانات المؤسسة المدخلة.');
        setWorkflow('createInstitution' in input ? 'confirm-create' : 'confirm-existing');
      } else if (error instanceof ApiRequestError && error.status === 404) {
        setWorkflowError('الأستاذ أو المؤسسة غير متاح ضمن نطاق الوصول. حدّث البيانات ثم أعد الاختيار.');
      } else if (error instanceof ApiRequestError && error.status === 409) {
        setWorkflowError('تغيّرت المؤسسة الحالية للأستاذ منذ فتح الملف، أو لم تعد المؤسسة المختارة متاحة. حدّث البيانات أو أعد الاختيار ثم حاول مجددًا.');
      } else {
        setWorkflowError('تعذر تحديث المؤسسة الحالية. أعد المحاولة.');
      }
    } finally {
      savingLinkRef.current = false;
      setSavingLink(false);
    }
  }

  function refreshAfterConflict() {
    if (savingLinkRef.current) return;
    setWorkflow(null);
    setSuccess(false);
    setSuccessMessage('');
    setProfileRefreshKey((value) => value + 1);
  }

  const dialogTitle = workflow === 'existing' ? 'اختيار مؤسسة موجودة'
    : workflow === 'create' ? 'إنشاء مؤسسة جديدة'
      : workflow === 'confirm-existing' || workflow === 'confirm-create' ? 'تأكيد اعتماد المؤسسة الحالية'
        : 'اعتماد المؤسسة الحالية';

  return <div className="teacher-profile" dir="rtl">
    <nav aria-label="مسار التنقل"><Link to="/app/submissions">طلبات الأساتذة</Link><span aria-hidden="true"> / </span>ملف الأستاذ</nav>
    <h1>ملف الأستاذ</h1>
    {loading ? <LoadingState label="جارٍ تحميل ملف الأستاذ…" /> : null}
    {!loading && loadError ? <ErrorState title="تعذر عرض ملف الأستاذ" description="الملف غير متاح ضمن نطاق الوصول أو تعذر تحميله." action={<Button variant="secondary" onClick={() => setProfileRefreshKey((value) => value + 1)}>إعادة المحاولة</Button>} /> : null}
    {!loading && profile ? <>
      {successMessage ? <SuccessState title={successMessage} /> : null}
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
        <Card><CardHeader title="جهة العمل المصرح بها — غير معتمدة" description="تصريح تاريخي وارد من الاستمارة، ولا يمثل اعتمادًا لمؤسسة." />
          <CardContent>{profile.declaredWorkplace ? <dl className="teacher-profile__facts">
            <Field label="اسم المؤسسة" value={profile.declaredWorkplace.institutionName} />
            <Field label="بلدية العمل" value={profile.declaredWorkplace.municipality ?? 'غير متاحة'} />
            <Field label="عنوان المؤسسة" value={profile.declaredWorkplace.institutionAddress ?? 'غير متاحة'} />
            <Field label="رقم هاتف مدير المؤسسة" value={profile.declaredWorkplace.directorPhone ?? 'غير متاحة'} />
            {profile.declaredWorkplace.legacyAdditionalInstitutionNames.length ? <Field label="مؤسسات إضافية — تصريح تاريخي" value={profile.declaredWorkplace.legacyAdditionalInstitutionNames.join('، ')} /> : null}
          </dl> : <p>لا توجد بيانات جهة عمل مصرح بها.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader
            title="المؤسسة الحالية المعتمدة"
            description="المؤسسة الحالية سجل مستقل عن جهة العمل المصرح بها."
            action={<Button onClick={startApproval}>{profile.currentInstitution ? 'تغيير المؤسسة الحالية' : 'اعتماد المؤسسة'}</Button>}
          />
          <CardContent>{profile.currentInstitution ? <dl className="teacher-profile__facts">
            <Field label="اسم المؤسسة" value={profile.currentInstitution.name} />
            <Field label="البلدية" value={profile.currentInstitution.municipality} />
            <Field label="عنوان المؤسسة" value={profile.currentInstitution.address} />
            <Field label="هاتف المدير" value={profile.currentInstitution.directorPhone} />
          </dl> : <p className="teacher-profile__unassigned">لم تُعتمد مؤسسة حالية</p>}</CardContent>
        </Card>
      </> : <form onSubmit={(event) => { void saveProfile(event); }} noValidate aria-busy={savingProfile}>
        <h2>تعديل الملف المهني</h2>
        {successMessage && !success ? <p role="alert">{successMessage}</p> : null}
        <div className="teacher-profile__form">
          {editable.map((field) => <div key={field} className="teacher-profile__field">
            {field === 'professionalStatus' ? <div className="ui-field">
              <label className="ui-field__label" htmlFor={`teacher-${field}`}>{labels[field]}</label>
              <select id={`teacher-${field}`} className="ui-input" value={draft?.[field] ?? ''}
                aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `teacher-${field}-error` : undefined}
                onChange={(event) => change(field, event.target.value)} disabled={savingProfile}>
                <option value="">اختر الصفة المهنية</option>
                {(['PERMANENT', 'TRAINEE', 'CONTRACT', 'TEMPORARY_CONTRACT'] as const).map((value) =>
                  <option key={value} value={value}>{statusLabels[value]}</option>)}
              </select>{errors[field] ? <p id={`teacher-${field}-error`} role="alert">{errors[field]}</p> : null}
            </div> : <Input id={`teacher-${field}`} label={labels[field]}
              type={['birthDate', 'employedAt', 'confirmedAt'].includes(field) ? 'date' : field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
              value={draft?.[field] ?? ''} onChange={(event) => change(field, event.target.value)}
              error={errors[field]} required={!nullable.has(field)} disabled={savingProfile} />}
            {nullable.has(field) ? <Button variant="subtle" disabled={savingProfile} onClick={() => clear(field)}
              aria-label={`مسح ${labels[field]}`}>مسح {labels[field]}</Button> : null}
            {cleared.has(field) ? <span role="status">سيُمسح هذا الحقل عند الحفظ.</span> : null}
          </div>)}
        </div>
        <div className="teacher-profile__actions"><Button type="submit" disabled={savingProfile}>{savingProfile ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}</Button>
          <Button variant="secondary" disabled={savingProfile} onClick={() => { setEditing(false); setDraft(undefined); setErrors({}); setSuccessMessage(''); }}>إلغاء</Button>
        </div>
      </form>}
    </> : null}

    <Dialog
      open={workflow !== null}
      title={dialogTitle}
      description={workflow === 'choices' ? 'راجع جهة العمل المصرح بها ثم اختر الإجراء الذي ستعتمده.' : undefined}
      onClose={() => { if (!savingLinkRef.current) setWorkflow(null); }}
      onCancel={handleDialogCancel}
      actions={workflow === 'confirm-existing' || workflow === 'confirm-create' ? <>
        <Button variant="secondary" disabled={savingLink} onClick={() => { setWorkflow(workflow === 'confirm-existing' ? 'existing' : 'create'); setWorkflowError(''); }}>رجوع للمراجعة</Button>
        <Button disabled={savingLink} onClick={() => {
          if (workflow === 'confirm-existing' && selectedInstitution) {
            void confirmInstitution({ institutionId: selectedInstitution.id, expectedInstitutionId: profile?.currentInstitution?.id ?? null });
          } else if (workflow === 'confirm-create' && reviewedInstitution) {
            void confirmInstitution({ createInstitution: reviewedInstitution, expectedInstitutionId: profile?.currentInstitution?.id ?? null });
          }
        }}>{savingLink ? 'جارٍ التأكيد…' : 'تأكيد الاعتماد'}</Button>
      </> : null}
    >
      {workflow === 'choices' ? <div className="teacher-workplace__choice-list">
        <Button variant="secondary" onClick={() => { setWorkflow('existing'); setWorkflowError(''); }}>اختيار مؤسسة موجودة</Button>
        <Button variant="secondary" onClick={() => {
          setInstitutionDraft(institutionPrefill(profile!));
          setInstitutionFormErrors({});
          setWorkflowError('');
          setWorkflow('create');
        }}>إنشاء مؤسسة جديدة</Button>
        <Button variant="subtle" onClick={closeWorkflow}>إلغاء</Button>
      </div> : null}

      {workflow === 'existing' ? <div className="teacher-workplace__selection">
        <form className="teacher-workplace__search" role="search" onSubmit={searchInstitutions}>
          <Input id="current-institution-search" label="البحث عن مؤسسة" value={institutionSearchText}
            onChange={(event) => setInstitutionSearchText(event.currentTarget.value)} />
          <Button type="submit" disabled={institutionListLoading}>بحث</Button>
        </form>
        <p aria-live="polite">إجمالي النتائج في مقاطعة الأستاذ: {institutionListLoading ? '…' : institutionTotal}</p>
        {institutionListLoading ? <LoadingState label="جارٍ تحميل المؤسسات…" /> : null}
        {!institutionListLoading && institutionListError ? <ErrorState title="تعذر تحميل المؤسسات" description="أعد المحاولة أو ارجع إلى خيارات الاعتماد." action={<Button variant="secondary" onClick={() => setInstitutionListRetry((value) => value + 1)}>إعادة المحاولة</Button>} /> : null}
        {!institutionListLoading && !institutionListError && institutions.length === 0 ? <EmptyState title="لا توجد مؤسسات مطابقة" description="جرّب عبارة بحث أخرى أو أنشئ مؤسسة جديدة بعد مراجعة بياناتها." /> : null}
        {!institutionListLoading && !institutionListError && institutions.length > 0 ? <ul className="teacher-workplace__institution-list">
          {institutions.map((institution) => <li key={institution.id}>
            <Button variant="secondary" className="teacher-workplace__institution-option" onClick={() => chooseInstitution(institution)}>
              <span className="teacher-workplace__institution-name">{institution.name}</span>
              <span className="teacher-workplace__institution-detail">{institutionDescription(institution)}</span>
            </Button>
          </li>)}
        </ul> : null}
        <div className="teacher-profile__actions">
          <Button variant="secondary" disabled={pageIndex === 0 || institutionListLoading} onClick={() => setPageIndex((value) => Math.max(0, value - 1))}>السابق</Button>
          <Button variant="secondary" disabled={!nextCursor || institutionListLoading} onClick={() => {
            if (!nextCursor) return;
            setCursorHistory((history) => [...history.slice(0, pageIndex + 1), nextCursor]);
            setPageIndex((value) => value + 1);
          }}>التالي</Button>
          <Button variant="subtle" onClick={() => setWorkflow('choices')}>العودة للخيارات</Button>
        </div>
      </div> : null}

      {workflow === 'confirm-existing' && selectedInstitution ? <div className="teacher-workplace__review">
        <p>سيُربط ملف الأستاذ بالمؤسسة المختارة. بيانات المؤسسة القائمة لن تتغير.</p>
        <dl className="teacher-profile__facts">
          <Field label="اسم المؤسسة" value={selectedInstitution.name} />
          <Field label="البلدية" value={selectedInstitution.municipality} />
          <Field label="العنوان" value={selectedInstitution.address} />
        </dl>
      </div> : null}

      {workflow === 'create' ? <form className="teacher-workplace__create-form" onSubmit={(event) => { void continueCreate(event); }} noValidate>
        <p>راجع القيم واقرأها قبل التأكيد؛ القيم المعبأة اقتراحات من التصريح وليست بيانات معتمدة.</p>
        {workflowError ? <p>{workflowError}</p> : null}
        <Input id="new-institution-name" label="اسم المؤسسة" required value={institutionDraft.name}
          error={institutionFormErrors.name} onChange={(event) => { const name = event.currentTarget.value; setInstitutionDraft((value) => ({ ...value, name })); }} />
        <Input id="new-institution-municipality" label="البلدية" value={institutionDraft.municipality}
          error={institutionFormErrors.municipality} onChange={(event) => { const municipality = event.currentTarget.value; setInstitutionDraft((value) => ({ ...value, municipality })); }} />
        <Input id="new-institution-address" label="عنوان المؤسسة" value={institutionDraft.address}
          error={institutionFormErrors.address} onChange={(event) => { const address = event.currentTarget.value; setInstitutionDraft((value) => ({ ...value, address })); }} />
        <Input id="new-institution-director-phone" label="هاتف المدير" type="tel" dir="ltr" value={institutionDraft.directorPhone}
          hint="رقم ثابت أو محمول جزائري؛ سيُحفظ بالصيغة المعيارية."
          error={institutionFormErrors.directorPhone} onChange={(event) => { const directorPhone = event.currentTarget.value; setInstitutionDraft((value) => ({ ...value, directorPhone })); }} />
        <div className="teacher-profile__actions">
          <Button type="submit">مراجعة القيم والتأكيد</Button>
          <Button variant="secondary" onClick={() => setWorkflow('choices')}>رجوع</Button>
        </div>
      </form> : null}

      {workflow === 'confirm-create' && reviewedInstitution ? <div className="teacher-workplace__review">
        <p>سيُنشأ سجل مؤسسة بالقيم التالية ويرتبط بالأستاذ في عملية واحدة.</p>
        <dl className="teacher-profile__facts">
          <Field label="اسم المؤسسة" value={reviewedInstitution.name} />
          <Field label="البلدية" value={reviewedInstitution.municipality ?? null} />
          <Field label="عنوان المؤسسة" value={reviewedInstitution.address ?? null} />
          <Field label="هاتف المدير" value={reviewedInstitution.directorPhone ?? null} />
        </dl>
      </div> : null}

      {workflowError && (workflow === 'confirm-existing' || workflow === 'confirm-create') ? <div className="teacher-workplace__workflow-error" role="alert">
        <p>{workflowError}</p>
        {workflowError.includes('تغيّرت المؤسسة الحالية') ? <Button variant="secondary" disabled={savingLink} onClick={refreshAfterConflict}>تحديث بيانات الملف</Button> : null}
      </div> : null}
    </Dialog>
  </div>;
}
