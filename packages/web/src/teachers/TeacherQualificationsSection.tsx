import { useEffect, useState, type FormEvent } from 'react';
import {
  ApiRequestError, createTeacherQualification, deleteTeacherQualification, listTeacherQualifications,
  patchTeacherQualification, type TeacherQualification, type TeacherQualificationInput,
} from '../auth/client';
import { Button, Card, CardContent, CardHeader, Dialog, EmptyState, ErrorState, Input, LoadingState } from '../ui';

type Draft = { name: string; issuingBody: string; qualificationDate: string };
type Mode = 'CREATE' | 'EDIT' | null;

function normalize(value: string): string { return value.normalize('NFC').trim().replace(/\s+/gu, ' '); }
function textError(value: string, required: boolean): string | undefined {
  const normalized = normalize(value);
  if (!normalized && required) return 'أدخل اسم الشهادة.';
  if (!normalized) return undefined;
  if (/[\p{Cc}]/u.test(value)) return 'لا تستخدم محارف التحكم.';
  if (Array.from(normalized).length > 200) return 'الحد الأقصى 200 حرف.';
  return undefined;
}
function safeFailure(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 404) return 'الأستاذ أو المؤهل غير متاح ضمن نطاق الوصول.';
  return 'تعذر إكمال العملية. أعد المحاولة.';
}

