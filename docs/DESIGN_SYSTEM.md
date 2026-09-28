# Design System v0.1

Arabic-first/RTL-first وهوية تعليمية مهنية هادئة. هذه قواعد تنفيذ، وليست branding نهائيًا. تُستخدم tokens مركزية ومكونات مشتركة في كل شاشة وفق [UI_MAP](UI_MAP.md). لوحة الألوان النهائية والشعار OPEN في [DECISIONS](DECISIONS.md).

## Tokens

- أدوار اللون: `canvas`, `surface`, `surfaceRaised`, `text`, `textMuted`, `border`, `brand`, `brandOn`, `info`, `success`, `warning`, `danger`, `focusRing` مع نسخ subtle/onColor. يثبت theme واحد عبر CSS custom properties؛ لا hex داخل feature. تحقق تباين WCAG AA للنص والفوكس عند اختيار palette.
- Typography عربية مقروءة بخط محلي أو webfont مرخص مع fallback system؛ أوزان 400/500/600/700. سلم من 0.75، 0.875، 1، 1.125، 1.5، 2rem؛ line-height عربي 1.5–1.8 للنص. العناوين قصيرة ومحددة؛ الأرقام الإحصائية tabular عند الدعم.
- Spacing scale 4/8/12/16/24/32/48px؛ كثافة `comfortable` افتراضية و`compact` للجداول فقط. Radius 6/10/16px بحسب control/card/dialog؛ shadows بدرجتين خفيفتين، الحدود تفصل البيانات قبل الاعتماد على الظل.
- Icon set موحد باتجاه صحيح في RTL؛ الأيقونة مع label للأفعال المهمة. أحجام control/touch target ملائمة، لا رمز وحده في قرار حساس.

## مكونات وحالات

- Shell: sidebar على desktop، navigation مختصر على mobile، breadcrumbs وعنوان/سياق وإجراء رئيسي واحد واضح. بطاقات dashboard تحمل رقمًا وتعريف الفترة وطريقة الوصول للتفاصيل، ولا تجعلها decorative.
- Form: label ظاهر، وصف اختياري، حقل required واضح، تحقق inline وفي summary، حفظ pending يمنع double submit، feedback واضح. الحقول العربية RTL، email/phone/ID ذات اتجاه LTR محلي `dir=auto` أو `dir=ltr` مع ترتيب label عربي. لا تُستخدم placeholder بدل label.
- Data table: sort واضح، فلاتر قابلة للإزالة، نتائج/عدد، pagination server-side، أعمدة قابلة للقراءة، صف قابل للفتح دون تشويش على action buttons. لا virtualization قبل قياس الحاجة. على الهاتف card list أو أعمدة أساسية قابلة للتمرير بسلوك معلن.
- Dialog: عنوان وغرض، focus trap/return، Escape إذا لم يفقد بيانات، تأكيد صريح للأرشفة والقبول/الرفض، لا dialog متداخل. Toast للنجاح غير الحرج؛ error متصل بالمهمة.
- States: skeleton مطابق لشكل المحتوى؛ empty يشرح سبب الفراغ وnext action؛ error يعرض retry وrequestId؛ success يثبت النتيجة؛ disabled له سبب. `hover` يوضح قابلية النقر، `focus-visible` ring ظاهر، `active` feedback سريع، selected لا يعتمد على اللون فقط.
- Motion: انتقالات 120–200ms للأشياء الصغيرة وتوضيح التغيير، بدون حركة decorative؛ `prefers-reduced-motion` يلغي الحركة. لا تُؤخر العمليات لعرض animation.

## Dashboard والبيانات

أولوية الصفحة: pending requests والزيارات القريبة، ثم KPI cards للأساتذة والمؤسسات والتقارير والمتابعة، recent activity وquick actions. تعريف الفترة وسياق المقاطعة ظاهر لكل رقم؛ البيانات الناقصة لا تصبح صفرًا بصمت. charts تستخدم فقط عندما تعرض اتجاهًا/توزيعًا ذا معنى وبديل جدول/نص، مع إمكانية الانتقال للقائمة المفلترة. تنبيهات المتابعة قابلة للتمييز بالأيقونة والنص مع اللون.

## RTL/responsive/accessibility/print

`html lang=ar dir=rtl` من أول صفحة؛ خصائص CSS logical مثل `margin-inline-start`. اختبر الأرقام والتواريخ المختلطة والهواتف وcopy/paste. Desktop بعرض عمل كثيف مناسب لـ180+ ملف؛ tablet يعيد توزيع panels؛ mobile يعرض مسارًا واحدًا وفلاتر قابلة للطي دون تصغير جدول كامل. حد أدنى لوحة مفاتيح كاملة، ترتيب focus منطقي، semantic headings/landmarks، labels وأخطاء مقروءة لقارئ الشاشة، contrast AA، 200% zoom. طباعة A4 من print layout منفصل بترويسة وعنوان ونوع الوثيقة/المصدر وتاريخها، هوامش قابلة للتكرار، page breaks مدروسة، إخفاء navigation والأزرار، والحفاظ على RTL. كل proposal مطبوع موسوم «مقترح المفتش»؛ المرجع الرسمي يحمل provenance محققًا. لا print من شاشة البيانات الحية مباشرة.

أي نمط جديد يبدأ بتحديث هذا العقد ثم المكون المشترك؛ لا theme محلي داخل feature. مراجعة screenshot في desktop/mobile وprint preview جزء من gate المناسب.
