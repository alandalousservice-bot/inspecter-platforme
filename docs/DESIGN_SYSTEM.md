# Design System — accepted visual direction / staged implementation

## Explicit product evolution presentation override — 2026-10-05 / ADR-041

The new Product Owner instruction replaces only the previous teacher-directory hybrid-table mandate with **compact professional responsive cards**, and authorizes Teacher portal/Institution workspace. It does not authorize a new palette, font, icon system or decorative theme. Existing ArenaSPEX-family tokens and shared components remain the sole implementation source. Cards paginate25 server-side, keep identity dominant and meaningful status/action hierarchy; no giant card per Teacher or duplicate mobile tree.

Teacher portal is role-isolated, Arabic RTL and responsive, sharing primitives rather than another design system. Approved facts, proposed updates and decision states are visually/textually distinct. Dashboard preserves the accepted strong Hero/attention presentation and uses limited previews/action links, not every directory as a chart. Dossier remains DOCUMENT density; operational request/workplace spaces remain compact.

Weekly board selectively rebuilds ArenaSPEX day-column/session ordering patterns in the existing stack: chronological sessions, time/Institution/level context, recorded duration summary. No fixed reference-source school hours, copied branding/signature, fake official workload or runtime import. Effective versus proposed timetable explicitly labelled. Photo/avatar sizing is consistent, lazy, with safe fallback; private photo styles never change protected document print templates.

All new `portal.css` styles are screen-scoped and use defined token roles only. Required QA:1440/1280/768/390, actual browser200% zoom, no horizontal document overflow, one h1/main, native labels/links, keyboard focus/confirmation, RTL/bidi and reduced motion. No claim of full WCAG conformance from unit tests alone. See [actual evidence](architecture/PRODUCT_EVOLUTION_REPORT.md).

**Current authority: ADR-016 ACCEPTED, G8-VISUAL-A0 (2026-10-04).** الهوية المعتمدة هي **ArenaSPEX-family Professional Inspector Theme**؛ ArenaSPEX مرجع الهوية وUX الأول، Candidate مرجع هندسة النظام الثانوي، والمفتش مرجع المجال والأمن والطباعة. [المواصفة النهائية](G8-VISUAL-A0-REPORT.md) تشمل palette وtokens ومصفوفة الشاشات وبوابات التنفيذ.

**G8-01 foundation status:** semantic screen tokens, Arabic-oriented font stack, spacing/geometry/elevation/focus/motion roles and shared primitive styling are implemented in `packages/web/src/ui/tokens.css`, `shell.css` and `primitives.css`. No approved local Alexandria binary was available in the project, so the screen stack falls back through Tajawal/Noto Sans Arabic/system fonts without a network font dependency. `--font-sans` remains the legacy print stack; TASK-086's independent typography and layout are unchanged. This foundation is not a full screen redesign or a claim of final visual parity.

**G8-03 AppShell status:** the existing Inspector shell now applies the accepted deep-green navigation rail, emerald active state, local shield mark, and light compact TopBar using the existing semantic navigation tokens. The rail/header geometry is 256px/68px; existing routes, session identity/logout, keyboard-accessible collapse, tablet/mobile drawer, public isolation and standalone TASK-086 print route are retained. This is a shell-only presentation change; Dashboard content and business/API behavior are unchanged. Actual browser zoom remains a manual QA item where the execution browser cannot set OS-level page zoom.

الفقرات التالية توثق أساس G6 والعقود المشتركة التي تظل سارية. إشارات ADR-016 OPEN/اللوحة المؤقتة تاريخية، وتتقدم عليها مواصفة G8: Sidebar أخضر عميق، أسطح تشغيل فاتحة، ومدخل/Login أخضر داكن مقيدان بقواعد شاشة مستقلة. يفضل stack الشاشة Alexandria ثم Tajawal/Noto Sans Arabic/system؛ عدم توفر ملف محلي مرخص يعني fallback دون جلب شبكة. PRINT يحتفظ بخطه وهندسته. تُطوّر tokens/shell/primitives القائمة نفسها دون نظام موازٍ.

