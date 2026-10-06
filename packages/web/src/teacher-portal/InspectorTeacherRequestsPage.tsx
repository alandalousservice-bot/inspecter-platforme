import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, Card, CardContent, Dialog, EmptyState, ErrorState, Input, LoadingState, PageHeader, StatusBadge } from '../ui';
import { portalFetch, professionalLabels, requestLabels, stateLabels, trainingLabels, type PortalRequest } from './client';
import { getValidWorkplaces, type ValidWorkplaceOption } from '../auth/client';
import './portal.css';

const fields: Record<string, string> = { name: 'الاسم', surname: 'اللقب', birthDate: 'تاريخ الميلاد', placeOfBirth: 'مكان الميلاد', professionalStatus: 'الصفة المهنية', employedAt: 'تاريخ التوظيف', confirmedAt: 'تاريخ التثبيت', qualifications: 'المؤهلات المصرح بها', phone: 'الهاتف', email: 'البريد', personalAddress: 'العنوان', status: 'حالة التكوين', note: 'التفصيل', reason: 'السبب', institutionName: 'المؤسسة المصرح بها', municipality: 'البلدية', latitude: 'خط العرض', longitude: 'خط الطول' };
export function InspectorTeacherRequestsPage() {
  const [search, setSearch] = useSearchParams(); const kind = search.get('kind') ?? ''; const teacherId = search.get('teacherId') ?? '';
  const [items, setItems] = useState<PortalRequest[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [status, setStatus] = useState('PENDING');
  const [cursor, setCursor] = useState<string | null>(null); const [nextCursor, setNextCursor] = useState<string | null>(null); const [total, setTotal] = useState(0);
  const [decision, setDecision] = useState<{ item: PortalRequest; action: 'ACCEPT' | 'REJECT' } | null>(null); const [note, setNote] = useState(''); const [saving, setSaving] = useState(false);
  const [resolvedInstitutionId, setResolvedInstitutionId] = useState(''); const [approvedPlaces, setApprovedPlaces] = useState<ValidWorkplaceOption[]>([]); const [placeLoading, setPlaceLoading] = useState(false);
  useEffect(() => { let active = true; setResolvedInstitutionId(''); setApprovedPlaces([]);
    if (decision?.action !== 'ACCEPT' || decision.item.kind !== 'WORKPLACE' || !decision.item.teacher) return;
    setPlaceLoading(true);
    void getValidWorkplaces(decision.item.teacher.id, { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date()) }).then((r) => { if (active) setApprovedPlaces(r.data.items); }).catch(() => { if (active) setError('تعذر تحميل أماكن العمل المعتمدة.'); }).finally(() => { if (active) setPlaceLoading(false); });
    return () => { active = false; };
  }, [decision]);
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const current = ++epoch.current;
    setLoading(true); setError('');
    try { const r = await portalFetch<{ data: PortalRequest[]; page: { nextCursor: string | null; total: number } }>(`/teacher-requests?status=${status}${teacherId ? `&teacherId=${encodeURIComponent(teacherId)}` : ''}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}${cursor ? `&cursor=${cursor}` : ''}`); if (epoch.current !== current) return; setItems(r.data); setTotal(r.page.total); setNextCursor(r.page.nextCursor); }
    catch (e) { if (epoch.current === current) setError(e instanceof Error ? e.message : 'تعذر تحميل الطلبات.'); } finally { if (epoch.current === current) setLoading(false); }
  }, [status, cursor, kind, teacherId]);
  useEffect(() => { void load(); return () => { epoch.current += 1; }; }, [load]);
  async function confirm() {
    if (!decision) return; setSaving(true); setError('');
    try { await portalFetch(`/teacher-requests/${decision.item.id}/decision`, { decision: decision.action, expectedRevision: decision.item.revision, ...(note.trim() ? { note } : {}), ...(decision.action === 'ACCEPT' && decision.item.kind === 'WORKPLACE' ? { resolvedInstitutionId } : {}) }, { inspector: true }); setDecision(null); setNote(''); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تسجيل القرار.'); } finally { setSaving(false); }
  }
  return <section className="portal-requests" dir="rtl"><PageHeader variant="compact" title="طلبات وتحديثات الأساتذة" description="تصريحات الحسابات منفصلة عن طلبات التسجيل الأولية." secondaryActions={<Link to="/app/submissions">التسجيل الأولي</Link>} />
    <label htmlFor="teacher-request-kind-filter">نوع التحديث</label><select id="teacher-request-kind-filter" className="ui-input" value={kind} onChange={(e) => { setSearch({ ...(teacherId ? { teacherId } : {}), ...(e.target.value ? { kind: e.target.value } : {}) }); setCursor(null); }}><option value="">كل الأنواع</option>{Object.entries(requestLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <label htmlFor="teacher-request-status">حالة الطلب</label><select id="teacher-request-status" className="ui-input" value={status} onChange={(e) => { setStatus(e.target.value); setCursor(null); }}>{['PENDING', 'ACCEPTED', 'REJECTED', 'APPROVED_PENDING_DESTINATION'].map((key) => <option key={key} value={key}>{stateLabels[key]}</option>)}</select>
    <p role="status">إجمالي الطلبات: {loading ? '…' : total}</p>{loading ? <LoadingState compact /> : error ? <ErrorState compact title={error} action={<Button onClick={() => { void load(); }}>إعادة المحاولة</Button>} /> : !items.length ? <EmptyState compact title="لا توجد طلبات بهذه الحالة" /> : items.map((item) => {
      const canAccept = ['PROFILE', 'CONTACT', 'TRANSFER', 'LOCATION', 'WORKPLACE'].includes(item.kind) || (item.kind === 'TRAINING' && item.payload.status !== 'COMPLETED');
      return <Card key={item.id}><CardContent><h2><Link to={`/app/teachers/${item.teacher?.id}`}><bdi>{item.teacher?.name} {item.teacher?.surname}</bdi></Link> — {requestLabels[item.kind]}</h2><StatusBadge>{stateLabels[item.status]}</StatusBadge>
        <dl className="portal-facts">{Object.entries(item.payload).filter(([key]) => fields[key]).map(([key, value]) => <div key={key}><dt>{fields[key]}</dt><dd><bdi>{key === 'status' ? trainingLabels[String(value)] : key === 'professionalStatus' ? professionalLabels[String(value)] : String(value)}</bdi></dd></div>)}</dl>
        {item.institutionContext ? <p>المؤسسة: <bdi>{item.institutionContext.name}</bdi>. الموقع المعتمد حاليًا: <bdi dir="ltr">{item.institutionContext.location ? `${item.institutionContext.location.latitude}, ${item.institutionContext.location.longitude}` : 'غير مسجل'}</bdi></p> : null}
        {item.kind === 'WORKPLACE' ? <p>طابق التصريح في <Link to={`/app/teachers/${item.teacher?.id}`}>ملف الأستاذ</Link> واعتمد المؤسسة الأصلية أو التكملة بالإجراء القائم، ثم أكد المؤسسة المطابقة هنا. لا مطابقة أسماء آلية.</p> : null}
        {item.kind === 'TRANSFER' ? <p>المقاطعة المقصودة: <bdi>{item.destinationName ?? 'سياق وجهة غير متاح'}</bdi>. موافقة المصدر لا تُفعّل الانتقال أو تغيّر ملكية الملف.</p> : null}
        {item.status === 'PENDING' ? <div className="portal-actions"><Button disabled={!canAccept} onClick={() => { setDecision({ item, action: 'ACCEPT' }); setNote(''); }}>اعتماد القرار</Button><Button variant="secondary" onClick={() => { setDecision({ item, action: 'REJECT' }); setNote(''); }}>رفض الطلب</Button>{!canAccept ? <p>{item.kind === 'TRAINING' ? 'إتمام التكوين ينتظر سياسة إثبات معتمدة.' : 'استخدم إجراء المؤسسة المعتمد بعد المطابقة؛ لا تحويل آلي للتصريح.'}</p> : null}</div> : null}
        {item.decisionNote ? <p>{item.decisionNote}</p> : null}
      </CardContent></Card>;
    })}
    <div className="portal-actions">{cursor ? <Button variant="secondary" onClick={() => setCursor(null)}>بداية القائمة</Button> : null}<Button variant="secondary" disabled={!nextCursor || loading} onClick={() => setCursor(nextCursor)}>الطلبات التالية</Button></div>
    <Dialog open={Boolean(decision)} title="تأكيد قرار المفتش" onClose={() => { if (!saving) setDecision(null); }} actions={<><Button disabled={decision?.action === 'ACCEPT' && decision.item.kind === 'WORKPLACE' && (!resolvedInstitutionId || placeLoading)} onClick={() => { void confirm(); }} loading={saving}>تأكيد القرار</Button><Button variant="secondary" disabled={saving} onClick={() => setDecision(null)}>إلغاء</Button></>}><p>{decision?.action === 'REJECT' ? 'سيُسجل رفض الطلب مع حفظ التصريح والتاريخ.' : 'سيُسجل اعتماد هذا الطلب ضمن حدوده، دون تعديل تاريخ الزيارات والتقارير.'}</p>{decision?.action === 'ACCEPT' && decision.item.kind === 'LOCATION' ? <p>اعتماد صريح للإحداثيات المعروضة: سيستبدل الموقع المعتمد للمؤسسة دون تعديل أي تقرير أو زيارة تاريخية.</p> : null}{decision?.action === 'ACCEPT' && decision.item.kind === 'WORKPLACE' ? <div className="ui-field"><label htmlFor="request-resolved-place">المؤسسة المطابقة المعتمدة حاليًا</label><select id="request-resolved-place" className="ui-input" value={resolvedInstitutionId} disabled={placeLoading} onChange={(e) => setResolvedInstitutionId(e.target.value)}><option value="">اختر نتيجة المطابقة الصريحة</option>{approvedPlaces.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.role === 'HOME' ? 'أصلية' : 'تكملة نصاب'}</option>)}</select><p>هذا القرار يؤكد المطابقة القائمة فقط؛ لا ينشئ مؤسسة أو إسنادًا.</p></div> : null}<Input id="request-decision-note" label="ملاحظة للطالب — اختيارية" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />{error ? <p role="alert">{error}</p> : null}</Dialog>
  </section>;
}
