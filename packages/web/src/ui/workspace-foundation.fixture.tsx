// Test-only composition. Not imported by AppRoutes or any production consumer.
import { Button, EmptyState, ErrorState, FilterBar, Input, LoadingState, PageContainer, PageHeader, RecordList, RecordRow, SecondaryControls, StatusBadge, WorkspaceStack } from './index';

export function WorkspaceFoundationFixture() {
  return <main><PageContainer><WorkspaceStack density="compact">
    <PageHeader variant="compact" title="مساحة عمل مهنية — اختبار الأساس المشترك" description="سياق موجز؛ العنوان وشريط الأدوات والمحتوى دون بطاقات متداخلة."
      primaryAction={<Button>إجراء أساسي</Button>} secondaryActions={<><Button variant="secondary">إجراء ثانوي طويل قابل للالتفاف</Button><Button variant="ghost">عودة</Button></>} />
    <FilterBar variant="workspace" summary={<span>180 نتيجة</span>} activeFilters={<span>مرشح نشط</span>} actions={<Button variant="secondary">إعادة ضبط</Button>}
      secondaryControls={<SecondaryControls label="مرشحات إضافية" activeIndicator={<span>مرشحان نشطان</span>}><Input id="year" label="السنة الدراسية" defaultValue="2026-2027" /></SecondaryControls>}>
      <Input id="search" label="البحث" placeholder="اسم عربي أو بريد إلكتروني" /><Input id="context" label="السياق" />
    </FilterBar>
    <RecordList label="سجلات مضغوطة" density="compact">{[1, 2, 3].map((id) => <RecordRow key={id}
      identity={<a href="#document">أستاذ ذو اسم عربي طويل جدًا لاختبار القراءة المهنية والالتفاف دون قطع {id}</a>}
      context="المؤسسة الحالية — بلدية الاختبار" metadata={<><bdi dir="auto">teacher-{id}@example.invalid</bdi><bdi dir="auto">+213555123456</bdi></>}
      status={<StatusBadge tone="success">نشط</StatusBadge>} temporal={<bdi dir="auto">2026/10/04</bdi>}
      actions={<><Button variant="secondary">عرض السجل</Button><Button variant="ghost">إجراء ثانوي</Button></>} />)}</RecordList>
    <h2>سجل تشغيلي</h2>
    <RecordList label="سجلات تشغيلية"><RecordRow identity="متابعة إجراء مهني واضح"
      context="سياق الأستاذ والمؤسسة دون نسخ بيانات جديدة" metadata="وصف سياقي موجز للمتابعة"
      temporal={<bdi dir="auto">2026/10/05</bdi>} status={<StatusBadge tone="warning">مستحق اليوم</StatusBadge>}
      actions={<><Button>إجراء أساسي</Button><Button variant="secondary">تحرير</Button></>} /></RecordList>
    <h2>حالات المحتوى</h2><LoadingState compact label="جارٍ تحميل السجلات" />
    <EmptyState compact title="لا توجد سجلات بعد" description="حالة خالية وليست خطأ." />
    <EmptyState compact kind="no-results" title="لا توجد نتائج مطابقة" description="يمكن تغيير البحث الحالي." />
    <ErrorState compact title="تعذر تحميل السجلات" description="تحقق من الاتصال ثم أعد المحاولة." action={<Button variant="secondary">إعادة المحاولة</Button>} />
    <section id="document"><WorkspaceStack density="document"><h2>قراءة وثيقة عربية</h2>
      <p>هذا مقطع قراءة طويل ضمن عرض وثيقة مريح. بيانات المهنة والسياق والأفعال يقدمها المستهلك، ولا يملك الأساس المشترك قواعد أعمال أو جلب بيانات أو صلاحيات.</p>
      <p>تظل العربية واضحة مع البريد <bdi dir="auto">reader@example.invalid</bdi> والموعد <bdi dir="auto">2026/10/04</bdi> والهاتف <bdi dir="auto">+213555123456</bdi>.</p>
      <Button variant="secondary">تحرير صريح</Button></WorkspaceStack></section>
  </WorkspaceStack></PageContainer></main>;
}