حالة التنقل الحالية يحددها AppRoutes/AppShell وUI_MAP: `/app` لوحة ADR-037، وليست تحويلًا إلى المؤسسات كما في سجل G6-02 القديم. Landing المستهدفة في G8-02 غير منفذة حاليًا؛ الإعدادات العامة والموارد البيداغوجية غير منفذة ولا تُضاف للقائمة. قيود الفعل/الحقول/الدلالة/الوصول للمكونات أدناه تبقى واجبة؛ يسمح G8 بأسطح brand كبيرة فقط حيث حددها تقريره (Sidebar/hero/public)، دون تعميمها على الطباعة أو البيانات التشغيلية.

عند إغلاق G6 كان اتجاه التنفيذ **«مساحة عمل تفتيش مهنية هادئة»**: أسطح فاتحة محايدة باردة قليلًا، نص واضح، حدود رصينة ولمسة أزرق-أخضر منخفضة التشبع. عمق البطاقات والقشرة خفيف ويستخدم درجتي elevation المركزيتين. هذه هي لوحة الكود الحالية السابقة لاعتماد ADR-016، وتُستبدل تدريجيًا بمواصفة G8 دون تغيير دلالة المكونات.

تُحمّل القواعد العامة من `packages/web/src/ui/tokens.css` ثم `shell.css` و`primitives.css`. الشاشات تستخدم الأدوار الدلالية ولا تعرّف theme محليًا. تبقى أسماء tokens القديمة aliases انتقالية خلال نقل الشاشات، ولا تنشأ منظومة token موازية.

## الألوان الدلالية

مصدر القيم الوحيد هو `:root` في `tokens.css`:

| الدور | الاستخدام |
|---|---|
| `--color-background` | خلفية مساحة التطبيق |
| `--color-surface`, `--color-surface-subtle`, `--color-surface-elevated` | المحتوى، التجميع الهادئ، والحوار/السطح المرتفع |
| `--color-border`, `--color-border-strong` | الفصل العادي والحدود التي تحتاج وضوحًا أعلى |
| `--color-text-primary`, `--color-text-secondary`, `--color-text-muted` | النص الأساسي والسياق والمساعدة |
| `--color-primary`, `--color-primary-hover`, `--color-primary-subtle`, `--color-on-primary` | الفعل الأساسي والروابط والتحديد |
| `--color-primary-active`, `--color-navigation*`, `--color-public-*` | درجات الفعل النشط، تنقل/سطح داكن مستقبلي ضمن صفحات G8، ونصوصه |
| `--color-success`, `--color-success-subtle`, `--color-on-success` | نجاح العملية أو الحالة |
| `--color-warning`, `--color-warning-subtle`, `--color-on-warning` | تنبيه يحتاج انتباهًا دون معنى الفشل |
| `--color-danger`, `--color-danger-subtle`, `--color-on-danger` | خطأ أو فعل خطر |
| `--color-info`, `--color-info-subtle`, `--color-on-info` | معلومة مساعدة |
| `--color-focus-ring` | تركيز لوحة المفاتيح |
| `--color-focus-on-dark` | تركيز متباين على الأسطح الداكنة |

قيم الألوان المحددة في [مواصفة G8-VISUAL-A0](G8-VISUAL-A0-REPORT.md) هي المرجع. اختُبرت نسب النص/الخلفية للأفعال والحالات المختارة عند G8-01؛ حد الحدود غير النصية 3:1، وحد النص 4.5:1. يعاد فحص التباين عند تغيير القيم. لا تعبّر الحالة باللون وحده؛ تستخدم تسمية أو نصًا أو رمزًا معه. استعمال المساحات الداكنة الكبيرة محصور في المواضع التي حددتها المواصفة ومراحل G8 اللاحقة.

Aliases التوافق: `--color-canvas`, `--color-surface-raised`, `--color-text`, `--color-brand`, و`--color-brand-on` تشير إلى الأدوار الجديدة مؤقتًا. `--color-info/success/warning/danger/border/focus-ring` أسماء دلالية قائمة وتبقى المصدر نفسه. حدود الحقول والأزرار المحايدة تستخدم `border-strong` لتباين واجهة قابل للرؤية؛ الفواصل الزخرفية تبقى أخف.

## الخط والنص المختلط

Stack الشاشة الحالي: `Alexandria, Tajawal, "Noto Sans Arabic", system-ui, sans-serif`. لا ملف خط محلي ضمن المستودع، لذا يستخدم المتصفح أول خط متاح ولا تُطلب خدمة خارجية. يظل `--font-sans` هو stack المستندات المطبوعة، ولا تتغير هندسة الطباعة أو خطها في G8-01.