export function TeacherQualificationsSection({ teacherId, legacyQualifications }: { teacherId: string; legacyQualifications: string | null }) {
  const [items, setItems] = useState<TeacherQualification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mode, setMode] = useState<Mode>(null);
  const [selected, setSelected] = useState<TeacherQualification | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeacherQualification | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: '', issuingBody: '', qualificationDate: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(false);
    void listTeacherQualifications(teacherId).then(({ items: result }) => {
      if (active) setItems(result);
    }).catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [teacherId, refreshKey]);

  function openCreate() {
    setSelected(null); setDraft({ name: '', issuingBody: '', qualificationDate: '' }); setErrors({}); setMessage(''); setMode('CREATE');
  }
  function openEdit(item: TeacherQualification) {
    setSelected(item); setDraft({ name: item.name, issuingBody: item.issuingBody ?? '', qualificationDate: item.qualificationDate ?? '' });
    setErrors({}); setMessage(''); setMode('EDIT');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !mode) return;
    const nextErrors: Record<string, string> = {};
    const nameError = textError(draft.name, true); const issuerError = textError(draft.issuingBody, false);
    if (nameError) nextErrors.name = nameError;
    if (issuerError) nextErrors.issuingBody = issuerError;
    if (draft.qualificationDate && !/^\d{4}-\d{2}-\d{2}$/u.test(draft.qualificationDate)) nextErrors.qualificationDate = 'أدخل تاريخًا تقويميًا صحيحًا.';
    else if (draft.qualificationDate) {
      const parsed = new Date(`${draft.qualificationDate}T00:00:00.000Z`);
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== draft.qualificationDate) nextErrors.qualificationDate = 'أدخل تاريخًا تقويميًا صحيحًا.';
    }
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }

    const input: TeacherQualificationInput = { name: normalize(draft.name) };
    if (mode === 'CREATE') {
      if (draft.issuingBody.trim()) input.issuingBody = normalize(draft.issuingBody);
      if (draft.qualificationDate) input.qualificationDate = draft.qualificationDate;
    } else {
      input.issuingBody = draft.issuingBody.trim() ? normalize(draft.issuingBody) : null;
      input.qualificationDate = draft.qualificationDate || null;
    }
    setBusy(true); setErrors({}); setMessage('');
    try {
      if (mode === 'CREATE') await createTeacherQualification(teacherId, input);
      else if (selected) await patchTeacherQualification(teacherId, selected.id, input);
      setMode(null); setMessage(mode === 'CREATE' ? 'تمت إضافة المؤهل.' : 'تم تحديث المؤهل.'); setRefreshKey((value) => value + 1);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 400) {
        setErrors(Object.fromEntries(Object.entries(error.fields ?? {}).map(([key, values]) => [key, values[0] ?? 'قيمة غير صالحة.'])));
        setMessage('تحقق من البيانات المدخلة.');
      } else setMessage(safeFailure(error));
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!removeTarget || busy) return;
    setBusy(true); setMessage('');
    try {
      await deleteTeacherQualification(teacherId, removeTarget.id);
      setRemoveTarget(null); setMessage('تم حذف المؤهل.'); setRefreshKey((value) => value + 1);
    } catch (error) { setMessage(safeFailure(error)); }
    finally { setBusy(false); }
  }

  return <>
    <Card>
      <CardHeader title="المؤهلات والشهادات" action={<Button onClick={openCreate}>إضافة مؤهل</Button>} />
      <CardContent>
        {message ? <p role="status" aria-live="polite">{message}</p> : null}
        {loading ? <LoadingState label="جارٍ تحميل المؤهلات المنظمة…" /> : null}
        {!loading && loadError ? <ErrorState title="تعذر تحميل المؤهلات" description="المؤهلات غير متاحة ضمن نطاق الوصول أو تعذر تحميلها." action={<Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>إعادة المحاولة</Button>} /> : null}
        {!loading && !loadError && items.length === 0 ? <EmptyState title="لم تُسجَّل مؤهلات منظَّمة بعد" description={legacyQualifications?.trim() ? 'توجد معلومات مؤهلات سابقة في الحقل النصي المنفصل.' : 'يمكن إضافة الشهادات المتاحة يدويًا.'} /> : null}
        {!loading && !loadError && items.length > 0 ? <ul className="teacher-qualifications__list">
          {items.map((item) => <li key={item.id} className="teacher-qualifications__item">
            <div className="teacher-qualifications__details">
              <h3>{item.name}</h3>
              {item.issuingBody ? <p><span>مصدر الشهادة:</span> {item.issuingBody}</p> : null}
              {item.qualificationDate ? <p><span>تاريخها:</span> <time dateTime={item.qualificationDate}>{item.qualificationDate}</time></p> : null}
            </div>
            <div className="teacher-profile__actions">
              <Button variant="secondary" aria-label={`تعديل ${item.name}`} onClick={() => openEdit(item)}>تعديل</Button>
              <Button variant="danger" aria-label={`حذف ${item.name}`} onClick={() => { setMessage(''); setRemoveTarget(item); }}>حذف</Button>
            </div>
          </li>)}
        </ul> : null}
      </CardContent>
    </Card>

    <Dialog open={mode !== null} title={mode === 'EDIT' ? 'تعديل المؤهل' : 'إضافة مؤهل'} onClose={() => { if (!busy) setMode(null); }}
      onCancel={(event) => { if (busy) event.preventDefault(); else setMode(null); }}
      actions={<><Button variant="secondary" disabled={busy} onClick={() => setMode(null)}>إلغاء</Button><Button type="submit" form="teacher-qualification-form" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ المؤهل'}</Button></>}>
      <form id="teacher-qualification-form" className="teacher-qualifications__form" onSubmit={(event) => { void save(event); }} noValidate aria-busy={busy}>
        <Input id="qualification-name" label="الشهادة" required maxLength={400} value={draft.name} error={errors.name} onChange={(event) => { const name = event.currentTarget.value; setDraft((current) => ({ ...current, name })); }} />
        <Input id="qualification-issuer" label="مصدرها" maxLength={400} value={draft.issuingBody} error={errors.issuingBody} onChange={(event) => { const issuingBody = event.currentTarget.value; setDraft((current) => ({ ...current, issuingBody })); }} />
        <Input id="qualification-date" label="تاريخها" type="date" value={draft.qualificationDate} error={errors.qualificationDate} onChange={(event) => { const qualificationDate = event.currentTarget.value; setDraft((current) => ({ ...current, qualificationDate })); }} />
      </form>
    </Dialog>

    <Dialog open={removeTarget !== null} title="حذف المؤهل" description="سيُحذف هذا السجل المنظم. لن يتغير نص المؤهلات السابقة." onClose={() => { if (!busy) setRemoveTarget(null); }}
      onCancel={(event) => { if (busy) event.preventDefault(); else setRemoveTarget(null); }}
      actions={<><Button variant="secondary" disabled={busy} onClick={() => setRemoveTarget(null)}>إلغاء</Button><Button variant="danger" disabled={busy} onClick={() => { void remove(); }}>{busy ? 'جارٍ الحذف…' : 'تأكيد الحذف'}</Button></>}>
      <p>{removeTarget?.name}</p>
    </Dialog>
  </>;
}
