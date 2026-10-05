import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiRequestError, getProfessionalIdentity, putProfessionalIdentity, type ProfessionalIdentity } from './client';
import { Button, DetailList, ErrorState, FormGrid, FormSection, Input, LoadingState, PageHeader, SuccessState, WorkspaceStack } from '../ui';
import './professional-identity.css';

type Draft = { name: string; surname: string };
const empty: Draft = { name: '', surname: '' };

function validate(value: string): string | undefined {
  if (/[\p{Cc}]/u.test(value)) return 'تحقق من الاسم؛ محارف التحكم غير مسموحة.';
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!normalized || Array.from(normalized).length > 100) return 'أدخل قيمة من 1 إلى 100 حرف.';
  return undefined;
}

export function ProfessionalIdentityPage() {
  const [saved, setSaved] = useState<ProfessionalIdentity>();
  const [draft, setDraft] = useState<Draft>(empty);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    void getProfessionalIdentity().then((identity) => {
      if (!active) return;
      setSaved(identity); setDraft({ name: identity.name ?? '', surname: identity.surname ?? '' });
    }).catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const errors = { name: validate(draft.name), surname: validate(draft.surname) };
    setFieldErrors(errors); setSuccess(false); setError(undefined);
    if (errors.name || errors.surname) return;
    submitting.current = true; setSaving(true);
    try {
      const identity = await putProfessionalIdentity(draft);
      setSaved(identity); setDraft({ name: identity.name ?? '', surname: identity.surname ?? '' }); setSuccess(true);
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.fields) {
        setFieldErrors({ name: cause.fields.name?.[0], surname: cause.fields.surname?.[0] });
      }
      setError('تعذر حفظ الهوية المهنية. راجع البيانات وأعد المحاولة.');
    } finally { submitting.current = false; setSaving(false); }
  }

  return <div dir="rtl" className="professional-identity-page">
    <WorkspaceStack density="document">
      <PageHeader variant="compact" title="هويتي المهنية" />
      {loading ? <LoadingState label="جارٍ تحميل الهوية المهنية…" /> : loadError ? <ErrorState description="تعذر تحميل الهوية المهنية. أعد تحميل الصفحة." /> :
        <>
          <div className="professional-identity-context">
            {saved?.name && saved?.surname ? <DetailList items={[{ label: 'الهوية المهنية المحفوظة', value: `${saved.name} ${saved.surname}` }]} /> : null}
            {!saved?.name || !saved?.surname ? <p role="status">لم تكتمل الهوية المهنية بعد.</p> : null}
          </div>
          <form onSubmit={(event) => void submit(event)} noValidate>
            <FormSection title="تحرير الاسم واللقب" description="يُستخدمان في هوية المفتش في التقرير النهائي. لا يُستعمل البريد الإلكتروني اسمًا مهنيًا.">
              <FormGrid>
                <Input id="inspector-name" label="الاسم" required autoComplete="given-name" maxLength={200} value={draft.name} error={fieldErrors.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setSuccess(false); }} />
                <Input id="inspector-surname" label="اللقب" required autoComplete="family-name" maxLength={200} value={draft.surname} error={fieldErrors.surname} onChange={(event) => { setDraft({ ...draft, surname: event.target.value }); setSuccess(false); }} />
              </FormGrid>
            </FormSection>
            {error ? <ErrorState compact description={error} /> : null}
            {success ? <SuccessState title="حُفظت الهوية المهنية." /> : null}
            <div className="professional-identity-actions">
              <Button type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ الهوية المهنية'}</Button>
            </div>
          </form>
        </>}
    </WorkspaceStack>
  </div>;
}