| العنصر | Token / القاعدة |
|---|---|
| نص أساسي | `--font-size-body`، وزن 400، `--line-height-body` |
| مساعدة ووسم | `--font-size-small` / `--font-size-label` |
| عنوان صفحة | `--font-size-page` ووزن 600 و`--line-height-heading` |
| عنوان قسم | `--font-size-section` ووزن 600 |
| عنوان بطاقة | `--font-size-card` ووزن 600 |
| رأس جدول | `--font-size-table-header` ووزن 600 |
| بيانات رقمية | `.numeric-value` مع tabular/lining numerals عند دعم الخط |

يبقى `lang="ar" dir="rtl"` على جذر المستند. لا نفرض اتجاهًا واحدًا على المحتوى الداخلي: البريد والهاتف والمعرّفات والتواريخ المختلطة تستخدم `dir="ltr"` أو `dir="auto"` حسب طبيعة القيمة، ويُفضّل `<bdi>` أو `.bidi-isolate` عند إدراجها في جملة عربية. `.bidi-ltr` يعزل قيمة LTR دون قلب الحاوية المحيطة. تُحفظ الأرقام والتواريخ كما يحدد العقد؛ لا يعاد تنسيق المجال في CSS.

## المسافات والهندسة

سلم المسافة المعتمد هو 4/8/12/16/24/32/48px عبر `--space-1/2/3/4/6/8/12`. لا يوجد `--space-5`؛ نُقلت مستهلكاته إلى 24px (`--space-6`) بدل ترك مرجع غير معرّف أو إدخال خطوة موازية.

تتضمن tokens الهندسية `--control-height` (44px)، `--control-height-compact` (40px)، gutters للسطح والجوّال، `--section-gap`, `--card-padding`, كثافة صف الجدول، أقصى عرض للمحتوى، وعرض Sidebar وارتفاع Header المستهدفين. تعريف Sidebar/Header tokens في G6-01 لا يعيد تصميم Layout؛ يستهلكها G6-02. radius للتحكم/البطاقة/الحوار ثلاثة مستويات، وelevation درجتان هادئتان؛ الفصل يعتمد على السطح والحد والمسافة قبل الظل. البطاقات تستخدم elevation-low افتراضيًا وelevation-high عند hover بلوحة تأشير، مع إلغاء الانتقال الحركي تحت `prefers-reduced-motion`.

## تفاعل وحالات

- تركيز `:focus-visible` حلقة 3px من `--color-focus-ring` مع offset واضح؛ لا يُلغى focus دون بديل.
- hover/focus والحركة القصيرة تستخدم `--motion-short` (150ms) أو `--motion-standard` (200ms). `prefers-reduced-motion` يعطّل التمرير الناعم والحركة حيث يطبقها المكوّن.
- الروابط مميزة بلونها مع underline قابل للقراءة؛ أزرار النماذج ترث الخط؛ الحقول لا تعتمد على placeholder بدل label.
- استخدام `::selection` محدود إلى tint خفيف من اللون الأساسي.
- لا تضاف رسوم خلفية أو حركات على مستوى كل الشاشة ضمن foundation.

## العقود المشتركة للمكونات — G6-03

