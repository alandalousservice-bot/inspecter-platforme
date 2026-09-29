# Decisions v0.1

`ACCEPTED` قرار معماري ضمن صلاحية Architect؛ `PROPOSED` يحتاج مراجعة قبل التنفيذ المؤثر؛ `OPEN` معلومات غير متوفرة؛ `REJECTED` بديل محلل. لا يحول Executor status بنفسه. مصدر المتطلبات [Master V2](../inspector_platform_master_architecture_prompt_v2.md).

| ID | Status | القرار/الخيارات والسبب |
|---|---|---|
| ADR-001 | ACCEPTED | React/Vite + Express modular monolith TypeScript API؛ أبسط فصل للويب وأجهزة مستقبلية مقابل SSR/monolith متشابك |
| ADR-002 | ACCEPTED | PostgreSQL + Prisma؛ علاقات وتاريخ ومعاملات وفهارس واضحة، قابل للنشر على مزودين |
| ADR-003 | ACCEPTED | Teacher كيان مهني بلا login؛ Inspector فقط صاحب جلسة؛ submission لا ينشئ Teacher إلا بقرار transaction |
| ADR-004 | ACCEPTED | قرار G0 التاريخي بإسنادات متعددة مؤرخة؛ يستبدل ADR-029 نموذج العلاقة للمراحل اللاحقة لـG3. يبقى الجدول الأسبوعي منفصلًا |
| ADR-005 | ACCEPTED | جلسات خادمية قابلة للإبطال في cookie مع CSRF/authorization على الخادم؛ تبسيط إبطال الجلسات مقارنة JWT مستقل |
| ADR-006 | ACCEPTED | Official/reference منفصل عن InspectorProposal؛ revisions محفوظة وMemoTemplate ليس Visit/Report |
| ADR-007 | ACCEPTED | طباعة HTML A4 وحفظ PDF من المتصفح في MVP؛ server PDF عند ثبوت حاجة لمخرجات ثابتة/آلية |
| ADR-008 | ACCEPTED | ArenaSPEX مصدر تحليل فقط؛ لا runtime dependency أو نقل تلقائي؛ audit يوجه إعادة البناء |
| ADR-009 | ACCEPTED | Object storage adapter خاص عند الحاجة للملفات؛ لا provider lock-in، ولا رفع عام في MVP بلا متطلبات |
| ADR-010 | PROPOSED | نطاق MVP يشمل محرر المقترحات الأربع وprint؛ يتطلب اعتماد ترتيب/سعة التنفيذ من Product Owner؛ يمكن فصل التوسع بعد foundation |
| ADR-011 | ACCEPTED | مرشحو التشابه للمفتش فقط وفق تطابق الهاتف أو البريد المطبّع أو الاسم الكامل مع تاريخ الميلاد؛ أسباب محددة، دون إثبات هوية أو قرار آلي؛ التفاصيل أدناه |
| ADR-012 | OPEN | نموذج تقرير الزيارة الرسمي: عند وصوله تُحدد الحقول والقالب والتوقيعات؛ الآن skeleton فقط |
| ADR-013 | OPEN | المرجع البيداغوجي الرسمي وحقوق استعماله وإصداره: تحقق مصدر/سلطة كل وثيقة قبل وسمها OFFICIAL |
| ADR-014 | OPEN | سياسة الخصوصية والاحتفاظ والأرشفة والحذف، ومن يرى المقترحات ومتى تُنشر للأساتذة: يقررها Product Owner/الجهة المعنية |
| ADR-015 | ACCEPTED | عقد G3 التاريخي لـPublic Teacher Intake؛ يستبدل ADR-029 شكل مكان العمل للإرسالات الجديدة بعد TASK-041، مع بقاء snapshots القديمة كما أُرسلت |
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
| ADR-026 | ACCEPTED | قرارات TeacherSubmission: مصفوفة انتقالات نهائية في MVP، بلا سبب رفض أو ملاحظة مراجعة، وواجهة القرار لا تُفعّل قبل TASK-034 |
| ADR-027 | ACCEPTED | عقد Teacher عند قبول الطلب: سجل مهني حالي، `recordStatus=ACTIVE` أوليًا، qualifications تُنقل وnotes تبقى في snapshot؛ قرارات submission بلا `Idempotency-Key` في MVP؛ التفاصيل أدناه |
| ADR-028 | ACCEPTED | عقد تحرير ملف Teacher في TASK-035: تصحيح الحقول المهنية الحالية دون مساس بإقرار المصدر أو النطاق/دورة الحياة؛ تدقيق القيم المتغيرة بأسماء الحقول فقط؛ التفاصيل أدناه |
| ADR-029 | ACCEPTED | بعد G3: مؤسسة حالية واحدة معتمدة كحد أقصى لكل Teacher وعلاقة FK مباشرة nullable، وتصريح مكان عمل واحد بأربعة حقول مطلوبة، واعتماد/ربط صريح من المفتش؛ التفاصيل أدناه |
| ADR-030 | ACCEPTED | جدول أسبوعي حالي واحد لكل Teacher وسنة دراسية؛ slots متعددة بلا تداخل، revision للتزامن لا للتاريخ؛ التفاصيل أدناه |

