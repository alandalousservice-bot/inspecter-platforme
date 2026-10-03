import { useEffect, useRef, useState } from 'react';
import { Button, ErrorState } from '../ui';
import { fieldLabels, type FormValues } from './form-model';
import { DeclarationImportError, MAX_IMPORT_BYTES, parseDeclarationBytes, type DeclarationPreview } from './declaration-import';

export function DeclarationImport({ disabled, onApply }: { disabled: boolean; onApply: (values: Partial<FormValues>) => void }) {
  const [preview, setPreview] = useState<DeclarationPreview>();
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [applied, setApplied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const reader = useRef<FileReader | null>(null);
  const generation = useRef(0);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const clear = () => {
    generation.current++;
    reader.current?.abort(); reader.current = null;
    if (input.current) input.current.value = '';
    setPreview(undefined); setReading(false);
  };
  useEffect(() => () => { generation.current++; reader.current?.abort(); reader.current = null; }, []);
  useEffect(() => { if (preview) previewHeading.current?.focus(); }, [preview]);

  function select(file?: File) {
    clear(); setError(''); setApplied(false);
    if (!file) return;
    if (!/\.json$/iu.test(file.name)) { setError('اختر ملف تصريح بصيغة JSON فقط.'); return; }
    if (file.size > MAX_IMPORT_BYTES) { setError('حجم الملف يتجاوز 32 كيلوبايت.'); return; }
    const current = generation.current; const next = new FileReader(); reader.current = next; setReading(true);
    next.onload = () => {
      if (generation.current !== current) return;
      try {
        if (!(next.result instanceof ArrayBuffer)) throw new DeclarationImportError('تعذر قراءة الملف.');
        setPreview(parseDeclarationBytes(new Uint8Array(next.result)));
      } catch (caught) {
        setError(caught instanceof DeclarationImportError ? caught.message : 'تعذر فحص ملف التصريح.');
      } finally { reader.current = null; setReading(false); }
    };
    next.onerror = () => { if (generation.current === current) { reader.current = null; setReading(false); setError('تعذر قراءة الملف. حاول مجددًا.'); } };
    next.readAsArrayBuffer(file);
  }

  return <section className="public-intake-import" aria-labelledby="import-title">
    <h2 id="import-title">تعبئة الاستمارة من ملف تصريح</h2>
    <p>الملف يساعد على تعبئة التصريح فقط، وتبقى مراجعة البيانات وإرسالها مطلوبة.</p>
    <label htmlFor="declaration-file">اختيار ملف تصريح — JSON، حتى 32 كيلوبايت</label>
    <input id="declaration-file" ref={input} type="file" accept=".json,application/json" disabled={disabled} onChange={(event) => select(event.currentTarget.files?.[0])} />
    {reading ? <p role="status">جارٍ فحص الملف…</p> : null}
    {error ? <ErrorState title="تعذر استيراد التصريح" description={error} /> : null}
    {preview ? <div>
      <h3 tabIndex={-1} ref={previewHeading}>معاينة البيانات المصرح بها</h3>
      <p>هذه معاينة فقط، وليست إرسالًا أو اعتمادًا للبيانات.</p>
      <dl>{Object.entries(preview.values).map(([field, value]) => <div key={field}><dt>{fieldLabels[field]}</dt><dd><bdi dir="auto">{value}</bdi></dd></div>)}</dl>
      {preview.missing.length ? <p role="status">حقول تحتاج استكمالًا: {preview.missing.join('، ')}</p> : <p>الحقول المطلوبة متوفرة.</p>}
      {preview.invalid.length ? <p role="alert">حقول غير صالحة: {preview.invalid.join('، ')}. صحح الملف قبل تطبيقه.</p> : null}
      <p>تطبيق البيانات يستبدل الحقول المطابقة الموجودة في الاستمارة فقط.</p>
      <Button type="button" disabled={disabled || !!preview.invalid.length} onClick={() => { onApply(preview.values); clear(); setApplied(true); }}>تطبيق البيانات على الاستمارة</Button>
      <Button type="button" variant="secondary" onClick={() => { clear(); setError(''); input.current?.focus(); }}>إلغاء المعاينة</Button>
    </div> : null}
    {applied ? <p role="status">تمت تعبئة الحقول المتاحة. راجع الاستمارة وأكمل الحقول المطلوبة ثم اضغط الإرسال بنفسك.</p> : null}
  </section>;
}