- `Button` يوفّر `primary` و`secondary` و`danger` و`ghost` بحجم `normal` أو `compact`. الاسم السابق `subtle` alias بصري لـ`ghost` للحفاظ على المستهلكين الحاليين. `loading` يعطّل الزر ويعلن `aria-busy` مع مؤشر زخرفي مخفي عن قارئ الشاشة؛ يظل النص الوصفي ظاهرًا. لا تحوّل الأفعال العادية إلى أزرار ممتلئة أو خطرة.
- `Input` و`Select` و`Textarea` تستخدم عناصر HTML الأصلية داخل تقديم حقل موحد: label مرتبط، علامة نجمة مرئية مع `required` دلالي، مساعدة، ورسالة خطأ مرتبطة عبر `aria-describedby` و`aria-invalid`. لا يستبدل خطأ الحقل نص العقد ولا يضع placeholder محل الاسم. تبقى عناصر select أصلية، والنصوص المختلطة تستخدم `dir="auto"` أو العزل القائم.
- ارتفاع التحكم الطبيعي `--control-height`، والمضغوط 40px. الحدود/الخلفية/النص/التركيز/التعطيل/القراءة فقط/الإبطال تستعمل semantic tokens. textarea قصيرة افتراضيًا، ذات line-height مريح وتغيير ارتفاع رأسي؛ يمكن للسياق رفع الحد الأدنى محليًا دون فرض محرر طويل.
- `Card` سطح افتراضي هادئ بحد ومسافة وظل منخفض؛ hover يرفع حد/ظل البطاقة رفعًا خفيفًا ويوقف الحركة عند طلب تقليلها. تجنب card-on-card كقاعدة. يبقى `CardHeader` للعناوين/الوصف/إجراء مناسب، و`CardContent` للفصل الداخلي. لا تنشأ variants حتى يظهر مستهلك حالي يبرر اختلافًا دلاليًا.
- `StatusBadge` مكوّن عرض فقط يقبل tone من `neutral/info/success/warning/danger` ونصًا محليًا. لا يعرف enums أو يشتق معنى الحالات. كل نطاق يصرّح mapping منفصلًا إلى نص عربي وtone؛ النص والحد والشكل تبقى كافية دون الاعتماد على اللون. لا يستخدم لشبه-pill زخرفي ولا يطال صنفًا مهنيًا لمجرد أنه enum.
- `Dialog` عنصر `<dialog>` أصلي modal بعناوين ووصف مرتبطين. يفتح بـ`showModal`، يبدأ التركيز بأول عنصر صالح أو العنوان، يستعمل الحصر الأصلي للتركيز، وEscape يمر عبر `onCancel` أو `onClose` مع بقاء التحكم للمالك. لا يكسر حماية العمل الجاري؛ يحتفظ بعنصر الفتح ويعيد إليه التركيز عند الإغلاق. للـfooter ترتيب DOM طبيعي ولفّ RTL آمن.
- `LoadingState` حالة محتوى غير محددة المدة ذات `role=status` و`aria-busy`; مؤشر العملية يكون داخل Button. `EmptyState` يطلب عنوانًا/وصفًا اختياريًا/إجراءً، ويميّز `no-data` عن `no-results` عبر `kind` دون فرض رسالة موحدة. `ErrorState` عرض فقط لرسالة عربية آمنة يقدمها المستهلك ويمكنه احتواء إجراء إعادة محاولة. `SuccessState` تأكيد قريب من المحتوى بـ`role=status` لا يختفي تلقائيًا. لا يوجد toast عام.
- Skeleton **مؤجل**: لا يوجد بين شاشات G6-03 شكل تحميل هيكلي ثابت مشترك يبرر إضافة بنية غير مستهلكة؛ يظل loading الحالي واضحًا ويقلل الحركة. لا shimmering.
- الأزرار المسماة تظل نصية؛ زر الأيقونة المنفردة لا يقبل بلا اسم accessible، وحجم هدف وتركيز ظاهرين. تنسيق print منفصل؛ لا تستخدم primitive أو class لتوليد زر/لون/حوار داخل المستند.

اختبارات هذه الطبقة تغطي API المرئي/الدلالي، حالة التعطيل والتحميل، ارتباط label/helper/error، عناصر select/textarea الأصلية، tone والنص، أنواع empty، retry/feedback، تركيز الحوار وEscape/عودة التركيز. فحص المتصفح يكمل اختبارات DOM؛ لا يستبدلها.

## AppShell contract — G6-02

