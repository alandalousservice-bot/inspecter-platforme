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
| ADR-021 | ACCEPTED | مدة Session في MVP ثابتة 8 ساعات من `createdAt`؛ `expiresAt = createdAt + 8h`، بلا sliding expiration أو Remember Me، والـcookie لا تتجاوز `expiresAt` |
| ADR-022 | ACCEPTED | حالات Inspector المسموحة للمصادقة `ACTIVE/INACTIVE`؛ ACTIVE فقط ينشئ Session أو يستخدمها، وINACTIVE لا يؤدي إلى bulk revocation ضمن TASK-021 |
| ADR-023 | ACCEPTED | InspectorDistrictMembership تاريخية بفترات `[validFrom, validTo)`؛ يسمح بتكرار Inspector/District تاريخيًا ويمنع تداخل فترتين لهما بقيد DB؛ NULL نهاية مفتوحة، ولا يفرض حصرية District للمفتش |
| ADR-024 | ACCEPTED | Institution `archivedAt = NULL` نشطة وتظهر فقط في القوائم الافتراضية؛ غير NULL مؤرشفة وتستبعد من list/q/count الافتراضي دون حذف السجل أو علاقاته؛ لا فلتر archived أو archive/unarchive ضمن TASK-023 |
| ADR-025 | ACCEPTED | AuditLog سجل تدقيق أعمال/أمن للإضافة فقط؛ أحداث ومحتوى محدودان، append داخل معاملة العملية المدققة؛ الاحتفاظ يبقى ADR-014 OPEN |

الأمور OPEN لا توقف المهام التي تقتصر على foundations ولا تخمّن ما وراءها. [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md) يحدد gates التي تحتاجها.

### ADR-023 — Inspector ↔ District membership policy

القرار المعتمد:

1. `InspectorDistrictMembership` سجل تاريخي مؤرخ، و`validFrom` إلزامي.
2. `validTo = NULL` تعني فترة عضوية مفتوحة حاليًا؛ وعند وجودها لا يجوز أن تسبق `validFrom`.
3. الفترات نصف مفتوحة `[validFrom, validTo)`؛ يسمح بأكثر من سجل تاريخي لنفس Inspector وDistrict إذا لم تتداخل الفترات.
4. يمنع تداخل فترتين للزوج نفسه بقيد قاعدة بيانات، لا بـ`unique(inspectorId, districtId)`؛ وعند انتهاء التكليف يُغلق السجل بـ`validTo` ولا يُحذف.
5. لا يمنع إسناد Inspector إلى Districts متعددة في الفترة نفسها.
6. نقل Teacher بين districts خارج هذا القرار وScope التنفيذ؛ ADR-017 يبقى OPEN.

### ADR-024 — Institution archive list policy

1. `archivedAt = NULL` تعني أن Institution نشطة؛ وأي قيمة غير NULL تعني أنها مؤرشفة.
2. `GET /institutions` يعرض المؤسسات النشطة فقط افتراضيًا؛ المؤسسات المؤرشفة لا تظهر في القائمة أو نتائج `q` الافتراضية ولا تدخل في pagination/count الافتراضي.
3. الأرشفة لا تحذف السجل ولا تزيل تاريخه أو علاقاته.
4. لا يضيف TASK-023 `includeArchived` أو archived filter أو archive/unarchive endpoint أو behavior؛ هذه خارج نطاقه.

### ADR-025 — AuditLog event, payload and append contract

AuditLog سجل أفعال العمل والأمن المُلزم بتدقيقها، وليس application logging أو analytics أو telemetry أو مخزن request tracing. `requestId` رابط تشخيصي فقط. `action` ثابت نصي موثق ومتحقق منه في التطبيق، بلا DB enum أو قيمة حرة من المستدعي. تُعرّف الأحداث المعروفة لقبول/رفض/مراجعة TeacherSubmission، إنهاء InspectionReport، انتقال FollowUp، وعمليات Proposal المطلوبة في TASK-063؛ تعريف الحدث لا ينفذ workflow أو يوجب ربط endpoint قائم ضمن TASK-025. لا يشمل TASK-025 إنشاء Institution أو login/logout أو session revoke أو أي workflow مستقبلي.

الثوابت المدعومة: `TEACHER_SUBMISSION_ACCEPTED/REJECTED/INTERNAL_REVIEW` (نوع المورد `TeacherSubmission`)، `INSPECTION_REPORT_FINALIZED` (`InspectionReport`)، `FOLLOW_UP_STATE_CHANGED` (`FollowUp`)، و`INSPECTOR_PROPOSAL_CREATED/UPDATED/CLONED/ARCHIVED` (`InspectorProposal`). في TASK-025 لا يُربط أي endpoint قائم؛ عمليات submission في TASK-034، report في TASK-052، FollowUp عند تنفيذ عقده، وproposal في TASK-063 وما يتبعه هي مستهلكون مؤجلون وفق عقودهم. لا تعني الثوابت تنفيذًا مسبقًا لهذه المهام.

`actorInspectorId` يشير إلى المفتش المنفذ؛ NULL محجوز لفعل آلي موثوق مستقبلًا، وليس هوية عامة مجهولة. لا `actorType` أو تنفيذ public/system workflow الآن. `districtId` سياق مقاطعة المورد وقت الحدث، ويأخذه المستدعي من المورد بعد authorization؛ لا يُختار من عضويات المفتش عند تعددها. يلزم للأحداث ذات المورد المقاطعي ويجوز NULL لحدث مستقبلي بلا مقاطعة. `entityType/entityId` مرجع منطقي متعدد الأنواع بلا FK إلى المورد، كي يبقى تاريخ الحدث عند أرشفته. actor/district علاقات FK بـ`Restrict` عند الحذف و`Cascade` عند تحديث المفتاح.

`metadata` اختيارية ومقيدة بمخطط allowlist لكل حدث؛ before/after لقيم حالة مصرح بها فقط. تُفضّل المعرّفات والحالات، ولا تُنسخ بيانات الاستمارة أو السجل أو جسم الطلب. تُستبعد افتراضيًا الأسماء والبريد والهاتف والعنوان وتاريخ الميلاد. يُمنع حفظ كلمات المرور، رموز الجلسات و`tokenHash`، قيم CSRF، cookies، Authorization headers، API keys، الأسرار، بيانات المصادقة الخام ومحتوى الملفات. قبول TeacherSubmission مستقبلًا يمكنه تسجيل معرّفات الطلب وTeacher الناتج والقرار بلا نسخ بياناته الشخصية.

خدمة append تقبل Prisma transaction client من المستدعي ولا تفتح معاملة مستقلة. عندما يشترط العقد audit، تُنفّذ mutation والـappend معًا؛ فشل append يُرجع العملية كلها. أحداث HTTP تتطلب `requestId` من سياق الطلب، أما الحقل في DB فيقبل NULL لفعل آلي موثوق مستقبلًا. الخدمة لا تعرض update/delete ولا API للتدقيق في TASK-025؛ لا تمنع الكتابة المباشرة بامتيازات DB ولا تفرض trigger/صلاحيات جديدة. لا مدة احتفاظ أو حذف أو أرشفة هنا: **ADR-014 يبقى OPEN**.

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