الأمور OPEN لا توقف المهام التي تقتصر على foundations ولا تخمّن ما وراءها. [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md) يحدد gates التي تحتاجها.

### ADR-011 — Potential duplicate candidates for inspector review

المرشح تنبيه احتمالي للمفتش المصرح، وليس إثباتًا لوحدة الهوية. لا يمنع الإرسال العام، ولا يرفض أو يقبل أو يدمج طلبًا، ولا ينشئ Teacher أو توصية آلية أو نسبة ثقة. يبقى المفتش صاحب القرار وفق مهام المراجعة اللاحقة. لا تظهر المرشحات في أي public response.

في TASK-032 يُقارن TeacherSubmission مع **طلبات أخرى** من District الطلب نفسه، ذات الحالة `PENDING` أو `INTERNAL_REVIEW` فقط؛ يُستبعد الطلب الحالي و`REJECTED` و`ACCEPTED` من مصدر الطلبات المرشحة. بعد TASK-034 يكون Teacher التمثيل المعتمد للشخص المقبول، ولا يجوز إظهار TeacherSubmission المقبول وTeacher الناتج كمرشحين منفصلين؛ إدخال Teacher فعليًا في خوارزمية المرشحين مؤجل إلى مهمة ذات عقد قراءة محدد، وليس جزءًا ضمنيًا من TASK-034. يستمر البحث في الطلبات `PENDING/INTERNAL_REVIEW` وحدها حتى ذلك الحين. يلزم التحقق أولًا من جلسة Inspector `ACTIVE` وصلاحية وصوله للطلب عبر نطاق المقاطعة المعتمد؛ لا مطابقة أو كشف عبر المقاطعات. ADR-017 مستقل.

تنتج مرشحة عند تحقق **أي** قاعدة حتمية مستقلة: تطابق الهاتف المخزن بصيغته المعيارية `+213` ← `SAME_PHONE`؛ أو تطابق البريد بعد تنظيفه وفق ADR-015 (النطاق بأحرف صغيرة والجزء المحلي مطابق لما خُزّن دون خفض حالة أحرفه) ← `SAME_EMAIL`؛ أو تطابق `firstName` و`lastName` بعد تطبيع الاسم مع `dateOfBirth` نفسه ← `SAME_NAME_AND_DOB`. قد يحمل المرشح أكثر من سبب. ملكية الهاتف والبريد غير متحققة؛ لا canonicalization خاصة بمزود البريد، ولا إزالة للنقاط أو `+aliases`، ولا مطابقة تقريبية للهاتف.

تطبيع الاسم للمقارنة فقط: Unicode NFC، إزالة الفراغات المحيطة واختزال المتكررة، ومقارنة غير حساسة لحالة الحروف اللاتينية حيث تنطبق. تبقى اختلافات الحروف العربية، والتشكيل، وعلامات الترقيم ذات معنى؛ لا transliteration، ولا طيّ `أ/ا` أو `ة/ه` أو `ى/ي`، ولا Levenshtein أو مطابقة صوتية أو fuzzy/ML/vector. الاسم الأول أو اللقب أو الاسم الكامل دون تاريخ الميلاد، وتاريخ الميلاد أو مكانه وحدهما، والوضعية المهنية، وتاريخ التوظيف، وأسماء المؤسسات، والمؤهلات والملاحظات لا تُنشئ مرشحًا مستقلًا. يجوز عرض مكان الميلاد للمفتش كسياق فقط.