- القشرة تملك معلم `<main id="main-content">` واحدًا ورابط تجاوز للمحتوى. محتوى الصفحات لا يضيف معلم `main` متداخلًا؛ يحتفظ بغلافه وفئاته التخطيطية الداخلية.
- على desktop تكون Sidebar بعرض `--sidebar-width` (256px) قابلة للطي؛ الحالة محلية مؤقتة وتعود موسعة عند إعادة التحميل، ولا تحفظ كتفضيل مستخدم. تظل أسماء الروابط متاحة لقارئ الشاشة، ويظهر tooltip نصي عند hover/focus في الوضع المطوي. سكة التنقل خضراء عميقة والحالة النشطة زمردية مع نص ومؤشر منطقي واضح.
- يعرض التنقل الرئيسي المساحات المنفذة فقط: لوحة المتابعة، المؤسسات، دليل الأساتذة، طلبات الأساتذة، الزيارات، والمتابعات. الروابط تستخدم `aria-current="page"` وتظل مساحة المستوى الأعلى نشطة في المسارات المتداخلة. الهوية المهنية في قسم الحساب المنفصل؛ لا تضاف مساحات بلا route منفذ.
- TopBar بارتفاع `--header-height` (68px) يعرض سياق مساحة العمل وبريد المفتش الموثوق المتاح من Session، وإجراء الخروج القائم. لا يجلب هوية أو بيانات إضافية، ولا يقدم إعدادات/تنبيهات غير موجودة.
- على tablet/mobile تصبح Sidebar drawer من جهة inline-start. زر فتح/إغلاق صريح، خلفية إغلاق، `Escape`، حصر التركيز، إرجاعه إلى زر الفتح، `inert` للمحتوى الخلفي ومنع تمرير الصفحة أثناء الفتح. CSS يراعي `prefers-reduced-motion`.
- الأيقونات SVG محلية صغيرة في `ShellIcon.tsx`، stroke موحد و`currentColor`، بلا مكتبة. الأيقونة الزخرفية مخفية عن شجرة الوصول، والاسم النصي/`aria-label` هو الدلالة.
- MainContent يملك معلم main والإيقاع الرأسي؛ ومن G6-04 يملك PageContainer العرض الأقصى والـgutter الأفقيين. بقية الشاشات تحتفظ مؤقتًا بتنسيقها حتى ترحيلها في G6-05. لا يعاد تنسيق الشاشات في G6-02.
- `/app` يعرض لوحة المتابعة وفق ADR-037. صفحة الدخول والفورم العام خارج AppShell. مسار طباعة بطاقة المعلومات يتجاوز القشرة بعد فحص Session ويعرض معلمًا مستقلًا؛ لا TopBar أو Sidebar في مسار المستند.

## نظام تركيب الصفحات والجداول — G6-04

`AppShell` يوفّر `<main>` وإيقاع الحشو الرأسي فقط. داخله، `PageContainer` (`.ui-page`) هو المالك الوحيد لعرض المحتوى الأقصى (`--content-max-width`) والهوامش الأفقية (`--page-gutter` / `--page-gutter-mobile`) والمسافة بين وحدات الصفحة؛ لا تضف gutter/حدًا أقصى موازيًا على مستوى الشاشة. الغلاف لا يُستخدم في الدخول أو الاستمارة العامة أو مسار الطباعة؛ فرع TASK-086 يظل خارج AppShell وPageContainer وCSS الشاشة.

`PageHeader` ينشئ عنوان `h1` واحدًا موجزًا، ووصفًا/eyebrow اختياريين، وBreadcrumbs اختيارية، ومناطق أفعال. يوضع الفعل الأساسي وحده في `primaryAction`، والروابط/الأفعال الثانوية في `secondaryActions`، والعودة السياقية المبررة في `backAction`. لا تُنشأ أفعال أو صلاحيات جديدة ولا يوضع عنوان الشاشة في TopBar. على الهاتف تلتف مجموعة الأفعال وتظل قابلة للوصول.

`Breadcrumbs` تنشئ `nav` باسم «مسار التنقل» وقائمة مرتبة؛ العنصر الأخير نص ذو `aria-current="page"` وليس رابطًا، ولا تُستخدم إلا للسياق الهرمي المفيد. الروابط موجودة مسبقًا ولا تستحدث مسارات.

`FilterBar` تجمع فقط عناصر البحث/المرشحات الموجودة، وتقبل عنوانًا ووصفًا ومنطقة أفعال حالية مثل reset/apply؛ لا تحدد server/client behavior ولا تضيف معايير أو تحسب عداد نتائج. يمكن تمرير عداد موجود من المستهلك عبر `summary` وفق امتداد G9 أدناه. ترتّب عناصرها في grid يلف على العرض المتوسط ويتكدس طبيعيًا على الهاتف. Labels الأصلية ومفاتيح Enter والتنفيذ الخادمي تبقى مسؤولية الشاشة.

