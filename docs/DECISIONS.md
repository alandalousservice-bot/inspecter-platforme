# Decisions v0.1

`ACCEPTED` قرار معماري ضمن صلاحية Architect؛ `PROPOSED` يحتاج مراجعة قبل التنفيذ المؤثر؛ `OPEN` معلومات غير متوفرة؛ `REJECTED` بديل محلل. لا يحول Executor status بنفسه. مصدر المتطلبات [Master V2](../inspector_platform_master_architecture_prompt_v2.md).

| ID | Status | القرار/الخيارات والسبب |
|---|---|---|
| ADR-001 | ACCEPTED | React/Vite + Express modular monolith TypeScript API؛ أبسط فصل للويب وأجهزة مستقبلية مقابل SSR/monolith متشابك |
| ADR-002 | ACCEPTED | PostgreSQL + Prisma؛ علاقات وتاريخ ومعاملات وفهارس واضحة، قابل للنشر على مزودين |
| ADR-003 | ACCEPTED | Teacher كيان مهني بلا login؛ Inspector فقط صاحب جلسة؛ submission لا ينشئ Teacher إلا بقرار transaction |
| ADR-004 | ACCEPTED | إسنادات Teacher↔Institution مستقلة زمنيا، جدول أسبوعي structured؛ لا schoolId وحيد ولا PDF مصدر بيانات |
| ADR-005 | ACCEPTED | جلسات خادمية قابلة للإبطال في cookie مع CSRF/authorization على الخادم؛ تبسيط إبطال الجلسات مقارنة JWT مستقل |
| ADR-006 | ACCEPTED | Official/reference منفصل عن InspectorProposal؛ revisions محفوظة وMemoTemplate ليس Visit/Report |
| ADR-007 | ACCEPTED | طباعة HTML A4 وحفظ PDF من المتصفح في MVP؛ server PDF عند ثبوت حاجة لمخرجات ثابتة/آلية |
| ADR-008 | ACCEPTED | ArenaSPEX مصدر تحليل فقط؛ لا runtime dependency أو نقل تلقائي؛ audit يوجه إعادة البناء |
| ADR-009 | ACCEPTED | Object storage adapter خاص عند الحاجة للملفات؛ لا provider lock-in، ولا رفع عام في MVP بلا متطلبات |
| ADR-010 | PROPOSED | نطاق MVP يشمل محرر المقترحات الأربع وprint؛ يتطلب اعتماد ترتيب/سعة التنفيذ من Product Owner؛ يمكن فصل التوسع بعد foundation |
| ADR-011 | PROPOSED | عرض Duplicate Candidates للمفتش اعتمادًا على تطبيع الاسم/الهاتف وتاريخ الميلاد دون merge؛ عتبات المطابقة تحتاج تجربة ببيانات وهمية |
| ADR-012 | OPEN | نموذج تقرير الزيارة الرسمي: عند وصوله تُحدد الحقول والقالب والتوقيعات؛ الآن skeleton فقط |
| ADR-013 | OPEN | المرجع البيداغوجي الرسمي وحقوق استعماله وإصداره: تحقق مصدر/سلطة كل وثيقة قبل وسمها OFFICIAL |
| ADR-014 | OPEN | سياسة الخصوصية والاحتفاظ والأرشفة والحذف، ومن يرى المقترحات ومتى تُنشر للأساتذة: يقررها Product Owner/الجهة المعنية |
| ADR-015 | OPEN | حقول الاستمارة العامة الإلزامية والتحقق من الهوية، ومعالجة الطلبات المكررة عند التصحيح: يلزم نموذج إداري معتمد |
| ADR-016 | OPEN | branding/palette النهائية والخط المرخص؛ tokens والأدوار مقررة، القيم لا تُختار اعتباطيًا |
| ADR-017 | OPEN | سياسة نقل أستاذ بين المقاطعات وتاريخ ملكية السجلات متعددة المفتشين؛ يُحسم قبل تنفيذ النقل |
| ADR-018 | REJECTED | نسخ teacher-as-user وteacher.schoolId الوحيد من ArenaSPEX؛ يخالف Master ويكسر التاريخ والصلاحيات |
| ADR-019 | REJECTED | بناء Windows/Mobile/offline sync في MVP؛ كلفة ومخاطر قبل ثبات API |
| ADR-020 | REJECTED | استيراد مواد ArenaSPEX باعتبارها «رسمية» دون provenance مستقل؛ خطر دقة وحقوق |

الأمور OPEN لا توقف المهام التي تقتصر على foundations ولا تخمّن ما وراءها. [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md) يحدد gates التي تحتاجها.

## TASK-001 — سجل مراجعة G0

نتيجة المراجعة المعتمدة: لا يمنع أي قرار `PROPOSED` أو `OPEN` بدء TASK-010 (Bootstrap فقط). الإجراء لكل قرار أدناه هو **DEFERRED**، وليس موافقة على مضمونه أو تغييرًا لحالته. يُعاد عرضه على مالكه قبل المهمة/البوابة المذكورة؛ إذا احتاج التنفيذ عقدًا غير محسوم، يتوقف المنفذ وفق CODEX_RULES.

| Decision | Owner المطلوب للبت | نتيجة G0 | موعد إعادة العرض / حد التنفيذ |
|---|---|---|---|
| ADR-010 | Product Owner | DEFERRED | قبل اعتماد سعة الجناح البيداغوجي في G6، والطباعة في G7؛ لا يعني التأجيل قبول نطاق MVP المقترح |
| ADR-011 | Product Owner لسياسة عرض المرشحين؛ Architect لتجربة العتبات | DEFERRED | قبل TASK-032/G3؛ لا اختيار عتبة أو دمج تلقائي الآن |
| ADR-012 | Product Owner والجهة صاحبة النموذج الرسمي | DEFERRED | قبل تنفيذ حقول/قالب التقرير الرسمي؛ TASK-052/G5 يقتصر على skeleton |
| ADR-013 | الجهة المالكة للمرجع البيداغوجي، عبر Product Owner | DEFERRED | قبل وسم أو إدخال أي محتوى OFFICIAL في TASK-060/G6؛ foundation بلا محتوى موثق ممكنة |
| ADR-014 | Product Owner والجهة المختصة بالخصوصية | DEFERRED | قبل سياسة حذف/احتفاظ الإنتاج في G7، وقبل أي نشر للمقترحات؛ لا مشاركة عامة ضمن المهام الحالية |
| ADR-015 | Product Owner والجهة صاحبة الاستمارة الإدارية | DEFERRED | قبل TASK-030/G3 لتحديد الحقول المطلوبة والتحقق والتصحيح |
| ADR-016 | Product Owner للهوية البصرية والخط المرخص | DEFERRED | قبل اعتماد branding النهائي؛ TASK-011/G1 يستخدم أدوار tokens فقط دون palette نهائية |
| ADR-017 | Product Owner والجهة الإدارية المالكة للسجلات | DEFERRED | قبل ميزة نقل الأستاذ بين المقاطعات؛ خارج TASK-010 وMVP المحدد حاليًا |
