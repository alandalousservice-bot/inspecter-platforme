# Design System — working visual foundation

الاتجاه الحالي هو **«مساحة عمل تفتيش مهنية هادئة»**: أسطح فاتحة دافئة، نص واضح، حدود محايدة ولمسة زرقاء مؤسسية منخفضة التشبع. هذه لوحة عمل قابلة للتغيير عبر tokens، وليست branding أو palette رسمية نهائية. **ADR-016 remains OPEN** لاعتماد الهوية النهائية وأي خط خارجي مرخّص.

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
| `--color-success`, `--color-success-subtle`, `--color-on-success` | نجاح العملية أو الحالة |
| `--color-warning`, `--color-warning-subtle`, `--color-on-warning` | تنبيه يحتاج انتباهًا دون معنى الفشل |
| `--color-danger`, `--color-danger-subtle`, `--color-on-danger` | خطأ أو فعل خطر |
| `--color-info`, `--color-info-subtle`, `--color-on-info` | معلومة مساعدة |
| `--color-focus-ring` | تركيز لوحة المفاتيح |

الألوان الحالية تحقق WCAG AA للنص على السطوح البيضاء/الخلفية الفاتحة، والنص الأبيض على الألوان الصلبة المستخدمة للأزرار والحالات. يعاد فحص التباين عند تغيير القيم. لا تعبّر الحالة باللون وحده؛ تستخدم تسمية أو نصًا أو رمزًا معه. لا تستخدم أسطحًا كبيرة مشبعة أو تدرجات زخرفية.

Aliases التوافق: `--color-canvas`, `--color-surface-raised`, `--color-text`, `--color-brand`, و`--color-brand-on` تشير إلى الأدوار الجديدة مؤقتًا. `--color-info/success/warning/danger/border/focus-ring` أسماء دلالية قائمة وتبقى المصدر نفسه. حدود الحقول والأزرار المحايدة تستخدم `border-strong` لتباين واجهة قابل للرؤية؛ الفواصل الزخرفية تبقى أخف.

## الخط والنص المختلط

Stack محلي بلا تنزيل أو dependency: `"Segoe UI", Tahoma, Arial, sans-serif`. لا ملفات خطوط مجمعة ولا Google Fonts. يظل اختيار خط مرخّص خارجي قرارًا منفصلًا ضمن ADR-016 بعد فحص الترخيص والتسليم والأداء.

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

تتضمن tokens الهندسية `--control-height` (44px)، `--control-height-compact` (40px)، gutters للسطح والجوّال، `--section-gap`, `--card-padding`, كثافة صف الجدول، أقصى عرض للمحتوى، وعرض Sidebar وارتفاع Header المستهدفين. تعريف Sidebar/Header tokens في G6-01 لا يعيد تصميم Layout؛ يستهلكها G6-02. radius للتحكم/البطاقة/الحوار ثلاثة مستويات، وelevation درجتان هادئتان؛ الفصل يعتمد على السطح والحد والمسافة قبل الظل.

## تفاعل وحالات

- تركيز `:focus-visible` حلقة 3px من `--color-focus-ring` مع offset واضح؛ لا يُلغى focus دون بديل.
- hover/focus والحركة القصيرة تستخدم `--motion-short` (150ms) أو `--motion-standard` (200ms). `prefers-reduced-motion` يعطّل التمرير الناعم والحركة حيث يطبقها المكوّن.
- الروابط مميزة بلونها مع underline قابل للقراءة؛ أزرار النماذج ترث الخط؛ الحقول لا تعتمد على placeholder بدل label.
- استخدام `::selection` محدود إلى tint خفيف من اللون الأساسي.
- لا تضاف رسوم خلفية أو حركات على مستوى كل الشاشة ضمن foundation.

## RTL وCSS

استخدم الخصائص المنطقية: `margin/padding/inset/border-inline-*` و`text-align:start`. لا تستخدم `direction` إلا على جذر RTL أو قيمة مختلطة ذات اتجاه معروف. يجب فحص التمرير والـoverflow للنص الطويل قبل إضافة `word-break` عشوائي. الأنماط العامة لا تعيد كتابة CSS الشاشات؛ لكل شاشة مرحلة ترحيلها.

## APP مقابل PRINT

نظام التطبيق يسمح بالسطوح والتفاعل والتركيز. مستند الطباعة مسار مستقل A4، عمودي، حبره اقتصادي ومقروء بتدرج رمادي. CSS الخاص ببطاقة TASK-086 يحتفظ بقياساته وهوامشه وألوانه المحايدة، ولا يرث خلفية التطبيق أو الـShell في `@media print`. أي تغيير tokens أو global CSS يختبر طريق `/app/teachers/:id/information-card/print` قبل الدمج.

## التنفيذ المرحلي

1. G6-01 — tokens، typography، global CSS وRTL/bidi foundation.
2. G6-02 — AppShell وSidebar وTopBar مع المسارات الموجودة.
3. G6-03 — primitives والحالات والحوار والشارات.
4. G6-04 — Page Template وFilterBar والنماذج والجداول.
5. G6-05 — ترحيل صفحات المفتش على دفعات.
6. G6-06 — login والاستمارة العامة.
7. G6-07 — visual/responsive/accessibility/print regression.

هذه تسمية **G6-UI** لمرحلة التصميم، وليست G6 البيداغوجية الموجودة في خطة المرجع والمقترحات. لا Dashboard أو TASK-070 قبل اكتمال بوابة التصميم وموافقة ADR-016 المطلوبة للهوية النهائية.