`FormSection` عنوانه الافتراضي `h2` مرتبط دلاليًا بالمقطع، وله وصف/أفعال اختيارية وفاصل هادئ لا بطاقة إلزامية. استخدمه للأقسام الحقيقية في النماذج الطويلة، لا لكل مجموعة صغيرة. `FormGrid` عمودان على الشاشات الأوسع وعمود واحد حتى 48rem؛ `FormGridFull` يمتد بعرض الشبكة للنصوص الطويلة. تبقى قواعد الحقول والـvalidation وارتباطات الأخطاء في المكوّن/العقد الذي يملكها.

`DetailList` عرض قراءة فقط بعناصر `dl/dt/dd`؛ يعزل السلاسل المختلطة داخل `<bdi dir="auto">`، ويعرض القيمة الفارغة «غير متوفر» افتراضيًا. يمكن للمالك تمرير `emptyText` صريحًا لصون عرض قائم مثل الشرطة؛ لا يملأ بيانات أو يحول حقول القراءة إلى عناصر form.

`DataTable` يحافظ على API الأعمدة/الصفوف و`caption` و`scope="col"` وrow actions، ولا يقدم sorting أو تحويلًا عامًا إلى بطاقات. `state` الاختياري ينسق loading/error وempty مع التمييز بين `no-data` و`no-results` وإجراء آمن اختياري؛ ويظل باستطاعة المستهلك إدارة الحالات خارج الجدول كما في الشاشات الحالية. النص/الأرقام المباشرة في الخلية تعزل بـbidi؛ العناصر المركبة مسؤولة عن عزل قيمها. الصفوف بكثافة قرابة 44–52px بحسب المحتوى، مع رأس هادئ، فواصل، hover، وروابط ذات focus ظاهر.

الجدول الكثيف الافتراضي يحافظ على الأعمدة ويستخدم وعاء overflow أفقيًا بتركيز لوحة مفاتيح واسم accessible، وتلميحًا ظاهرًا على tablet/mobile؛ لا يحدث page-level overflow ولا تُخفى الأفعال. يجوز للشاشة لاحقًا اختيار عرض سجل/بطاقة إذا حفظ المعنى، وليس على مستوى `DataTable` العام. عزل قيم البريد/الهاتف/التاريخ/المعرف يستعمل bidi. لا ActionMenu عام: لا يوجد في المستهلك الحالي ازدحام يبرر menu، ويظل مؤجلًا.

`Pagination` عرض موحد لعقد المؤشر/الصفحة الذي يمرره المستهلك: اسم تنقل، السابق/التالي، حدود disabled، ورقم/مدى مع total حين يوفره المصدر. الأزرار دلالية وموسومة بالعربية، واتجاه RTL يجعل السابق على inline-start الطبيعي دون تغيير معنى المؤشر. لا حجم صفحة أو sorting أو تعاقد خلفي جديد.

اعتماد G6-04/G6-05: دليل الأساتذة يستخدم PageHeader وFilterBar وDataTable وPagination مع بقاء بحث `q` والمرشحات وcursor و`page.total` خادمية؛ وملف الأستاذ يستخدم PageHeader/Breadcrumbs/DetailList وFormSection/FormGrid مع إبقاء الحقول والحفظ وسلوك الاعتماد كما هي. اكتمل تطبيق النظام على بقية الشاشات المصادق عليها الموجودة: المؤسسات؛ الطلبات وتفاصيلها؛ بطاقة معلومات الأستاذ في التطبيق؛ محرر الجدول؛ الزيارات (القائمة والإنشاء والتفصيل والتقرير)؛ المتابعات؛ والهوية المهنية. تستعمل القوائم الجدول/المرشحات/الترقيم المشترك حيث يناسبها، وتستخدم صفحات الحقائق DetailList، مع إبقاء النصوص السردية والتفاعلات الخاصة بمجالها دون إنشاء نظام موازٍ. مسار الطباعة المستقل لا يرث قشرة أو أنماط صفحة التطبيق. لم تتغير عقود البيانات أو السلوك. اكتمل G6-06 للدخول والاستمارة العامة، واكتملت بوابة G6-07 الختامية؛ راجع [UI Map](UI_MAP.md) لخريطة المسارات وحدود الطباعة.

## RTL وCSS

### G9-01 — Workspace presentation foundation

بنية تركيب اختيارية: **PageHeader → سياق اختياري → FilterBar → محتوى/حالة → Pagination عند الحاجة**. لا مكوّن ضخم يملك الصفحة أو بياناتها، ولا Card إلزامية للمرشحات أو النتائج. الشاشات الحالية لم تُرحّل في G9-01؛ Dashboard وAppShell والطباعة وعقود البيانات لم تتغير.