تُحسب المرشحات وقت القراءة، دون جدول أو علاقة أو حقل مرشحين محفوظ أو مهام خلفية أو بنية بحث جديدة. يكفي فهرس TeacherSubmission الحالي `(districtId,status,submittedAt)` للاستعلام المقيد بالمقاطعة والحالة في حجم MVP؛ تُراجع الفهارس عند قياس حاجة فعلية. قائمة الطلبات تعرض مؤشرًا منطقيًا فقط، والتفاصيل تعرض ملخص المرشحين وأسبابهم بحد أدنى من PII وفق [API_CONTRACTS](API_CONTRACTS.md#inspector-submission-reads-and-potential-duplicates-task-032). لا PII في logs أو أخطاء API. لا mutation أو قرار في TASK-032؛ واجهة القرار تخص TASK-033/034.

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

الثوابت المدعومة: `TEACHER_SUBMISSION_ACCEPTED/REJECTED/INTERNAL_REVIEW` (نوع المورد `TeacherSubmission`)، `INSPECTION_REPORT_FINALIZED` (`InspectionReport`)، `FOLLOW_UP_STATE_CHANGED` (`FollowUp`)، و`INSPECTOR_PROPOSAL_CREATED/UPDATED/CLONED/ARCHIVED` (`InspectorProposal`). يضيف [ADR-028](#adr-028--inspector-managed-teacher-profile-editing-task-035) في TASK-035 حدث `TEACHER_PROFILE_UPDATED` (`Teacher`) بتفاصيل مقيدة. وتضيف [ADR-029](#adr-029--one-current-teacher-workplace-after-g3) عند تنفيذ TASK-042 حدثي `INSTITUTION_CREATED/UPDATED` (`Institution`)؛ الإنشاء metadata `{}` والتعديل `{changedFields:[name|municipality|address|directorPhone]}` فقط. ويضيف [ADR-030](#adr-030--weekly-schedule-mvp-contract) عند TASK-048 حدثي `WEEKLY_SCHEDULE_CREATED/UPDATED` (`WeeklySchedule`) بالmetadata المحددة هناك. عمليات submission في TASK-034، وتعديل Teacher في TASK-035، ومؤسسة في TASK-042، والجدول في TASK-048، وreport في TASK-052، وFollowUp عند تنفيذ عقده، وproposal في TASK-063 وما يتبعه هي مستهلكون بحسب مهماتهم. لا يعني توثيق أي ثابت تنفيذ workflow قبل مهمته.

`actorInspectorId` يشير إلى المفتش المنفذ؛ NULL محجوز لفعل آلي موثوق مستقبلًا، وليس هوية عامة مجهولة. لا `actorType` أو تنفيذ public/system workflow الآن. `districtId` سياق مقاطعة المورد وقت الحدث، ويأخذه المستدعي من المورد بعد authorization؛ لا يُختار من عضويات المفتش عند تعددها. يلزم للأحداث ذات المورد المقاطعي ويجوز NULL لحدث مستقبلي بلا مقاطعة. `entityType/entityId` مرجع منطقي متعدد الأنواع بلا FK إلى المورد، كي يبقى تاريخ الحدث عند أرشفته. actor/district علاقات FK بـ`Restrict` عند الحذف و`Cascade` عند تحديث المفتاح.

`metadata` اختيارية ومقيدة بمخطط allowlist لكل حدث؛ before/after لقيم حالة مصرح بها فقط. تُفضّل المعرّفات والحالات، ولا تُنسخ بيانات الاستمارة أو السجل أو جسم الطلب. تُستبعد افتراضيًا الأسماء والبريد والهاتف والعنوان وتاريخ الميلاد. يُمنع حفظ كلمات المرور، رموز الجلسات و`tokenHash`، قيم CSRF، cookies، Authorization headers، API keys، الأسرار، بيانات المصادقة الخام ومحتوى الملفات. قبول TeacherSubmission مستقبلًا يمكنه تسجيل معرّفات الطلب وTeacher الناتج والقرار بلا نسخ بياناته الشخصية.

خدمة append تقبل Prisma transaction client من المستدعي ولا تفتح معاملة مستقلة. عندما يشترط العقد audit، تُنفّذ mutation والـappend معًا؛ فشل append يُرجع العملية كلها. أحداث HTTP تتطلب `requestId` من سياق الطلب، أما الحقل في DB فيقبل NULL لفعل آلي موثوق مستقبلًا. الخدمة لا تعرض update/delete ولا API للتدقيق في TASK-025؛ لا تمنع الكتابة المباشرة بامتيازات DB ولا تفرض trigger/صلاحيات جديدة. لا مدة احتفاظ أو حذف أو أرشفة هنا: **ADR-014 يبقى OPEN**.

### ADR-026 — TeacherSubmission decision workflow

قرار Product Owner المعتمد لقرارات TASK-033/034. قيم الإجراء حصريًا `ACCEPT`, `REJECT`, `INTERNAL_REVIEW`، وتقابل الحالات الناتجة بالاسم نفسه (`ACCEPTED`, `REJECTED`, `INTERNAL_REVIEW`). انتقالات MVP المسموحة هي `PENDING → ACCEPTED | REJECTED | INTERNAL_REVIEW` و`INTERNAL_REVIEW → ACCEPTED | REJECTED`. يمنع `INTERNAL_REVIEW → INTERNAL_REVIEW`، وكل انتقال من `ACCEPTED` أو `REJECTED`؛ الحالتان نهائيتان، بلا إعادة فتح أو رجوع إلى `PENDING` أو حذف/أرشفة بديلًا عن القرار.

`INTERNAL_REVIEW` حالة غير نهائية تعني الحاجة إلى متابعة إضافية من المفتش قبل القبول أو الرفض النهائي. لا تنشئ Teacher ولا تعدل `submittedProfile` ولا تنشئ Institution أو Assignment، ولا تعني تطابق الهوية، ولا تتطلب ملاحظة.

لا يُجمع أو يُحفظ سبب رفض أو ملاحظة مراجعة داخلية في MVP. لا حقول قرار أو workaround في metadata؛ دعم هذه البيانات مستقبلًا يحتاج قرار Product منفصل. الطلب لا يحمل إلا `action` و`expectedStatus`؛ الأخير مطلوب للتحقق من التزامن. الاستجابة الناجحة الدنيا موضحة في [API_CONTRACTS](API_CONTRACTS.md#teacher-submission-decision-task-033034).

عند `ACCEPT` ينشئ TASK-034 سجل Teacher واحدًا، ويحدث حالة الطلب وبيانات القرار و`acceptedTeacherId` ويسجل حدث AuditLog ضمن transaction واحدة؛ لا ينشئ Institution أو Assignment ولا يعني اعتماد التصريحات المؤسسية. `REJECT` يحدث الحالة وبيانات القرار ويسجل AuditLog دون Teacher. `INTERNAL_REVIEW` صالح فقط من `PENDING`، ويحدث الحالة وبيانات الإجراء ويسجل AuditLog دون Teacher أو ملاحظة. `decidedAt` و`decidedByInspectorId` يسجلان آخر إجراء انتقال مسموح، بما فيه الإحالة إلى المراجعة الداخلية؛ ليسا مقصورين على القرار النهائي. `acceptedTeacherId` لا يضبط إلا عند القبول.

تبقى مرشحات ADR-011 استشارية: لا تمنع قبولًا صالحًا ولا تفرض رفضًا أو تحدد الإجراء ولا تدمج سجلات أو تنتج درجة ثقة. لم تُعرض واجهة القرار كعناصر فعالة في مسار المفتش الإنتاجي قبل وجود mutation endpoint في TASK-034. اكتملت مكونات TASK-033 منفصلة، ثم نفذ TASK-034 endpoint ودمجها واجتاز اختبارات التكامل؛ `DECISION_UI_RELEASE_GATE = OPEN`، مع بقاء G3 مستقلًا ومفتوحًا.

### ADR-027 — Teacher persistence and submission decision retries

`TeacherSubmission.submittedProfile` تصريح تاريخي غير متحقق منه، و`Teacher` سجل مهني حالي يديره المفتش بعد `ACCEPT` فقط؛ لا حساب للأستاذ ولا `schoolId` وحيد. في MVP قيم `Teacher.recordStatus` هي `ACTIVE/INACTIVE` فقط: الأولى سجل مهني نشط في مقاطعة المفتش، والثانية سجل محفوظ غير نشط تشغيليًا. ينشئ TASK-034 Teacher بحالة `ACTIVE` ولا ينفذ تغيير الحالة. تختلف هذه الحالة عن `TeacherSubmission.status` وعن `professionalStatus`؛ يبقى `archivedAt` منفصلًا وNULL أوليًا دون workflow أرشفة هنا.

مصدر `Teacher.districtId` هو `TeacherSubmission.districtId` بعد تحقق العضوية الحالية للمفتش، لا body أو اختيار الواجهة أو عضوية اعتباطية. تنقل حقول الملف المهني المعيارية وفق [DATABASE](DATABASE.md#teacher-physical-contract-for-task-034)؛ `qualifications` الاختيارية تُنسخ أو تصبح NULL، و`notes` المعلنة تبقى في snapshot وحده ولا تصبح ملاحظة مؤلفة من المفتش. أسماء المؤسسات المعلنة تبقى في snapshot؛ لا Institution أو Assignment أو مطابقة/اعتماد تلقائي في القبول. أي ملاحظات للمفتش لاحقًا تحتاج عقدًا منفصلًا.

الرابط الوحيد المخزن هو `TeacherSubmission.acceptedTeacherId → Teacher.id`، nullable حتى القبول و`UNIQUE` حيث غير NULL، مع FK يمنع حذف Teacher المرتبط؛ لا `Teacher.sourceSubmissionId`. لا uniqueness على بيانات شخصية؛ ADR-011 استشاري. ينفذ القرار وتحديث الطلب وإنشاء Teacher عند القبول وAuditLog واحد للقرار في transaction واحدة؛ السباق أو الطلب المكرر بعد الانتقال يعيد `409` ولا يترك Teacher أو حدث قرار إضافيًا من المحاولة الخاسرة. `REJECT` و`INTERNAL_REVIEW` لا ينشئان Teacher.

لا يتطلب `POST /submissions/:id/decision` رأس `Idempotency-Key` لأي من `ACCEPT/REJECT/INTERNAL_REVIEW` في MVP، ولا replay لرد النجاح. `expectedStatus` إلزامي؛ تُفرض مصفوفة الانتقالات والتحديث المشروط ذريًا مع القيود والمعاملة، لا UI أو mutex محلي. لا جدول/ذاكرة/سياسة احتفاظ لمفاتيح idempotency. أزال تكامل TASK-034 الرأس من عميل TASK-033 عند `ACCEPT`.

حدث التدقيق الوحيد للقرار يستخدم `TeacherSubmission` وsubmission ID وdistrictId من الطلب وactorInspectorId للمفتش وrequestId للخادم؛ `ACCEPT` metadata `{resultingTeacherId}`، و`REJECT/INTERNAL_REVIEW` metadata `{}`، بلا بيانات شخصية أو جسم الطلب. فشل append يرجع المعاملة. ADR-014 يبقى OPEN ولا يعرقل هذا العقد.

### ADR-028 — Inspector-managed Teacher profile editing (TASK-035)

يصحح المفتش المخوّل حقول الهوية والاتصال والمهنة في سجل Teacher الحالي فقط، مع بقاء `TeacherSubmission.submittedProfile` وقرار القبول والتصريحات الأصلية دون تغيير. الحقول القابلة للتعديل حصريًا: `name`, `surname`, `birthDate`, `placeOfBirth`, `phone`, `email`, `professionalStatus`, `employedAt`, `confirmedAt`, `qualifications`. لا إثبات ملكية هاتف/بريد ولا إثبات هوية آلي، ولا دمج أو منع تحديث بسبب إشارات التشابه في ADR-011. `id`, `districtId`, `recordStatus`, `archivedAt`, timestamps ورابط الطلب المصدر للقراءة فقط؛ لا تحويل مقاطعة أو تغيير حالة/أرشفة عبر PATCH.

يستعمل PATCH حقولًا جزئية صارمة؛ الحقل المحذوف لا يتغير، و`null` يمحو قيمة حقل nullable فقط، والنص الفارغ ليس مرادفًا للمحو ويُرفض. تتحقق صيغ وتواريخ وعلاقات القيم الناتجة بعد دمج التعديل مع السجل الحالي وفق [API_CONTRACTS](API_CONTRACTS.md#teacher-profile-task-035). لا يضيف TASK-035 قيد uniqueness على PII أو محرك تشابه جديد. لا شرط نسخة أو `updatedAt` في MVP؛ الحقول غير المذكورة لا تُستبدل، وعند تحديث الحقل نفسه بالتوازي تسود آخر كتابة ناجحة. لا تُعرض واجهة حفظ متفائل قبل رد الخادم.

يُضاف إلى عقد ADR-025 عند تغيّر ملف Teacher فعليًا حدث `TEACHER_PROFILE_UPDATED` بمورد `Teacher` ومعرّفه، ومقاطعة السجل، والمفتش وrequestId الحاليين؛ metadata حصريًا `{changedFields:[...]}` لأسماء الحقول المتغيرة من allowlist، دون قيم سابقة/جديدة أو PII. التعديل وإضافة التدقيق في transaction واحدة، وفشل التدقيق يرجع التعديل. PATCH صالح بلا تغير فعلي يعيد السجل الحالي دون تحديث timestamp أو حدث تدقيق؛ GET لا يكتب AuditLog.

يعرض GET ملف Teacher الحالي و`recordStatus` كتسمية عربية للقراءة فقط، مع أسماء المؤسسات التي صرّح بها المرسل كسياق intake غير معتمد من الطلب المقبول فقط؛ لا notes أو `submittedProfile` كامل. يضاف `acceptedTeacherId` إلى تفصيل submission المصرح عندما يكون `ACCEPTED` للربط بصفحة الملف، دون تغيير رد قرار TASK-034. لا قائمة/بحث Teacher في TASK-035؛ ذلك ضمن TASK-044/045. لا تنتج واجهات MVP الحالية Teacher مؤرشفًا (`archivedAt` يبدأ NULL ولا mutation له)، لذلك لا يحدد هذا القرار سياسة أرشفة أو احتفاظ؛ أي قواعد أرشفة لاحقة تخضع لـADR-014. لا سلوك خاصًا في GET/PATCH اعتمادًا على `recordStatus` أو `archivedAt` ضمن هذه المهمة، والنطاق تحدده عضوية المقاطعة الحالية.

### ADR-015 — Public Teacher Intake fields and handling

**الغرض والتوجيه:** بوابة أولية لجمع بيانات الأساتذة وابتدائيات المقاطعة. المفتش يوزع رابط المقاطعة؛ `districtId` يؤخذ من `POST /public/districts/:districtId/submissions`، وليس حقلًا يدخله الأستاذ. لا توجيه من IP. كل البيانات غير متحقق منها وتبقى pending حتى مراجعة المفتش. public POST لا ينشئ Teacher أو Institution أو Assignment.

**حقول الأستاذ المطلوبة:** `firstName`, `lastName`, `dateOfBirth`, `placeOfBirth`, `phone`, `email`, `professionalStatus`, `employmentDate`.

**حقول الأستاذ الاختيارية:** `confirmationDate` (مصطلح المشروع المقابل `Teacher.confirmedAt`)، `qualifications`, `notes`. لا يخزن seniority/experience كرقم مشتق إن أمكن اشتقاقه من `employmentDate`. لا weekly workload في TeacherSubmission.

**الوضعية المهنية:** يقبل API حصريًا `PERMANENT` (مرسم)، `TRAINEE` (متربص)، `CONTRACT` (متعاقد)، `TEMPORARY_CONTRACT` (متعاقد مؤقت). القيم ثابتة في التطبيق، وتخزن كنص، لا PostgreSQL enum؛ تعرض الواجهة التسميات العربية لاحقًا. `qualifications` نص اختياري محدود بـ1000 Unicode code points، وليس مصفوفة أو سجل مؤهلات مستقلًا.

**المؤسسات:** `primaryInstitutionName` نص مطلوب (حتى 200 Unicode code points)، و`additionalInstitutionNames` مصفوفة اختيارية من 0..5 نصوص (حتى 200 لكل اسم). تنظف الأسماء من الفراغات الطرفية والمتكررة، وتُرفض الأسماء المتكررة بعد المقارنة المطبعة، بما فيها تكرار الاسم الأساسي. هي تصريحات المرسل وsnapshots فقط، بلا selector أو `institutionId`. لا تُستعلم Institution ولا تُنشأ Institution/Assignment ولا تحويل تلقائي إلى `MAIN/SECONDARY`. المطابقة أو الاعتماد أو الإنشاء قرار لاحق صريح للمفتش؛ لا دمج آلي.

**التحقق:** لا حساب أستاذ، لا OTP، لا رفع وثائق ولا تحقق آلي من الهوية في MVP. يظل الطلب unverified حتى مراجعة المفتش.

**التكرار والتصحيح:** الاشتباه بالتكرار لا يمنع POST ولا يكشف معلومات للمرسل ولا يؤدي إلى merge. candidate workflow للمفتش في TASK-032 وفق ADR-011، والمفتش صاحب القرار. كل POST ينشئ TeacherSubmission مستقلًا؛ لا public edit أو correction token أو update by receipt أو public status lookup. يمكن إعادة الإرسال ويعالج المفتش التكرار لاحقًا.

**الرد والخصوصية:** يرجع POST `202` وreceipt ID فقط؛ لا PII مرسل ولا `PENDING` ولا معلومات تكرار. validation صارم، وحدود إدخال وrate limiting؛ لا PII في application logs/errors ولا personal lookup أو توسيع نطاق المقاطعة من body. public submission creation لا يضيف AuditLog ضمن TASK-030؛ قرارات المفتش اللاحقة تخضع لـTASK-034/ADR-025.

**حدود الأمان العامة:** كل POST طلب مستقل؛ المسار العام مستثنى صراحة من `Idempotency-Key`. حماية MVP هي حد معدل 10 طلبات لكل IP خلال 15 دقيقة، strict validation وحد JSON عام 32KB؛ لا CAPTCHA أو challenge/WAF في TASK-030. محدد المعدل في ذاكرة عملية API واحدة فقط، وتصفير العدّاد عند إعادة التشغيل مقبول في MVP؛ قبل تعدد النسخ يلزم محدد مشترك أو موثوق على الحافة. تفاصيل الإدخال والرد ومصدر الهاتف في [API_CONTRACTS](API_CONTRACTS.md#public-teacher-intake-task-030).

**حدود التنفيذ:** ADR-014 يبقى OPEN دون قرار retention. ADR-011 منفصل لسياسة duplicate candidates. تراجع حدود declared institutions قبل TASK-034/TASK-040؛ لا يتغير scope هاتين المهمتين بهذا القرار.

### ADR-029 — One current Teacher workplace after G3

هذا قرار Product Owner لاحق للـG3 ويَسود على افتراض تعدد المؤسسات وتاريخ انتقالاتها في ADR-004/ADR-015 وما بُني عليهما من خطط مستقبلية. لا يُعيد تفسير snapshots الموجودة ولا يغير نتيجة G3 أو TASK-034/035 المنفذتين. للمفتش علاقة تشغيلية بمؤسسة **حالية واحدة على الأكثر** لكل Teacher؛ قد يكون Teacher بلا مؤسسة معتمدة مؤقتًا بعد `ACCEPT` وحتى موافقة المفتش. لا أدوار `MAIN/SECONDARY`، ولا إسنادات إضافية أو سجل نقل أو تاريخ انتقال أو نصاب أسبوعي داخل علاقة Teacher بالمؤسسة. AuditLog يسجل تغيير الرابط بوصفه حدثًا، لا workflow نقل.

العقد المستقبلي الأبسط هو `Teacher.institutionId` nullable يشير إلى Institution في `Teacher.districtId` نفسها، دون جدول `TeacherInstitutionAssignment`. يضمن FK مركب على `(institutionId,districtId) → Institution(id,districtId)` تطابق المقاطعة في DB؛ يُضاف مفتاح مرجعي مركب مناسب على Institution، وفهرس للرابط عند الحاجة للبحث. يرفض الخادم الربط عبر المقاطعات ويخفي وجود السجلات خارج نطاق المفتش. عند تصحيح المؤسسة الحالية يُستبدل ID الحالي ذريًا بعد تأكيد المفتش؛ لا تُنشأ فترة تاريخية أو سبب نقل أو تاريخ سريان. لا يُعدّل `districtId` عبر هذا المسار؛ ADR-017 باقٍ OPEN.

للمؤسسة حقول حالية `municipality` كنص بلدية حر منظم، و`address` كعنوان بريدي/مكاني مقروء، و`directorPhone` كرقم اتصال مدير المؤسسة. كلها nullable في DB وInstitution API حفاظًا على الصفوف القائمة وعلى إمكانية ترك معلومة غير موثقة فارغة؛ `name` يبقى مطلوبًا. تُطبّق حدود وتطبيع [API_CONTRACTS](API_CONTRACTS.md#post-g3-workplace-contract-adr-029)؛ رقم المدير يقبل الثابت والمحمول الجزائريين وفق قاعدة هاتف الأستاذ نفسها، بلا OTP أو uniqueness أو إثبات ملكية، ويمكن للمفتش مسحه صراحةً بـ`null` في PATCH. لا جدول بلديات وطني ولا geocoding أو خرائط.

بعد TASK-041 يصبح جسم public POST الجديد حاويًا `workplace:{institutionName,municipality,institutionAddress,directorPhone}` بأربعة نصوص مطلوبة لمؤسسة واحدة؛ مفاتيح `primaryInstitutionName` و`additionalInstitutionNames` مرفوضة في **الإرسال الجديد**. المسار والإيصال والحماية والحقول الشخصية الأخرى تبقى وفق ADR-015. تبقى ملفات G3 القديمة بصيغتها الأصلية في `TeacherSubmission.submittedProfile` ولا تُعاد كتابتها؛ قارئ موحد يعرض الاسم القديم ويجعل المعلومات الثلاث الأخرى المفقودة `null`/«غير متاحة»، وتظهر أسماء المؤسسات الإضافية القديمة بوصفها تصريحًا تاريخيًا فقط، لا مؤسسات حالية ولا روابط معتمدة. لا إنشاء أو مطابقة Institution أو Teacher أو رابط أثناء public POST.

`ACCEPT` يستمر بإنشاء Teacher وحده مع `institutionId=NULL` وحفظ التصريح الأصلي؛ لا اعتماد مؤسسة ضمن قرار الطلب. بعد القبول يطّلع المفتش على التصريح، ويختار Institution نشطة قائمة في المقاطعة أو يؤكد إنشاء Institution جديدة من قيم راجعها، ثم يربطها صراحةً. القيم المعلنة لا تكتب فوق مؤسسة مشتركة مختارة؛ تعديل بيانات مؤسسة قائمة إجراء مستقل صريح. الإنشاء والربط وAuditLog المطلوب لها في معاملة واحدة؛ فشل أي جزء يرجع الكل. الاقتراحات بالبحث استشارية، ولا دمج أو مطابقة أو إنشاء آلي، ولا uniqueness على اسم Institution. التحديث المشروط للرابط يمنع الكتابة اعتمادًا على حالة قديمة؛ الرمز `409` عند تعارض الرابط/الأرشفة، و`404` عام عند مورد غائب أو خارج النطاق.

أحداث التنفيذ المستقبلية: `TEACHER_INSTITUTION_LINKED` و`TEACHER_INSTITUTION_CHANGED` بمورد Teacher وmetadata معرّفات المؤسسات فقط؛ `INSTITUTION_CREATED` بمورد Institution عند الإنشاء المؤكد ضمن workflow، و`INSTITUTION_UPDATED` مع أسماء الحقول المتغيرة فقط عند تعديل بياناتها صراحةً. تُضاف للأسماء المسموح بها عند مهمة الـAPI، لا الآن؛ actor/district/requestId من سياق الخادم، والـappend مع mutation في المعاملة نفسها، بلا اسم/عنوان/هاتف أو جسم طلب في metadata. لا حدث لـpublic submission ولا سجل انتقال منفصل.

الجدول الأسبوعي مجال لاحق مستقل عن علاقة المؤسسة. يحدد أيام وساعات العمل ويستعمل المؤسسة الحالية المعتمدة كسياق المكان؛ لا `assignmentId` في WeeklyScheduleSlot، ولا rows للجدول في TASK-040. يحسم ADR-030 شكل الجدول والتداخل. هذه تغييرات **forward-only**؛ لا يُعدّل أي migration سابق، ولا يُحسم ADR-014 أو ADR-017 هنا.

### ADR-030 — Weekly Schedule MVP contract

**الحالة: ACCEPTED — قرار Product Owner قبل TASK-047.** يوجد `WeeklySchedule` حالي واحد على الأكثر لكل `(teacherId, academicYear)`، بلا جدول نسخ أو حالات draft/published أو `validFrom/validTo`. السنة الدراسية إلزامية بصيغة `YYYY-YYYY`؛ السنة الثانية = الأولى + 1. `revision` عدد صحيح موجب يبدأ 1 ويزيد عند تغيير slots، لا يحمل بيانات تاريخية؛ تستخدمه TASK-048 كشرط optimistic concurrency. تعديل المؤسسة الحالية لا يحتفظ بمكان عمل تاريخي في الجدول أو نسخه.

يحوي الجدول عدة `WeeklyScheduleSlot`، بما فيها أكثر من حصة في اليوم نفسه. كل slot: `dayOfWeek` عدد صحيح من 1 الاثنين إلى 7 الأحد؛ `startMinute/endMinute` عددان صحيحان لدقائق الساعة المحلية مع `0 <= startMinute < endMinute <= 1440`؛ `levelLabel`, `groupLabel`, `notes` نصوص nullable/optional. تنظف النصوص بـUnicode NFC وtrim واختزال فراغات العرض المتكررة، وتُرفض محارف التحكم والنصوص الفارغة بعد التنظيف؛ الحدود بعد التنظيف بعدد Unicode code points: `levelLabel` و`groupLabel` حتى 100 لكل منهما، و`notes` حتى 500. لا curriculum FK، ولا timestamp أو timezone لكل slot. لا يتداخل slotان في الجدول واليوم نفسيهما: `A.startMinute < B.endMinute && B.startMinute < A.endMinute`؛ يسمح بالتجاور. يفرض PostgreSQL القيد بـGiST exclusion على `(scheduleId,dayOfWeek,int4range(startMinute,endMinute,'[)'))` مستفيدًا من `btree_gist` الموجود في سلسلة migrations؛ تتحقق TASK-048 أيضًا لخطاء ودية. لا منع عبر يومين مختلفين أو جدولين مختلفين.

لا `institutionId` أو `assignmentId` على slot؛ سياق المكان في العروض التشغيلية من `Teacher.institutionId → currentInstitution` المعتمدة الواحدة. يجوز وجود Teacher بلا مؤسسة وعرضه، لكن TASK-048 تمنع إنشاء الجدول أو تعديله ما دام `institutionId=NULL`. لا مؤسسة متعددة حالية أو تاريخ نقل/نسخ للجدول. العطلات والاستثناءات والإغلاقات والتعويضات والتواريخ المنفردة خارج MVP؛ الجدول نمط أسبوعي متكرر. المنطقة الزمنية التشغيلية `Africa/Algiers` لتحديد اليوم والدقيقة الحاليين، لا عمود timezone في slot. في TASK-044: «يعمل اليوم» يعني slot واحدًا على الأقل في يوم الأسبوع الحالي بهذه المنطقة؛ «يعمل الآن» يضيف `startMinute <= now < endMinute`، دون فحص عطلة.

TASK-047 = persistence فقط: النموذجان والعلاقات والقيود والفهارس وهجرة forward-only واختبارات DB/integration، بلا API/UI/AuditLog. TASK-048 = API ونموذج قراءة وإنشاء/تحرير، تحقق ونطاق وصلاحية المؤسسة وتزامن revision وأخطاء تداخل مفهومة وواجهة عربية RTL واختبار متصل. تدقق mutations داخل transaction بحدثي `WEEKLY_SCHEDULE_CREATED` عند الإنشاء و`WEEKLY_SCHEDULE_UPDATED` عند تغيير slots أو حذف slot؛ `entityType=WeeklySchedule`, `entityId=scheduleId`, `districtId=Teacher.districtId`، actor وrequestId من الطلب. metadata للإنشاء `{}`، وللتحديث `{changedFields:["slots"],affectedSlotIds:[UUID...],slotCount:<integer>}` فقط. لا قيم notes أو level/group أو بيانات Teacher الشخصية أو عنوان/هاتف Institution في audit أو السجلات. لا حذف كامل للجدول في MVP. TASK-044/045 لاحقتان لـ048؛ فلاتر اليوم/الوقت والترقيم على الخادم؛ بلدية دليل Teacher إن أضيف فلترها مستقبلًا تُستمد من `currentInstitution.municipality` ولا تُنسخ إلى Teacher.

## TASK-001 — سجل مراجعة G0

نتيجة مراجعة G0: لم يمنع أي قرار `PROPOSED` أو `OPEN` بدء TASK-010 (Bootstrap فقط). كانت القرارات المؤثرة مؤجلة إلى بوابتها؛ أُغلقت ADR-015 وADR-011 لاحقًا بقرار Product Owner. لا يمنح التأجيل موافقة لقرار آخر، ويتوقف المنفذ عند عقد غير محسوم وفق CODEX_RULES.

| Decision | Owner المطلوب للبت | الحالة الحالية | موعد إعادة العرض / حد التنفيذ |
|---|---|---|---|
| ADR-010 | Product Owner | DEFERRED | قبل اعتماد سعة الجناح البيداغوجي في G6، والطباعة في G7؛ لا يعني التأجيل قبول نطاق MVP المقترح |
| ADR-011 | Product Owner لسياسة عرض المرشحين؛ Architect لقواعد المقارنة | RESOLVED / ACCEPTED | اعتُمدت قواعد حتمية استشارية قبل TASK-032/G3؛ لا دمج أو قرار تلقائي |
| ADR-012 | Product Owner والجهة صاحبة النموذج الرسمي | DEFERRED | قبل تنفيذ حقول/قالب التقرير الرسمي؛ TASK-052/G5 يقتصر على skeleton |
| ADR-013 | الجهة المالكة للمرجع البيداغوجي، عبر Product Owner | DEFERRED | قبل وسم أو إدخال أي محتوى OFFICIAL في TASK-060/G6؛ foundation بلا محتوى موثق ممكنة |
| ADR-014 | Product Owner والجهة المختصة بالخصوصية | DEFERRED | قبل سياسة حذف/احتفاظ الإنتاج في G7، وقبل أي نشر للمقترحات؛ لا مشاركة عامة ضمن المهام الحالية |
| ADR-015 | Product Owner والجهة صاحبة الاستمارة الإدارية | RESOLVED / ACCEPTED | حُسمت الحقول والتحقق والتوجيه والتصحيح وحدود MVP قبل TASK-030/G3؛ لا يغيّر ذلك حالة TASK-030 |
| ADR-016 | Product Owner للهوية البصرية والخط المرخص | DEFERRED | قبل اعتماد branding النهائي؛ TASK-011/G1 يستخدم أدوار tokens فقط دون palette نهائية |
| ADR-017 | Product Owner والجهة الإدارية المالكة للسجلات | DEFERRED | قبل ميزة نقل الأستاذ بين المقاطعات؛ خارج TASK-010 وMVP المحدد حاليًا |