- `WorkspaceStack density="compact|operational|document"` مجموعة عرض صغيرة بلا gutter أو landmark أو عنوان. توضع داخل `PageContainer` الحالي؛ لا يُكرر PageContainer داخل القشرة. `compact` يقلل إيقاع المسافات للمسح الكثيف؛ `operational` يترك مساحة للسياق/الموعد/الإجراء؛ `document` يوسع فصل المقاطع ويقيد عرض القراءة إلى `72ch`. لا تغيير typography أو تفضيل كثافة للمستخدم. على الهاتف تتكدس السجلات، مع بقاء الأفعال بحجمها المشترك ودون ارتفاع صف ثابت.
- `PageHeader variant="compact"` عنوان `h1` واحد مع وصف موجز وأفعال اختيارية ملتفة. السلوك الافتراضي القديم محفوظ؛ لا Hero ولا عنوان إضافي داخل TopBar. `primaryAction` للفعل الأساسي، `secondaryActions` للأفعال الثانوية؛ Button ghost للأفعال الأقل بروزًا. لا تتضمن الطبقة معنى الأعمال أو صلاحياتها.
- `FilterBar variant="workspace"` شريط بلا بطاقة، يفصل الأدوات عن المحتوى بخط واحد. `children` لعناصر البحث/المرشحات الحالية؛ `actions` لمسح/تطبيق يوفرهما المستهلك؛ `activeFilters` لإشارة فعالة يوفرها؛ `summary` لعدد موثوق أو سياق يقدمه الخادم/المستهلك؛ `secondaryControls` للكشف الاختياري. لا حساب count أو اشتقاق مرشحات أو جلب أو امتلاك URL/بحث/ترقيم. لا تعامل الخطأ كعدد صفر.
- `SecondaryControls` زر أصلي باسم `label` صريح، `aria-expanded/aria-controls` مع محتوى hidden عند الإغلاق؛ يعمل بـEnter/Space. `activeIndicator` محتوى مستقل من المالك، و`defaultExpanded` للحالة الابتدائية فقط. `hasErrors` يفرض فتح المحتوى ويعطل الإغلاق حتى تُعالج أخطاء المستهلك؛ يجب تمريره عند وجود validation errors. المكوّن مخصص لمرشحات/خيارات ثانوية **اختيارية**، لا للحقول المطلوبة. لا يشتق وجود أخطاء أو مرشحات بنفسه.
- `RecordList label density` قائمة `ul` مسماة تضم `RecordRow` بعناصر `li` غير تفاعلية. مناطق `identity/context/metadata/status/temporal/actions` تقبل ReactNode بلا حقول نطاق. الهوية تتصدر والسياق ثانوي؛ يبقى قرار ترتيب/دلالة الحقول في المستهلك. الرابط الفعلي داخل identity والأزرار داخل actions؛ لا onclick للصف ولا clickable div أو عناصر تفاعلية متداخلة. النصوص المركبة والبريد/الهاتف/التاريخ يعزلها المستهلك بـ`bdi dir="auto"` وفق النظام القائم. لا avatar/initials/PII جديدة.
- اختر `RecordList` لسجلات تشغيلية تُقرأ كهوية→سياق→موعد/حالة→إجراء، أو لعرض هاتف محدد لاحقًا. لا تستبدل به جدول مقارنة أعمدة أو وثيقة طويلة أو نموذجًا. لا ينتج loading/empty/pagination تلقائيًا، ولا يحول الجدول إلى بطاقات. `DataTable` يبقى جدولًا semantic مع caption وscope؛ امتداده الوحيد `captionVisibility="accessible-only"` عند تكرار العنوان المرئي. الافتراضي visible، والاسم يبقى لقارئ الشاشة. لا sorting أو تحويل responsive جديد.
- `LoadingState/EmptyState/ErrorState compact` يقلل الحشو فقط دون تغيير roles/messages/actions. `EmptyState kind="no-data|no-results"` ما زال قرار المستهلك؛ لا استنتاج filtered-empty. الخطأ alert وله retry صريح من المالك، والتحميل status/busy؛ لا تحويل خطأ إلى empty ولا إخفاء البيانات الفاشلة كصفر.

CSS الجديد opt-in داخل `@media screen` في `ui/primitives.css`، يعتمد tokens القائمة ولا يغير print selectors. تتكدس مناطق السجل تحت 48rem؛ تلتف الأفعال والمرشحات وتبقى العربية دون قطع وRTL logical. التركيز والحركة المخفضة يرثان النظام الحالي. ممنوع: card داخل card للهوامش، تكرار Page/List/Results/caption المرئي، بطاقات أساتذة عملاقة، خط صغير لتكثيف البيانات، صفوف clickable div، أو global ActionMenu بلا حاجة.

التحقق: `ui/workspace-foundation.test.tsx` يختبر العقود التركيبية والدلالات والحالات. `node scripts/g9-01-foundation-qa.mjs` يشغّل fixture اختبار فقط على 127.0.0.1:5189؛ ليست route إنتاجية ولا يطلب API/DB. يحفظ screenshots في مجلد مؤقت، ويفحص 1440/1280/768/390 وتكبير Chrome الحقيقي 200% وkeyboard/focus/RTL وأهداف التفاعل والـoverflow. لا يشغل أي انتقال أعمال.

استخدم الخصائص المنطقية: `margin/padding/inset/border-inline-*` و`text-align:start`. لا تستخدم `direction` إلا على جذر RTL أو قيمة مختلطة ذات اتجاه معروف. يجب فحص التمرير والـoverflow للنص الطويل قبل إضافة `word-break` عشوائي. الأنماط العامة لا تعيد كتابة CSS الشاشات؛ لكل شاشة مرحلة ترحيلها.

## APP مقابل PRINT

نظام التطبيق يسمح بالسطوح والتفاعل والتركيز. مستند الطباعة مسار مستقل A4، عمودي، حبره اقتصادي ومقروء بتدرج رمادي. CSS الخاص ببطاقة TASK-086 يحتفظ بقياساته وهوامشه وألوانه المحايدة، ولا يرث خلفية التطبيق أو الـShell في `@media print`. أي تغيير tokens أو global CSS يختبر طريق `/app/teachers/:id/information-card/print` قبل الدمج.

## التنفيذ المرحلي

1. G6-01 — tokens، typography، global CSS وRTL/bidi foundation.
2. G6-02 — AppShell وSidebar وTopBar مع المسارات الموجودة.
3. G6-03 — primitives والحالات والحوار والشارات.
4. G6-04 — Page Template وFilterBar والنماذج والجداول.
5. G6-05 — ترحيل صفحات المفتش المصادق عليها الموجودة (مكتمل).
6. G6-06 — اكتمل نقل login والاستمارة العامة إلى tokens ومكونات G6: السطح العام خارج AppShell، حقول Select/Textarea مشتركة، حالة SuccessState، ورسالة توضح معنى الحقول المطلوبة. لم تتغير عقود المصادقة أو الإرسال والتحقق؛ راجع [UI Map](UI_MAP.md).
7. G6-07 — visual/responsive/accessibility/print regression (**COMPLETED**).

## G6 closure — final QA

G6 is **COMPLETE** for every route implemented at its closure. The final gate verified public/authenticated/print isolation, RTL/Bidi, shared tokens, keyboard focus, responsive widths 1440/768/390 and representative 200% zoom, application state/table/form consistency, and the TASK-086 A4 grayscale-safe print contract. Automated and connected regression gates passed; no code fix or dead-code removal was justified. Intentional exceptions are limited to monochrome literal colors in the independent print document, the neutral responsive drawer scrim, and domain-specific layouts/states that preserve existing meaning. G6 did not approve final branding; the subsequent ADR-016 ACCEPTED / G8-VISUAL-A0 decision now supplies that visual architecture. Dashboard/TASK-070 and reference-content/TASK-060 were outside the G6 visual scope.

هذه تسمية **G6-UI** لمرحلة التصميم، وليست G6 البيداغوجية الموجودة في خطة المرجع والمقترحات. لم تنشئ G6 Dashboard أو تبدأ TASK-070؛ لهما بوابة منتج/عقد مستقلة. G6-07 لم يعتمد Branding؛ الهوية النهائية حُسمت لاحقًا في ADR-016 ACCEPTED دون بدء تنفيذ G8.
