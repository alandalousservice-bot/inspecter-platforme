# API Contracts v0.1

HTTP JSON `/api/v1`. هذه عقود الموارد والسلوك؛ schemas التفصيلية تتبع حقول [DATABASE](DATABASE.md)، ولا يجوز للمنفذ اختراع حقول بيداغوجية رسمية. كل request/response متحقق بـZod؛ unknown input rejected أو stripped وفق schema منشور، لا mass assignment. `Id` UUID، تواريخ ISO 8601 UTC؛ `dayOfWeek` للجدول الأسبوعي 1 الاثنين .. 7 الأحد وفق `Africa/Algiers`. الحقول الناقصة في API تُعالج بإصدار contract موثق، لا بافتراض صامت.

## غلاف واستعمال مشترك

نجاح القراءة: `{data, page?: {limit,nextCursor,total?}}`. خطأ: `{error:{code,message,fields?,requestId}}` بلا بيانات شخصية في الرسائل العامة. القائمة `limit` افتراضي 25 وأقصى 100، cursor ثابت وsort allowlist، query `q` مطبّع محدود الطول. رموز: 400 validation، 401 unauthenticated، 403 forbidden، 404 not found within authorized scope (لا يكشف cross-district)، 409 state conflict، 429 rate limit، 500 generic. جميع mutations المسجلة تحمل requestId. لا يتطلب مسار قرار submission `Idempotency-Key` لأي إجراء في MVP وفق ADR-027؛ ولا يتطلبه public submission حيث كل POST عام ينشئ سجلًا مستقلًا وفق ADR-015. لا يقرر هذا استرجاع نتائج لعمليات مستقبلية.

عند تدقيق HTTP mutation لاحقًا، تمرر خدمة المورد `requestId` الذي يولده الخادم إلى append service داخل Prisma transaction نفسها؛ لا يُقبل من جسم الطلب أو header عميل. NULL في حقل DB محجوز لفعل آلي موثوق مستقبلًا. TASK-025 يؤسس التخزين والخدمة فقط ولا يضيف endpoint؛ `/audit-events` GET عقد لاحق منفصل. انظر [ADR-025](DECISIONS.md#adr-025--auditlog-event-payload-and-append-contract).

جلسة المفتش في cookie آمنة `HttpOnly`, و`Secure` في production، و`SameSite=Strict`. يقبل `POST /auth/login` جسم `{email,password}`؛ الحساب `ACTIVE` فقط يستطيع الدخول. تنشأ Session ثابتة لمدة 8 ساعات من `createdAt` (`expiresAt = createdAt + 8h`) دون sliding expiration أو Remember Me، وعمر cookie لا يتجاوز `expiresAt`. يخزن الخادم hashًا لرمز الجلسة مع `tokenHash` فريد؛ `GET /auth/me` يتحقق من عدم انتهاء الجلسة أو إبطالها ومن بقاء Inspector بحالة `ACTIVE`. `POST /auth/logout` يبطل الجلسة الحالية فقط.

تتطلب cookie mutations قيمة CSRF في cookie `inspector_csrf` ورأس `X-CSRF-Token` مطابق. `GET /auth/me` غير المصادق عليه يهيئ CSRF cookie ثم يعيد 401؛ بعد login ترتبط قيمة CSRF بالجلسة. لا تميّز ردود فشل login بين حساب مفقود أو كلمة مرور خاطئة أو حساب `INACTIVE`. فحص district membership وملكية كل مورد في service. لا JWT/teacher session ولا endpoints عامة لملفات Teacher. حماية public intake في TASK-030 بمحدد معدل وstrict validation وحد JSON؛ تحدٍ أو CAPTCHA/WAF تقوية مستقبلية فقط عند ثبوت الحاجة، وليست شرطًا في TASK-030. لا تعرض duplicate candidates للمُرسل.

## الموارد

| Endpoint | العمليات | نطاق الإدخال/الإخراج والحماية |
|---|---|---|
| `/public/districts/:districtId/submissions` | POST | عقد G3 التاريخي ADR-015؛ من TASK-041 يحل `workplace` لمؤسسة واحدة محل حقول الأسماء القديمة وفق ADR-029. district من المسار؛ TeacherSubmission مستقل `PENDING`، `202` وإيصال فقط، بلا public lookup |
| `/submissions` | GET | Inspector مصادق؛ `status` افتراضيًا `PENDING`، و`districtId`, `q`, cursor وفق العقد؛ قائمة scoped ومؤشر `hasPotentialDuplicates` منطقي دون تفاصيل المرشحين |
| `/submissions/:id` | GET | بيانات الطلب للمفتش المصرح و`potentialDuplicates` بأسباب التشابه فقط؛ 404 عام خارج النطاق |
| `/submissions/:id/decision` | POST | عقد TASK-033/034 أدناه؛ ACTIVE Inspector، CSRF، district scope؛ 409 عند تعارض الحالة |
| `/institutions` | GET/POST | district-scoped، q/pagination؛ create للمفتش المصرح |
| `/institutions/:id` | GET/PATCH — TASK-042 مكتملة | تفاصيل مؤسسة مصرح بها وتعديل صريح لبياناتها؛ لا archive endpoint ضمن المرحلة |
| `/teachers` | GET — TASK-044 مكتملة | بحث ومرشحات وترقيم خادمي وفق عقد TASK-044 أدناه؛ لا مرشحات visit قبل مجال الزيارات |
| `/teachers/:id` | GET/PATCH | ملف مهني حالي وفق عقد TASK-035 أدناه؛ لا حساب مستخدم أو تحرير إسنادات/زيارات |
| `/teachers/:id/current-institution` | PUT — TASK-043 مكتملة | اختيار مؤسسة حالية واحدة أو إنشاؤها صراحةً وربطها ذريًا؛ `expectedInstitutionId` يمنع قرارًا مبنيًا على رابط تغيّر |
| `/teachers/:id/schedules` | GET/POST — TASK-048 مكتملة | سنة دراسية canonical وجدول حالي واحد لها؛ GET structured slots/revision |
| `/schedules/:id/slots` | POST — TASK-048 مكتملة | dayOfWeek/startMinute/endMinute وlabels/notes اختيارية؛ بلا institutionId/assignmentId |
| `/slots/:id` | PATCH/DELETE — TASK-048 مكتملة | تحرير slot في الجدول الحالي مع expected revision؛ لا تاريخ نسخ أو draft/published |
| `/visits` | GET/POST — TASK-050 contract | زيارة تربوية عامة: قائمة scoped خادمية/إنشاء مخطط بتحذير جدول استشاري؛ التفاصيل أدناه |
| `/visits/:id` | GET/PATCH — TASK-050 contract | قراءة/إعادة جدولة/إكمال/إلغاء ضمن revision ونطاق المفتش؛ بلا حقول تقرير |
| `/visits/:id/report` | GET/PUT | draft فقط؛ finalization endpoint مستقل يحفظ snapshot |
| `/reports/:id/finalize` | POST | optimistic version، audit، لا تعديل لاحق للتقرير النهائي |
| `/reports/:id/follow-ups` | GET/POST | recommendation reference/note/dueAt؛ permission |
| `/follow-ups/:id` | PATCH | state transition وaudit |
| `/reference/sources`, `/reference/items` | GET | verified provenance وtaxonomy، read-only في MVP |
| `/proposals` | GET/POST | kind, status، inspector owner، title، content validated by kind |
| `/proposals/:id` | GET/PATCH/POST clone/POST archive | owner/district guard؛ تعديل ينتج ProposalRevision جديدًا |
| `/proposals/:id/revisions` | GET | history metadata/immutable content للمصرح |
| `/dashboard/summary` | GET | counts/period مع تعريف وtimestamp؛ no unscoped aggregate |
| `/audit-events` | GET | inspector-authorized, filtered; redacted; no public route |
| `/me/districts` | GET | authenticated Inspector's current District context only; no client-supplied scope |

### Pedagogical Visit contract (ADR-031 / TASK-050)

كل المسارات تحت `/api/v1`. تتطلب Inspector مصادقًا عليه بحالة `ACTIVE` وعضوية حالية في `Visit.districtId`، وتعرض/تغير الزيارات التي يكون هو `inspectorId` المسؤول عنها فقط. الزيارة الغائبة أو خارج مقاطعته/مسؤوليته تعيد `404` عامًا؛ لا تُقرأ عضوية تاريخية باعتبارها صلاحية حالية. جميع mutations تتطلب CSRF القائم وتستعمل request ID وغلاف الأخطاء المشترك. GET/POST/PATCH تعيد `Cache-Control: no-store`؛ لا تسجل القراءة AuditLog. لا public Visit route أو مسارات تقرير في TASK-050.

التمثيل المصرح للزيارة هو `{id,districtId,teacher:{id,name,surname},institution:{id,name},academicYear,scheduledStartAt,scheduledEndAt,occurredAt,status,revision,createdAt,updatedAt}`؛ `institution.name` هنا **دائمًا** `institutionNameSnapshot` التاريخي، وليس اسم Institution الحالي أو `Teacher.institutionId`. `inspectorId` محفوظ في DB للمسؤولية ولا يلزم نسخه إلى رد زيارات المفتش نفسه. الأوقات في الرد ISO 8601 UTC. لا بريد/هاتف/ميلاد/عنوان/هاتف مدير/بيانات تصريح/notes/slots أو محتوى تقرير في القائمة أو التفاصيل. `teacher` للهوية التشغيلية المحدودة فقط. القراءة المجمعة/العلاقات في استعلام محدود، بلا N+1.

`GET /api/v1/visits` يقبل فقط `districtId?`, `teacherId?`, `institutionId?`, `status?`, `from?`, `to?`, `limit?`, `cursor?`. UUIDs صالحة؛ `status` إحدى `PLANNED|COMPLETED|CANCELLED`، و`from/to` timestamps ISO 8601 مع offset صريح، بحيث `from < to` إن وُجدا معًا؛ المرشح الزمني يطبق `scheduledStartAt >= from` و`scheduledStartAt < to`. لا مرشح نوع أو بحث نصي أو فرز اختياري. الغياب يعرض كل حالات زيارات المفتش في مقاطعات عضويته الحالية. `districtId` يضيّق إلى مقاطعة مصرح بها وإلا `404` عام؛ Teacher/Institution ID غير الموجود أو خارج النتائج يعيد مجموعة فارغة دون كشف وجوده. جميع المرشحات AND وخادمية قبل `total`/pagination. `limit` عدد صحيح 1..100 وافتراضي 25. الفرز الوحيد `scheduledStartAt DESC,id DESC`، و`cursor` UUID لصف موجود ضمن مجموعة النتائج الحالية؛ غير صالح/خارجها `404` عام. الرد `200 {data:[<visit projection>],page:{limit,nextCursor,total}}`؛ `total` قبل الترقيم و`nextCursor` ID آخر صف عند وجود صفحة أخرى وإلا NULL. تغيّر الفرز بين الطلبات قد يستلزم بدء القائمة من جديد؛ لا snapshot متعدد الصفحات.

`POST /api/v1/visits` يقبل JSON strict `{teacherId,academicYear,scheduledStartAt,scheduledEndAt,scheduleWarningAcknowledgement?}`. السنة canonical `YYYY-YYYY` بسنتين متتابعتين؛ الوقتان timestamp ISO 8601 مع `Z` أو offset رقمي صريح و`start < end`. لا مدة افتراضية أو شرط أن البداية في المستقبل. يشتق الخادم `districtId` من Teacher الحالي و`inspectorId` من الجلسة؛ يتأكد من عضوية المقاطعة الحالية و`Teacher.recordStatus=ACTIVE` ومن وجود Institution حالية معتمدة وغير مؤرشفة في مقاطعة Teacher نفسها، ثم ينسخ `institutionId` واسمها في `institutionNameSnapshot`. غياب/خروج Teacher عن النطاق `404` عام؛ Teacher غير نشط `409 TEACHER_INACTIVE`؛ عدم وجود مؤسسة حالية `409 TEACHER_CURRENT_INSTITUTION_REQUIRED`؛ مؤسسة حالية مؤرشفة أو غير متسقة `409 VISIT_WORKPLACE_UNAVAILABLE`. لا يقبل العميل district/inspector/institution IDs أو الاسم أو status أو revision/occurredAt.

الجدول الأسبوعي **استشاري** عند POST وعملية RESCHEDULE فقط. يفحص الخادم `WeeklySchedule(teacherId,academicYear)` في لحظة الطلب. يحوّل الفترة كلها إلى `Africa/Algiers`، ويقسمها عند منتصف الليل المحلي، ويقارن كل جزء باتحاد slots اليومية نصف المفتوحة؛ الحصص المتجاورة تغطي الفترة دون فجوة، أما وجود فجوة في أي جزء فلا يغطيها. لا يفترض حدود بداية/نهاية السنة الدراسية من التاريخ، ولا يحسب عطلًا أو استثناءات. لا جدول للسنة ⇒ `VISIT_WEEKLY_SCHEDULE_MISSING`؛ جدول موجود لكنه لا يغطي الفترة كلها (بما فيه جدول بلا slots) ⇒ `VISIT_OUTSIDE_WEEKLY_SCHEDULE`. إذا وُجد تحذير ولم يطابقه حقل `scheduleWarningAcknowledgement`، فالرد `409` وغلاف الخطأ المشترك مع `error.code` = رمز التحذير الحالي؛ يعيد العميل **نفس الطلب** مع `scheduleWarningAcknowledgement` بهذه القيمة الصريحة ليؤكد المتابعة. الحقل اختياري فقط إذا لا تحذير؛ إذا زال التحذير بعد الطلب الأول وقدّم العميل إقرارًا قديمًا، فالرد `409 VISIT_SCHEDULE_CONTEXT_CHANGED` ليعيد الطلب دون إقرار. لا يتحول التحذير إلى منع دائم أو FK إلى الجدول. تتغير الصورة الاستشارية إذا تغير الجدول لاحقًا، لكن زيارة محفوظة لا تُعاد مراجعتها أو إبطالها بأثر رجعي.

عند نجاح POST لا يوجد تداخل Visit غير ملغاة للمفتش أو Teacher في `[scheduledStartAt,scheduledEndAt)`، بما فيه زيارة `COMPLETED`؛ التجاور مسموح. تحقق الخدمة يقدم خطأ آمنًا، وقيدا DB GiST exclusion في [DATABASE](DATABASE.md#pedagogicalvisit-persistence-contract-adr-031--task-050) هما الحارس النهائي للسباقات. أي تداخل، حتى في إنشاء متزامن، `409 VISIT_OVERLAP_CONFLICT` بلا ID/بيانات الزيارة الأخرى. النجاح `201 {data:{visit:<projection>}}`، `status=PLANNED`, `occurredAt=null`, `revision=1`، مع `PEDAGOGICAL_VISIT_CREATED` داخل المعاملة نفسها.

`GET /api/v1/visits/:id` يعيد `200 {data:{visit:<projection>}}` بعد فحص المسؤولية وعضوية المقاطعة الحالية، ويظل الاسم التاريخي ظاهرًا بعد تعديل/أرشفة Institution أو تغيير مؤسسة Teacher. UUID مشوه `400 VALIDATION_ERROR`، ومورد غائب/خارج النطاق `404` عام.

`PATCH /api/v1/visits/:id` يقبل أحد أجسام JSON strict التالية فقط: `{"operation":"RESCHEDULE","expectedRevision":<positive integer>,"academicYear":"YYYY-YYYY","scheduledStartAt":<timestamp>,"scheduledEndAt":<timestamp>,"scheduleWarningAcknowledgement"?:<warning code>}`؛ أو `{"operation":"COMPLETE","expectedRevision":<positive integer>,"occurredAt":<timestamp>}`؛ أو `{"operation":"CANCEL","expectedRevision":<positive integer>}`. لا partial تغيير للفترة دون طرفها الآخر. RESCHEDULE فقط من PLANNED، ويتحقق من Teacher ما زال ACTIVE ومن تطابق مؤسسة Teacher الحالية مع `Visit.institutionId` ومن عدم أرشفتها؛ إذا تغيّر السياق يرد `409 VISIT_WORKPLACE_CHANGED` وتظل الزيارة الأصلية للقراءة أو الإكمال/الإلغاء. لا تغير RESCHEDULE `districtId/inspectorId/teacherId/institutionId/institutionNameSnapshot`؛ تفحص الجدول الاستشاري والتداخل كما في POST. إن لم تتغير القيم بعد normalization فالرد `200` بالزيارة الحالية بلا revision جديد أو audit. COMPLETE فقط من PLANNED، ويتطلب `occurredAt` كوقت الإنجاز الفعلي مع offset صريح وليس مستقبلًا بالنسبة لوقت الخادم؛ يضبط status/occurredAt، ويحفظ الموعد المخطط. CANCEL فقط من PLANNED ويترك `occurredAt=null`؛ الإلغاء يخرج الفترة من قيد التداخل. لا إعادة فتح أو تعديل حالة نهائية. النجاح `200 {data:{visit:<projection>}}`.

كل PATCH يطابق `expectedRevision` و`status=PLANNED` في تحديث ذري داخل transaction؛ فشل revision يرد `409 VISIT_REVISION_CONFLICT`، والحالة النهائية/انتقال غير مسموح يرد `409 VISIT_STATE_CONFLICT`، بلا تغيير أو AuditLog. ينجح متنافس واحد على الأكثر بالـrevision نفسها. تحديث فعلي يزيد revision مرة واحدة ويكتب الحدث الموافق `PEDAGOGICAL_VISIT_UPDATED/COMPLETED/CANCELLED` في المعاملة؛ فشل append يرجع العملية. metadata الحدث حسب ADR-031 فقط، بلا PII أو نصوص/قيم وقت. تُرفض المفاتيح المجهولة/المكررة والقيم غير الصالحة في query/body بـ`400 VALIDATION_ERROR`، دون صدى لقيم الإدخال أو تفاصيل SQL؛ لا PII أو جسم الطلب في logs.

### Authenticated District context

`GET /me/districts` requires a valid session belonging to an `ACTIVE` Inspector. It returns exactly `{items:[{id,name}]}` for distinct Districts with a current membership for that Inspector (`validFrom <= now` and `validTo IS NULL OR validTo > now`). Expired and future memberships are excluded. The client cannot request or broaden District scope; membership identifiers and validity dates are not returned. No pagination or District mutation/CRUD is provided.

### Institution list/create (TASK-023)

- `GET /institutions` lists Institutions only in the authenticated Inspector's current District memberships. Optional `districtId` narrows the list and must be in scope; an out-of-scope District is returned as generic 404. `q` is a trimmed, bounded case-insensitive name search; `limit` defaults to 25 and is capped at 100; cursor pagination has a stable `name,id` order. Only `archivedAt = NULL` rows are considered, including search results, pagination, and `page.total`; no archived selector is defined in this task. Response is `{data, page:{limit,nextCursor,total}}`.
- `POST /institutions` accepts only `{districtId,name,externalCode?}`. District membership is required; an out-of-scope District returns generic 404. No update, delete, archive, or unarchive operation is introduced by TASK-023.
- Archive semantics are defined by [ADR-024](DECISIONS.md#adr-024--institution-archive-list-policy).

### Teacher directory search (TASK-044 contract)

حالة تنفيذ TASK-044: `COMPLETED`. `GET /api/v1/teachers` هو مسار القائمة الوحيد، قراءة لمفتش ذي Session صالحة وحالة `ACTIVE`، مع `Cache-Control: no-store` وغلاف الخطأ و`requestId` المعتادين. لا CSRF إضافي لـGET ولا AuditLog للقراءة. كل ترشيح وعدّ وترقيم يجري على الخادم بعد قصر النتائج على Districts ذات عضوية Inspector سارية وقت الطلب وفق TASK-022. `districtId` UUID اختياري **دائمًا**: غيابه يبحث في جميع مقاطعات المفتش الحالية حتى إن تعددت، وغياب العضويات يعيد قائمة فارغة؛ وجوده يضيّق إلى مقاطعة واحدة مصرح بها، وخارج النطاق يعيد `404` عامًا بلا كشف وجود سجلات. لا يُقبل نطاق من body أو IP.

الاستعلامات الاختيارية المسموحة حصريًا: `districtId`, `q`, `institutionId`, `hasCurrentInstitution`, `professionalStatus`, `recordStatus`, `academicYear`, `dayOfWeek`, `minuteOfDay`, `worksToday`, `worksNow`, `limit`, `cursor`. المفاتيح المجهولة أو المتكررة والقيم غير الصالحة تعيد `400 VALIDATION_ERROR` بغلاف حقول آمن بلا صدى لقيمة البحث. لا `page/pageSize`, أو `sort`, أو `municipality`, أو `visited/from/to` في TASK-044.

`q` مفرد حتى 100 حرف بعد trim واختزال whitespace المتتابع إلى مسافة واحدة؛ الفراغ وحده يعادل غياب `q`. البحث substring غير ضبابي وغير صوتي. تطابق الاسم: تُقسّم `q` على المسافات، ويجب أن يظهر **كل** جزء كجزء من `Teacher.name` أو `Teacher.surname` (بأي ترتيب)؛ أو يطابق النص الكامل جزءًا من `Teacher.phone` أو `Teacher.email` أو `currentInstitution.name`. الفروع الخمسة داخل `q` مرتبطة بـOR، وأجزاء الاسم بـAND. مقارنة النصوص غير حساسة لحالة الحروف اللاتينية وفق بحث PostgreSQL القائم؛ الحروف العربية والتشكيل والهمزات تُحفظ كما هي، بلا transliteration أو طيّ حروف أو fuzzy matching. لا بحث في `TeacherSubmission` أو جهة العمل المعلنة أو المؤهلات أو الملاحظات أو أي تاريخ مهني. هاتف Teacher المخزن بصيغة `+213`؛ عند كون `q` رقمًا جزائريًا كاملًا صالحًا بصيغته المحلية أو الدولية يُطبّق تطبيع الهاتف القائم قبل فرع بحث الهاتف، أما المقطع الجزئي فيبحث كما كُتب داخل القيمة المخزنة. البريد يُبحث نصيًا بلا تفسير provider aliases أو مطابقة هوية.

`institutionId=<UUID>` يعني `Teacher.institutionId` الحالي فقط؛ مؤسسة مفقودة أو خارج مقاطعات المفتش تعيد `404` عامًا، ومؤسسة مصرح بها بلا أساتذة تعيد نتيجة فارغة. `hasCurrentInstitution=true|false` يطابق كون `Teacher.institutionId` غير NULL أو NULL؛ غيابه يشمل الحالتين. يسمح بـ`institutionId` مع `hasCurrentInstitution=true`، ويُرفض جمعه مع `false` بـ`400`. لا تُستعمل أسماء المؤسسات المعلنة في هذا المرشح. لا مرشح بلدية في TASK-044؛ إذا اعتُمد لاحقًا فمصدره `currentInstitution.municipality` وفق ADR-029، بلا عمود Teacher أو جدول بلديات.

`professionalStatus` قيمة مفردة اختيارية من `PERMANENT|TRAINEE|CONTRACT|TEMPORARY_CONTRACT`؛ عند وجودها لا تطابق NULL، وعند غيابها لا تُستبعد السجلات ذات NULL لهذا السبب. `recordStatus` قيمة مفردة من `ACTIVE|INACTIVE`، وافتراضيها `ACTIVE` للسجل التشغيلي وفق ADR-027؛ `INACTIVE` يعرض السجلات غير النشطة صراحةً. `archivedAt` مستقل ولا يُحوّل إلى `recordStatus`: لا مرشح أرشفة ولا استبعاد إضافي بحسب `archivedAt` ضمن TASK-044، لأن MVP لا يملك workflow يؤرشف Teacher. تُحسم رؤية الصفوف المؤرشفة قبل تفعيل أي workflow أرشفة لاحق ضمن ADR-014. الأستاذ بلا مؤسسة حالية يظهر في القائمة الافتراضية.

مرشحات الجدول تستعمل `Teacher → WeeklySchedule` للسنة المطلوبة ثم `WeeklyScheduleSlot` وفق ADR-030، بلا مؤسسة مخزنة على الحصة ولا عطلات/استثناءات. `academicYear` canonical `YYYY-YYYY` بسنتين متتابعتين، ويلزم مع أي من `dayOfWeek`, `minuteOfDay`, `worksToday=true`, `worksNow=true`؛ وجوده منفردًا دون مرشح جدول يُرفض بدل أن يُتجاهل أو يفترض معنى جديدًا. `dayOfWeek` عدد صحيح 1..7؛ وحده يعني وجود حصة واحدة على الأقل في ذلك اليوم والسنة. `minuteOfDay` عدد صحيح 0..1439 ويلزم معه `dayOfWeek`؛ التطابق في **الحصة نفسها** إذا `startMinute <= minuteOfDay < endMinute`. لا تحويل منطقة زمنية لهذين المدخلين الرقميين.

`worksToday=true` يطابق وجود حصة في يوم الأسبوع الحالي بتوقيت `Africa/Algiers` للسنة المطلوبة؛ `worksNow=true` يضيف شرط الدقيقة المحلية الحالية `startMinute <= nowMinute < endMinute` في الحصة نفسها. يلتقط الخادم لحظة واحدة لكل طلب، ويستخرج منها اليوم والدقيقة بتوقيت `Africa/Algiers`، ولا يستنتج السنة الدراسية من التاريخ. تُقبل القيمة `true` فقط لهذه الرايات؛ `false` أو غيرها تُرفض لتجنب معنى سلبي غير معتمد. يجوز جمع الرايتين أو جمعهما مع اليوم/الوقت الصريح؛ تتقاطع الشروط على Teacher داخل السنة ذاتها، ويجوز أن تثبتها حصص مختلفة، باستثناء اقتران `dayOfWeek` و`minuteOfDay` الذي يلزمه slot واحد. الجدول الغائب لا يطابق مرشحًا جدوليًا، لكنه لا يحجب Teacher عن البحث غير الجدولي.

جميع فئات المرشحات ترتبط بـAND؛ البدائل داخل `q` فقط ترتبط بـOR. لا قيم متعددة لـ`districtId`, `institutionId`, `professionalStatus`, أو `recordStatus`. الفرز الوحيد `surname ASC, name ASC, id ASC` بترتيب PostgreSQL الحالي، و`id` يكسر التعادل؛ لا sort اختياري في MVP. نعيد استعمال ترقيم القوائم القائم: `limit` عدد صحيح 1..100 افتراضي 25، و`cursor` UUID اختياري يشير إلى صف موجود في **مجموعة النتائج المرشحة نفسها**؛ إذا قُدّم cursor يشير إلى صف غير موجود/خارج النطاق أو لم يعد يطابق المرشحات يعيد `404` عامًا. الرد `200 {data:[...],page:{limit,nextCursor,total}}`؛ `total` يحسب جميع الصفوف المرشحة قبل الترقيم، و`nextCursor` هو ID آخر صف معروض عند وجود صفحة أخرى وإلا NULL. بعد آخر صف، الصفحة التالية فارغة و`nextCursor:null`؛ لا قائمة غير محدودة. إذا تغيرت بيانات الفرز بين الطلبات، يعيد العميل البحث من بدايته؛ لا snapshot متعدد الطلبات.

عنصر القائمة محصور في `{id,districtId,name,surname,professionalStatus,recordStatus,currentInstitution}`، حيث `currentInstitution` إما `null` أو `{id,name,municipality}` من الرابط الحالي المعتمد. لا هاتف أو بريد في العرض الافتراضي، رغم السماح بالبحث عنهما؛ يفتح المفتش المصرح ملف Teacher لرؤيتهما. لا `birthDate`, `placeOfBirth`, `qualifications`, `archivedAt`, `directorPhone`, عنوان المؤسسة، بيانات التصريح الأصلي أو AuditLog أو slots أو ملخص جدول في الرد. عند تفعيل مرشح جدولي فإن وجود العنصر يثبت مطابقته؛ لا يلزم نسخ الحصص إليه. `districtId` يساعد TASK-045 في تسمية المقاطعة عبر `/me/districts` عند تعددها، ولا يوسّع النطاق.

تنفيذ TASK-044 يستخدم predicate scoped قبل search/count، وفحص علاقة Institution الحالية وعلاقة Schedule/Slot داخل استعلامات خادمية محدودة، مع جلب مؤسسة كل صف بطريقة مجمّعة/علاقية؛ لا استعلام مؤسسة أو جدول لكل Teacher. الفهارس الحالية `Teacher(districtId,surname,name,recordStatus)`, `Teacher(institutionId)`, `WeeklySchedule UNIQUE(teacherId,academicYear)`, وslot `(scheduleId,dayOfWeek,startMinute,endMinute)` مع `(dayOfWeek,startMinute)` تكفي لنطاق 180+ مع قياس خطة الاستعلام وعينة أداء في المهمة؛ بحث substring قد يفحص صفوف المقاطعات المصرح بها، ولا يُضاف فهرس/migration تخميني. لا تُسجّل `q` أو URI المحتوي عليها في application logs، ولا تكشف الاستجابة وجود Teacher خارج نطاق المفتش.

### Weekly schedule contract (ADR-030 / TASK-048)

كل المسارات أدناه تحت `/api/v1`. تتطلب القراءة Inspector `ACTIVE` مصادقًا عليه، وعضوية District حالية للمعلّم؛ المورد المفقود أو خارج النطاق يعيد `404` عامًا وفق الغلاف المشترك، بلا كشف cross-district. جميع mutations تتطلب CSRF. تستخدم هذه المسارات سياسة cache الحالية للـAPI المصادق عليه، ولا تنشئ آلية cache جديدة. لا قراءة تسجل AuditLog.

التمثيل القانوني للجدول هو `{id,teacherId,academicYear,revision,slots}`. كل slot يعيد فقط `{id,dayOfWeek,startMinute,endMinute,levelLabel,groupLabel,notes}`. النصوص الاختيارية تظهر `null` عند خلوها. لا `institutionId` أو `assignmentId` أو تواريخ صلاحية أو revisions تاريخية. ترتيب slots حتمي تصاعديًا حسب `dayOfWeek`, ثم `startMinute`, ثم `endMinute`, ثم `id`.

#### Read

`GET /api/v1/teachers/:teacherId/schedules?academicYear=YYYY-YYYY` يتطلب query `academicYear` بصيغة canonical وسنتين متتابعتين. إذا كان Teacher ضمن النطاق والجدول موجودًا، فالرد `200 {"data":{"schedule":<canonical schedule>}}`. إذا كان Teacher ضمن النطاق ولا يوجد جدول لتلك السنة، فهذا وضع طبيعي ويرد `200 {"data":{"schedule":null}}`. Teacher مفقود أو خارج النطاق يعيد `404` عامًا؛ query مفقود/غير صالح يعيد غلاف خطأ التحقق الحالي.

#### Create schedule

`POST /api/v1/teachers/:teacherId/schedules` يقبل جسمًا strict بالشكل `{academicYear,slots}`. `academicYear` مطلوب بصيغة `YYYY-YYYY` متتابعة. `slots` مصفوفة مطلوبة؛ يجوز أن تكون فارغة. كل عنصر يضم `dayOfWeek`, `startMinute`, `endMinute`، ويجوز أن يضم `levelLabel`, `groupLabel`, `notes` كـstring غير فارغ أو `null` وفق حدود التطبيع أدناه؛ غياب حقل نصي اختياري يعادل `null`. تُرفض المفاتيح غير المعروفة، ولا يقبل العميل IDs أو `teacherId` أو `revision` أو `scheduleId` أو حقول المؤسسة. ينشأ الجدول revision=1 وتُنشأ slots الأولية في معاملة واحدة. النجاح `201 {"data":{"schedule":<canonical schedule>}}`. تكرار `(teacherId,academicYear)`، بما فيه خاسر سباق الإنشاء، يعيد `409` بالرمز `WEEKLY_SCHEDULE_ALREADY_EXISTS`؛ لا صفوف slots يتيمة ولا AuditLog نجاح ثانٍ. إنشاء الجدول يسجل `WEEKLY_SCHEDULE_CREATED` مع `entityType=WeeklySchedule`, و`entityId=scheduleId`, و`districtId=Teacher.districtId`, وactor/requestId من سياق الخادم، وmetadata `{}` بالضبط.

#### Slot create

`POST /api/v1/schedules/:scheduleId/slots` يقبل جسمًا strict `{expectedRevision,slot}`. `expectedRevision` عدد صحيح موجب مطلوب. `slot` كائن strict؛ `dayOfWeek`, `startMinute`, `endMinute` مطلوبة، وحقول النص الاختيارية تقبل string غير فارغ أو `null`؛ الحقل النصي المحذوف عند الإنشاء يحفظ `null`. النجاح `201 {"data":{"schedule":<full updated canonical schedule>}}`، وتزيد revision مرة واحدة بالضبط. يسجل `WEEKLY_SCHEDULE_UPDATED`، ومفتاح المورد هو الجدول، مع metadata `{changedFields:["slots"],affectedSlotIds:[createdSlotId],slotCount:resultingSlotCount}`.

#### Slot patch

`PATCH /api/v1/slots/:slotId` يقبل جسمًا strict `{expectedRevision,changes}`. `expectedRevision` عدد صحيح موجب مطلوب؛ `changes` مطلوب ويضم خاصية mutable واحدة على الأقل من `dayOfWeek`, `startMinute`, `endMinute`, `levelLabel`, `groupLabel`, `notes`. لا تقبل خصائص الهوية أو الجدول أو السنة أو revision أو المؤسسة. للحقول النصية: الغياب يبقي القيمة، و`null` يمحوها، أما string الفارغ أو المكوّن من فراغات فقط فيُرفض؛ لا يتحول الفارغ إلى null. القيم النصية غير الفارغة تخضع للتطبيع والتحقق الحاليين. إذا لم ينتج بعد التطبيع أي تغيير محفوظ، فالرد `200` بالجدول الحالي؛ لا زيادة revision ولا AuditLog. عند تغيير فعلي، الرد `200 {"data":{"schedule":<full updated canonical schedule>}}` وتزيد revision مرة واحدة. يسجل `WEEKLY_SCHEDULE_UPDATED` مع metadata `{changedFields:["slots"],affectedSlotIds:[updatedSlotId],slotCount:resultingSlotCount}`.

#### Slot delete

`DELETE /api/v1/slots/:slotId` يقبل JSON body strict `{expectedRevision}`؛ هذا المسار يجيز صراحةً JSON body مع DELETE. `expectedRevision` عدد صحيح موجب مطلوب. النجاح `200 {"data":{"schedule":<full updated canonical schedule>}}` وتزيد revision مرة واحدة. يجوز حذف آخر slot ويبقى الجدول موجودًا بمصفوفة `slots:[]`؛ لا endpoint لحذف الجدول كله. يسجل `WEEKLY_SCHEDULE_UPDATED` مع metadata `{changedFields:["slots"],affectedSlotIds:[deletedSlotId],slotCount:resultingSlotCount}`.

#### Scope, prerequisite, concurrency and validation

أي mutation على Teacher لا يملك `institutionId` حاليًا يرد `409` بالرمز `TEACHER_CURRENT_INSTITUTION_REQUIRED`؛ ينطبق ذلك على إنشاء الجدول وإنشاء/تعديل/حذف slot، بينما تبقى القراءة متاحة. لا ينشئ النظام أو يربط مؤسسة تلقائيًا.

في كل slot mutation يجب أن يساوي `expectedRevision` revision الحالية. الاختلاف يرد `409` بالرمز `WEEKLY_SCHEDULE_REVISION_CONFLICT`، دون retry أو أي تغيير أو AuditLog. الطلبات المتزامنة التي تحمل revision نفسها: ينجح واحد على الأكثر. التحقق العام يستخدم غلاف validation الحالي (`400`, `VALIDATION_ERROR`) للسنة أو UUID أو weekday أو الوقت أو النصوص أو المفاتيح غير الصالحة. Zod strict يفرض `dayOfWeek` عددًا صحيحًا من 1 (الاثنين) إلى 7 (الأحد)، و`startMinute/endMinute` عددين صحيحين مع `0 <= startMinute < endMinute <= 1440`.

`levelLabel/groupLabel/notes` اختيارية وnullable وحدودها بعد Unicode NFC وtrim واختزال فراغات العرض ورفض محارف التحكم هي 100/100/500 Unicode code points؛ النص الفارغ أو whitespace-only مرفوض، و`null` يمحو الحقل في PATCH. slots متعددة في اليوم مسموحة. يمنع تداخل slotين في الجدول واليوم نفسيهما (`A.startMinute < B.endMinute && B.startMinute < A.endMinute`) ويسمح بالتجاور. يعيد تداخل التطبيق أو fallback لقيد PostgreSQL `400` بالرمز `WEEKLY_SCHEDULE_SLOT_OVERLAP`، دون كشف تفاصيل قاعدة البيانات.

#### Atomicity and AuditLog

إنشاء الجدول: التفويض والنطاق، شرط المؤسسة الحالية، إنشاء الجدول والـslots الأولية، وحدث AuditLog تتم ذريًا. كل slot mutation: التفويض والنطاق، شرط المؤسسة الحالية، فحص revision والتحقق، mutation، زيادة revision مرة عند التغيير الفعلي، وAuditLog تتم ذريًا؛ فشل التدقيق يرجع كل التغييرات. `WEEKLY_SCHEDULE_UPDATED` يستخدم دائمًا `entityType=WeeklySchedule`, `entityId=scheduleId`, و`districtId=Teacher.districtId`، مع actor/requestId من سياق الخادم.

وفق ADR-030، metadata إنشاء الجدول `{}` بالضبط. ولكل إنشاء أو تعديل فعلي أو حذف slot، metadata التحديث بالضبط `{changedFields:["slots"],affectedSlotIds:[...],slotCount:<integer>}`؛ `changedFields` يساوي `['slots']` فقط، و`affectedSlotIds` يحوي فقط ID الـslot المنشأ/المعدّل/المحذوف، و`slotCount` العدد الكلي الناتج بعد العملية. لا تضف operation أو scheduleId أو قيم slot أو PII أو بيانات المؤسسة. لا AuditLog لقراءة أو PATCH بلا تغيير محفوظ. فشل append يلغي العملية كلها.

يستخدم محرر TASK-048 أيام الأسبوع العربية ومؤسسة Teacher الحالية كسياق عرض فقط. لا تُحفظ المؤسسة في الجدول/slot. التفسير التشغيلي لليوم/الوقت يستخدم `Africa/Algiers`، والـslot نفسه دقائق محلية فقط. لا عطلات أو استثناءات أو طباعة أو تاريخ نسخ ضمن العقد. [ADR-030](DECISIONS.md#adr-030--weekly-schedule-mvp-contract).

### Post-G3 workplace contract (ADR-029)

هذه **عقود ما بعد G3** لـTASK-040..043. `Institution` تضيف `municipality` و`address` و`directorPhone` nullable؛ قيم DB القديمة NULL. من TASK-042 تحمل عناصر GET list وGET detail وPOST/PATCH response الحقول `{id,districtId,name,externalCode,municipality,address,directorPhone,archivedAt,createdAt,updatedAt}`؛ قيم workplace الغائبة تظهر `null`. تمتد استجابة `GET /institutions` بهذه الحقول، ويظل `q` بحث اسم خادميًا ومقيدًا بالمقاطعات النشطة، دون مطابقة هوية أو merge. `GET /institutions/:id` يعيد مؤسسة مصرحًا بها أو `404` عامًا؛ اسم مؤسسة مماثل لا يمنع إنشاء أخرى.

يستمر `POST /institutions` القائم بجسم `{districtId,name,externalCode?}`، ويقبل **إضافةً** `municipality?`, `address?`, `directorPhone?` (كل منها نص صالح أو `null`؛ الغياب/null يحفظ NULL). يتطلب `name` من 1..200، و`externalCode` من 1..100، ولا يسمح بمفاتيح أخرى. يطبق TASK-042 حماية CSRF على هذا المسار القائم. `PATCH /institutions/:id` يقبل جسمًا جزئيًا strict غير فارغ من `name`, `municipality`, `address`, `directorPhone` فقط: الاسم لا يقبل `null`، والباقي يقبل `null` للمحو؛ المفتاح الغائب لا يتغير، والنص الفارغ مرفوض. لا تغيير لـ`districtId`, `archivedAt` أو `externalCode` عبر PATCH هذا. القراءة/الإنشاء/التعديل لمفتش `ACTIVE` بعضوية حالية؛ mutations بـCSRF؛ مؤسسة غائبة أو خارج النطاق تعيد `404` عامًا، والمُؤرشفة تبقى قابلة للقراءة بالتفصيل ولا تُعدل (`409` ضمن النطاق). التعديل المكافئ بعد التطبيع لا يحدّث updatedAt ولا يسجل audit؛ التغيير الفعلي يسجل `INSTITUTION_UPDATED` بmetadata أسماء الحقول المتغيرة فقط، والإنشاء يسجل `INSTITUTION_CREATED` بmetadata فارغة، ضمن معاملة العملية؛ لا تدقيق بأثر رجعي على عمليات G2.

حدود نصوص المؤسسة والتصريح: `name`/`workplace.institutionName` 1..200، `municipality` 1..150، `address`/`workplace.institutionAddress` 1..300 Unicode code points بعد trim واختزال فراغات العرض المتكررة؛ تُرفض محارف التحكم والنصوص الفارغة، وتُحفظ الحروف العربية كما أُدخلت بلا geocoding أو رمز بلدية أو قائمة مرجعية. `directorPhone`/`workplace.directorPhone` حتى 20 حرفًا في الإدخال، يقبل الهاتف الثابت الجغرافي والمحمول الجزائري وفق قاعدة `phone` في ADR-015 ويُحفظ بشكل `+213`؛ لا OTP أو ownership check أو uniqueness. الحقول الثلاثة الجديدة مطلوبة في **التصريح العام الجديد**، لكنها nullable في Institution وعمليات المفتش للتوافق مع الصفوف القديمة أو معلومة لم تعتمد بعد.

`PUT /api/v1/teachers/:id/current-institution` ينفذ بعد `ACCEPT` فقط، ولا يدخل ضمن PATCH ملف TASK-035. جسمه strict بأحد شكلين حصريين:

```json
{"expectedInstitutionId":null,"institutionId":"<existing Institution UUID>"}
```

أو `{"expectedInstitutionId":null,"createInstitution":{"name":"...","municipality":"...","address":"...","directorPhone":"..."}}`؛ عند وجود رابط حالي تُستخدم قيمة UUID للمؤسسة الحالية بدل `null`. `expectedInstitutionId` مطلوب UUID أو `null`، وحقول الإنشاء الثلاثة الجديدة اختيارية ويمكن أن تكون `null`، و`name` مطلوب. لا يُقبل `districtId` أو `workplace` أو كلا فرعي الاختيار في body. رد النجاح `200` هو `{data:{teacherId:"<UUID>",currentInstitution:{id,name,municipality,address,directorPhone}}}`؛ عند إعادة اختيار المؤسسة الحالية نفسها والحالة المتوقعة صحيحة يعاد الرد بلا تحديث أو حدث جديد. لا مسار unlink عام في هذه المرحلة.

يتحقق الخادم داخل transaction من Teacher في نطاق المفتش الحالي، ومن `expectedInstitutionId` تحت قفل السجل، ثم من مؤسسة مختارة نشطة في District Teacher نفسها؛ الغائب/خارج النطاق `404` عام، والمدخل غير الصالح `400`، وغياب Session `401`، وفشل CSRF `403`، وتغير الرابط أو المؤسسة المؤرشفة `409`. في فرع الإنشاء يُشتق District من Teacher لا من body، وتُنشأ Institution وتُربط بـTeacher وتُلحق أحداث AuditLog في **معاملة واحدة**؛ لا رد نجاح جزئي. اختيار مؤسسة قائمة لا يغيّر اسمها أو عنوانها أو هاتف مديرها من تصريح الأستاذ. تغيير الرابط يستبدل المؤسسة الحالية فقط، بلا تاريخ نقل. يضمن FK المركب في [DATABASE](DATABASE.md#post-g3-current-workplace-contract-adr-029) تساوي District حتى لو أخطأ service. أحداث `TEACHER_INSTITUTION_LINKED/CHANGED`, `INSTITUTION_CREATED/UPDATED` وmetadata المسموحة في ADR-029؛ لا قيم PII في التدقيق أو السجلات/الأخطاء.

من TASK-043 يضيف `GET /teachers/:id` حقلي قراءة إلى غلاف TASK-035: `currentInstitution:null|{id,name,municipality,address,directorPhone}` للرابط المعتمد، و`declaredWorkplace:null|{institutionName,municipality,institutionAddress,directorPhone,legacyAdditionalInstitutionNames:string[]}` من snapshot المقبول فقط. عند قراءة snapshot G3 قد تكون حقول البلدية/العنوان/هاتف المدير `null` وتبقى الأسماء الإضافية في `legacyAdditionalInstitutionNames` التاريخية؛ لا تُنشأ قيم افتراضية. حقل `declaredInstitutions` القديم يبقى alias قراءة للتوافق مع عميل G3: في الإرسال الجديد يستمد الاسم من `workplace.institutionName` وقائمة إضافية فارغة، وفي القديم يحتفظ بالأسماء الأصلية؛ لا يدل الاسم `primary` في alias على تعدد علاقات معتمدة. الواجهة الجديدة تستخدم `declaredWorkplace` وتفصلها عن `currentInstitution`. يبقى `PATCH /teachers/:id` محصورًا بحقول ADR-028 ولا يقبل `institutionId`.

### Inspector submission reads and potential duplicates (TASK-032)

`GET /submissions` و`GET /submissions/:id` قراءة فقط لمفتش ذي Session صالحة وحالة `ACTIVE`. تتحقق الخدمة من عضوية المفتش الحالية في District الطلب؛ `districtId` الاختياري في القائمة يضيّق نطاقه فقط، وخارجه أو عند طلب تفصيل خارج النطاق يُعاد `404` عام بلا كشف وجود السجل. تبقى فلاتر القائمة `status`, `districtId`, `q`, cursor وحدود pagination في العقد المشترك؛ `status=PENDING` افتراضيًا. لا endpoint مستقل للمرشحين ولا mutation في TASK-032.

استجابة القائمة: `{data:[{id,firstName,lastName,dateOfBirth,submittedAt,primaryInstitutionName,status,hasPotentialDuplicates}],page:{limit,nextCursor,total?}}`. الاسم وتاريخ الميلاد واسم المؤسسة الأساسية مستخرجة من `submittedProfile` المعلن؛ `hasPotentialDuplicates` قيمة boolean محسوبة وقت القراءة، ولا تُعاد قائمة المرشحين أو أسبابهم في نتائج القائمة. لا يُعرض الهاتف أو البريد أو المؤهلات أو الملاحظات أو أسماء المؤسسات الإضافية في ملخص القائمة.

استجابة التفصيل: `{data:{id,districtId,status,submittedAt,submittedProfile,potentialDuplicates:[{id,firstName,lastName,dateOfBirth,placeOfBirth,status,submittedAt,matchReasons}]}}`. في TASK-035 يضاف إلى تفصيل الطلب المصرح حقل `acceptedTeacherId: UUID | null`؛ قيمته UUID فقط عندما يكون الطلب `ACCEPTED` وله Teacher مرتبط، ويستعمل رابطًا إلى `/app/teachers/:id` بعد إعادة جلب التفصيل، لا في رد قرار TASK-034. `submittedProfile` هو المعلومات المعلنة للطلب المعروض ويُتاح للمفتش المصرح فقط. `id` داخل `potentialDuplicates` هو معرّف TeacherSubmission الآخر اللازم للتنقل إلى تفصيله بعد فحص النطاق نفسه؛ لا تُنسخ فيه المؤهلات أو الملاحظات أو بيانات المؤسسات أو الهاتف أو البريد. `matchReasons` مصفوفة من `SAME_PHONE`, `SAME_EMAIL`, `SAME_NAME_AND_DOB` فقط؛ قد تتعدد الأسباب للمرشح الواحد، وهي **أسباب تشابه محتمل** لا حكم هوية. تُترجم لاحقًا إلى صياغة عربية محايدة مثل «قد توجد طلبات مشابهة» و«أسباب التشابه»، بلا وصف تكرار مؤكد أو احتيال أو نسبة ثقة أو توصية أو أزرار قرار/دمج في TASK-032.

تُحسب المرشحات عند القراءة وفق [ADR-011](DECISIONS.md#adr-011--potential-duplicate-candidates-for-inspector-review): الطلبات الأخرى `PENDING/INTERNAL_REVIEW` في District الطلب نفسه فقط، مع استبعاد الطلب الحالي و`REJECTED/ACCEPTED` وعدم إدخال سجلات District آخر في استعلام المرشحين. تطابق الهاتف المعياري أو البريد وفق تطبيع ADR-015 أو الاسم الأول واللقب المطبّعين مع تاريخ الميلاد ينتج السبب المقابل؛ لا fuzzy matching أو تخزين للمرشحين. بعد TASK-034 يكون Teacher مرجع الشخص المقبول؛ إضافته إلى نتائج المقارنة تتطلب عقد قراءة لاحقًا وليست توسعًا ضمنيًا لـTASK-034. لا يظهر الطلب المقبول وTeacher الناتج كمرشحين منفصلين. تُحسب إشارة القائمة دون استعلامات N+1 حيث أمكن. لا مرشحات في مسار عام ولا PII في logs/errors.

### Teacher submission decision (TASK-033/034)

المسار canonical: `POST /api/v1/submissions/:id/decision`. يتطلب Session مفتش `ACTIVE`، CSRF وفق عقد mutations، وعضوية حالية في District المورد. الخادم وحده يقرر صلاحية الانتقال؛ لا توسع الواجهة النطاق ولا تمنح المرشحات صلاحية إضافية.

الجسم JSON strict وبالضبط `{ "action": "ACCEPT" | "REJECT" | "INTERNAL_REVIEW", "expectedStatus": "PENDING" | "INTERNAL_REVIEW" }`. كلا الحقلين مطلوبان؛ تُرفض القيم `null` والمفاتيح الإضافية. لا `reason` أو note أو metadata عامة. قيم الإجراء تقابل الحالات الناتجة: `ACCEPT → ACCEPTED`, `REJECT → REJECTED`, `INTERNAL_REVIEW → INTERNAL_REVIEW`.

الانتقالات المسموحة فقط: `PENDING → ACCEPTED | REJECTED | INTERNAL_REVIEW`، و`INTERNAL_REVIEW → ACCEPTED | REJECTED`. يمنع تكرار `INTERNAL_REVIEW`، وأي انتقال من `ACCEPTED` أو `REJECTED`؛ فهما نهائيتان في MVP. الإحالة إلى `INTERNAL_REVIEW` تعني متابعة إضافية قبل قرار نهائي، ولا تنشئ Teacher أو تعدل الملف المرسل أو تنشئ Institution/Assignment، ولا تتطلب note.

عند اختلاف الحالة المحفوظة عن `expectedStatus` أو تعذر القرار بسبب تغيير متزامن، يعاد `409` بغلاف الخطأ الموحد؛ لا إعادة تلقائية. طلب `ACCEPT` المكرر بعد انتقال الطلب إلى `ACCEPTED` يعيد `409` كذلك، ولا يُعاد رد النجاح السابق. لا يُكشف من قام بالتغيير. النجاح يعيد الغلاف `{ "data": { "id": "<submission UUID>", "status": "ACCEPTED" | "REJECTED" | "INTERNAL_REVIEW" } }` فقط؛ لا بيانات Teacher في الرد. لا يرسل العميل `Idempotency-Key` لأي من `ACCEPT/REJECT/INTERNAL_REVIEW`؛ أزال تكامل TASK-034 الرأس الذي كان يرسله عميل TASK-033.

في `ACCEPT` ينشئ TASK-034 Teacher واحدًا من حقول الملف المهني في snapshot وفق [عقد Teacher](DATABASE.md#teacher-physical-contract-for-task-034)، ويحدث submission وبيانات القرار و`acceptedTeacherId` ويسجل AuditLog ضمن transaction واحدة. `districtId` من submission بعد التحقق من صلاحية المفتش، لا من العميل. في `REJECT` لا ينشأ Teacher؛ وفي `INTERNAL_REVIEW` المسموح فقط من `PENDING` لا ينشأ Teacher ولا يسجل note. لا ينشئ أي قرار Institution أو Assignment ولا يعتمد أسماء المؤسسات المعلنة. AuditLog مطلوب لكل إجراء قرار وفق ADR-025/ADR-027: حدث واحد بمورد TeacherSubmission، metadata قبول `{resultingTeacherId}` ورفض/مراجعة `{}` بلا PII؛ فشل append يفشل transaction كلها. TASK-033 لا يكتب AuditLog.

### Teacher profile (TASK-035)

المساران `GET /api/v1/teachers/:id` و`PATCH /api/v1/teachers/:id` للمفتش صاحب Session صالحة و`ACTIVE` وعضوية حالية في `Teacher.districtId`؛ UUID مشوّه `400`، وTeacher غائب أو خارج النطاق `404` عام بذات الغلاف. لا تُستمد المقاطعة من body أو حالة الواجهة. يستعمل GET/PATCH `Cache-Control: no-store`، وPATCH محمي بـCSRF القائم. لا يطبّق TASK-035 قاعدة خاصة لإخفاء/تحرير السجل اعتمادًا على `recordStatus` أو `archivedAt`؛ كلاهما read-only ولا توجد mutation لهما هنا. سياسة الأرشفة/الاحتفاظ خارج TASK-035 وفق ADR-014.

GET `200` يعيد **بالضبط** `{data:{id,districtId,name,surname,birthDate,placeOfBirth,phone,email,professionalStatus,employedAt,confirmedAt,qualifications,recordStatus,archivedAt,createdAt,updatedAt,declaredInstitutions}}`. التواريخ التقويمية `YYYY-MM-DD | null` بلا تحويل منطقة زمنية؛ timestamps بصيغة ISO UTC. `declaredInstitutions` إما `null` إذا لم يوجد طلب قبول مرتبط، أو `{primaryInstitutionName:string,additionalInstitutionNames:string[]}` من `TeacherSubmission` المقبول فقط؛ يُعرض كسياق تصريحات غير معتمدة للقراءة فقط، بلا IDs مؤسسات أو حالة اعتماد. لا يُعاد `submittedProfile` كاملًا، أو notes المرسل، أو receipt، أو بيانات قرار/تدقيق. لا AuditLog لقراءة الملف.

PATCH يقبل JSON object صارمًا يحوي **حقلًا واحدًا على الأقل** من: `name`, `surname`, `birthDate`, `placeOfBirth`, `phone`, `email`, `professionalStatus`, `employedAt`, `confirmedAt`, `qualifications`. المفتاح الغائب يبقى بلا تغيير؛ `null` يمحو فقط الحقول nullable، والنص `""` (حتى بعد trim) مرفوض، لا يمحو. `name/surname` لا يقبلان `null`. تُرفض المفاتيح الأخرى، وبخاصة `id/districtId/recordStatus/archivedAt/createdAt/updatedAt/acceptedTeacherId/sourceSubmissionId`, institution/assignment fields، وأي محاولة لتعديل snapshot. لا mass assignment؛ خطأ التحقق `400` بغلاف حقول عام بلا صدى للقيم. رد النجاح `200` بنفس غلاف وحقول GET بعد الحفظ، بما فيها `declaredInstitutions` غير المتغيرة.

| حقل PATCH | القيمة غير NULL والتحقق/التطبيع | هل يقبل `null`؟ |
|---|---|---|
| `name`, `surname` | نص 1..100 Unicode code points بعد trim واختزال الفراغات؛ محارف التحكم مرفوضة | لا |
| `birthDate` | تاريخ تقويمي صحيح `YYYY-MM-DD`، غير مستقبلي | نعم |
| `placeOfBirth` | نص 1..150 Unicode code points بعد trim واختزال الفراغات؛ محارف التحكم مرفوضة | نعم |
| `phone` | نفس حدود وصيغ ADR-015: مدخل حتى 20 حرفًا، هاتف ثابت/محمول جزائري، تخزين `+213` المعياري | نعم |
| `email` | مدخل حتى 254 حرفًا، Zod email بعد trim، حروف domain صغيرة فقط؛ لا تغيير للجزء المحلي أو aliases | نعم |
| `professionalStatus` | إحدى `PERMANENT/TRAINEE/CONTRACT/TEMPORARY_CONTRACT` حصريًا | نعم |
| `employedAt`, `confirmedAt` | تاريخ تقويمي صحيح `YYYY-MM-DD`، غير مستقبلي | نعم |
| `qualifications` | نص 1..1000 Unicode code points بعد trim؛ محارف التحكم مرفوضة، بلا اختزال فراغات ذات معنى | نعم |

لا تطبيع إضافيًا للحروف العربية أو نقلًا صوتيًا أو طيًّا للحروف أو إزالةً للتشكيل. تحفظ حقول الاسم/المكان وفق تنظيف ADR-015؛ NFC معيار **مقارنة التشابه فقط** في ADR-011، لا تحويل تخزين جديد ضمن TASK-035. الهاتف والبريد ليسا إثبات ملكية ولا OTP. بعد دمج PATCH مع القيم الحالية، إن وُجد `birthDate` و`employedAt` فالأخير بعد الأول، وإن وُجد `employedAt` و`confirmedAt` فالثاني لا يسبقه؛ كل تاريخ غير مستقبلي. عند غياب أحد طرفَي مقارنة تُترك القيمة الأخرى دون تخمين. لا حد عمر/أقدمية رسمي. لا uniqueness لبيانات شخصية ولا merge أو تنبيه تشابه جديد.

لا يطلب PATCH `expectedVersion` أو `updatedAt` precondition في MVP؛ يُحدث الحقول المرسلة وحدها، وتغلب آخر كتابة ناجحة للحقل نفسه عند التزامن. لا يلغي حقلٌ محذوف تعديلات مفتش آخر. إذا لم يتغير أي حقل بعد التطبيع، يعاد GET الحالي دون UPDATE أو AuditLog أو تغيير `updatedAt`. وعند تغير حقل واحد على الأقل، يتم UPDATE وإضافة `TEACHER_PROFILE_UPDATED` في Prisma transaction واحدة؛ metadata `{changedFields:[<أسماء الحقول المتغيرة فقط>]}` بقيم فريدة مرتبة من allowlist، بلا قيم قديمة/جديدة أو PII. actor/district/entity/requestId من السياق المصرح؛ فشل audit يرجع التعديل. لا تغيير في submission أو Institution/Assignment أو إنشاء Teacher ثانٍ.

### Public Teacher intake — historical G3 contract (TASK-030)

`POST /public/districts/:districtId/submissions` يستقبل JSON بحقول مطلوبة: `firstName`, `lastName`, `dateOfBirth`, `placeOfBirth`, `phone`, `email`, `professionalStatus`, `employmentDate`, `primaryInstitutionName`؛ واختيارية: `confirmationDate`, `qualifications`, `notes`, `additionalInstitutionNames`. `confirmationDate` يقابل مصطلح Teacher `confirmedAt`. `qualifications` نص اختياري فقط؛ `additionalInstitutionNames` مصفوفة نصوص اختيارية فقط. `districtId` من المسار وحده ولا يقبل في body أو من IP؛ لا `institutionId` ولا selector. لا `Idempotency-Key` مطلوب لهذا المسار؛ كل POST مستقل.

| الحقل | حد الإدخال بعد trim / قاعدة القيمة |
|---|---|
| `firstName`, `lastName` | مطلوب؛ 1..100 Unicode code points لكل منهما |
| `dateOfBirth`, `employmentDate` | مطلوب؛ تاريخ تقويمي صحيح `YYYY-MM-DD` |
| `placeOfBirth` | مطلوب؛ 1..150 Unicode code points |
| `phone` | مطلوب؛ حتى 20 حرفًا في الإدخال قبل التطبيع؛ قاعدة الرقم أدناه |
| `email` | مطلوب؛ حتى 254 حرفًا؛ Zod email؛ domain بحروف صغيرة عند التخزين |
| `professionalStatus` | مطلوب؛ واحدة من `PERMANENT` (مرسم)، `TRAINEE` (متربص)، `CONTRACT` (متعاقد)، `TEMPORARY_CONTRACT` (متعاقد مؤقت)؛ تُرسل القيمة الثابتة، لا التسمية العربية؛ تخزن string لا PostgreSQL enum |
| `confirmationDate` | اختياري؛ تاريخ تقويمي صحيح `YYYY-MM-DD` |
| `qualifications`, `notes` | نصان اختياريان؛ حتى 1000 و2000 Unicode code points على الترتيب |
| `primaryInstitutionName` | مطلوب؛ 1..200 Unicode code points |
| `additionalInstitutionNames` | اختياري؛ 0..5 نصوص، كل نص 1..200 Unicode code points |

تُزال الفراغات المحيطة من النصوص. النص المطلوب الفارغ بعد ذلك مرفوض، والنص الاختياري إن أُرسل فارغًا مرفوض؛ الاختياري إما محذوف أو صالح، لا `null`. تُرفض محارف التحكم؛ يسمح في `notes` فقط بـLF/CR/TAB للحفاظ على الأسطر والمسافات. العربية وUnicode مقبولان. تُختزل الفراغات المتكررة في الأسماء ومكان الميلاد وأسماء المؤسسات، ويُزال فراغ عرض الهاتف عند تطبيعه؛ لا تُختزل فراغات أو أسطر الملاحظات ذات المعنى. تقاس الأطوال بعد تنظيف النص، بعدد Unicode code points، لا UTF-16 code units. المقارنة لمنع تكرار أسماء المؤسسات داخل الإرسال تستخدم الاسم بعد trim واختزال الفراغات ومقارنة غير حساسة لحالة الحروف؛ يُرفض تكرار الاسم الأساسي ضمن الإضافية أو تكرار إضافيتين. لا بحث أو مطابقة في جدول Institution.

التواريخ ليست timestamps: تتحقق صيغة `YYYY-MM-DD` واليوم التقويمي الفعلي؛ لا تاريخ ميلاد أو توظيف أو ترسيم مستقبلي؛ التوظيف بعد الميلاد، والترسيم لا يسبق التوظيف. لا حد عمر أو مدة خدمة مفترضة. الهاتف يقبل محليًا `0` مع 8 أرقام وطنية للهاتف الثابت الجغرافي (بادئة وطنية 2–4)، أو `0` مع 9 أرقام وطنية للمحمول (بادئة وطنية 5–7)، ويقبل الصيغتين الدوليتين المكافئتين مع `+213` بدل `0`. تُقبل مسافات العرض البسيطة بين مجموعات الأرقام؛ لا أحرف أو إضافات أو أرقام قصيرة. يُخزن `+213` متبوعًا بالرقم الوطني (8 أو 9 أرقام)، ولا يدل ذلك على ملكية الرقم. راجع [خطة الترقيم للهيئة الجزائرية](https://www.arpce.dz/fr/service/num)؛ تحدد 10 أرقام محلية للمحمول و9 للثابت الجغرافي مع الصفر المحلي. البريد لا يثبت ملكية أو هوية، ولا يُستخدم اختلاف حالة أحرفه وحده لإثبات تكرار.

مخطط Zod صريح وصارم: المفاتيح العليا غير المعروفة مرفوضة، وكذلك أي مفاتيح داخل بنية مستقبلية؛ الحقول المطلوبة لا تقبل `null`، ولا مصفوفة سوى `additionalInstitutionNames`. JSON المعطوب يعيد `400` بالغلاف المعتاد دون صدى للقيم؛ لا عمل parser خاص لمفاتيح JSON المكررة في MVP ولا mass assignment.

محدد المعدل لهذا المسار: 10 طلبات لكل عنوان IP موثوق خلال 15 دقيقة بنافذة متحركة؛ تحسب المحاولات الناجحة ومرفوضة validation. تجاوز الحد يعيد `429` بالغلاف المعتاد مع `Retry-After` بالثواني. في production، يتطلب المصدر الموثوق ضبط `TRUSTED_CLIENT_IP_SOURCE=cloudflare` واستخدام `CF-Connecting-IP` مع حصر الوصول عبر ingress الموثوق في Render/Cloudflare؛ لا تُقبل قيمة `X-Forwarded-For` مطلقًا. في بيئات التطوير/الاختبار يستخدم عنوان socket المباشر. عند تعذر تحديد IP موثوق يعاد فشل مؤقت عام ولا يُتجاوز المحدد. تخزين العدّاد في ذاكرة عملية API الواحدة مقبول في MVP؛ يعاد ضبطه عند restart. يفترض هذا العقد نسخة API واحدة فقط؛ قبل نشر عدة نسخ يلزم محدد معدل مشترك أو موثوق على الحافة، ولا Redis ضمن TASK-030. يبقى حد JSON العام 32KB دون حد مسار إضافي.

UUID المقاطعة المشوه يعيد `400` عامًا؛ مقاطعة غير موجودة أو بلا `InspectorDistrictMembership` سارية حاليًا تعيد `404` عامًا بلا تفصيل سبب الرفض. السريان: `validFrom <= now` و(`validTo IS NULL` أو `validTo > now`). لا public district discovery؛ لا سياسة أرشفة District لأنه لا يملك `archivedAt` حاليًا.

كل POST صالح ينشئ TeacherSubmission مستقلًا، غير متحقق منه وبحالة داخلية `PENDING`، ولا ينشئ Teacher أو Institution أو Assignment أو AuditLog. لا تعديل عام، correction token، receipt lookup أو status lookup. الاشتباه بالتكرار لا يمنع الإرسال ولا يظهر للمرسل؛ المرشحون للمفتش فقط لاحقًا وفق TASK-032/ADR-011. النجاح `202` وجسمه **بالضبط** `{ "data": { "receiptId": "<TeacherSubmission UUID>" } }`، مع `Cache-Control: no-store`، دون profile أو `PENDING` أو duplicate information. receiptId ليس توثيقًا أو تفويضًا أو رمز تصحيح، ولا يتيح استعلام حالة عامًا.

لا PII في logs/errors ولا personal lookup. تدقيق قرارات المفتش لاحقًا وفق TASK-034/ADR-025. حدود التخزين في [DATABASE](DATABASE.md) والسياسة في [ADR-015](DECISIONS.md#adr-015--public-teacher-intake-fields-and-handling).

### Public workplace intake — forward contract (TASK-041)

من تشغيل TASK-041 يستعمل `POST /public/districts/:districtId/submissions` الحقول الشخصية المطلوبة/الاختيارية والتحقق والتوجيه والحد 32KB وrate limit ورد `202` والإيصال والخصوصية عينها في عقد G3 أعلاه، لكن بدل `primaryInstitutionName` و`additionalInstitutionNames` يقبل **فقط** الكائن المطلوب `workplace` التالي:

```json
{"workplace":{"institutionName":"ابتدائية مثال","municipality":"بلدية مثال","institutionAddress":"عنوان مثال","directorPhone":"+213555123456"}}
```

جميع مفاتيح `workplace` الأربعة مطلوبة، نصوص غير فارغة ولا تقبل `null`؛ الحدود والتطبيع في [عقد مكان العمل](#post-g3-workplace-contract-adr-029). يرفض Zod strict أي مفتاح إضافي داخل الكائن أو خارجه، خصوصًا حقلي G3 القديمين في **POST جديد**؛ لا مؤسسات إضافية ولا `institutionId` أو `districtId` في body. هذا مثال لشكل الكائن لا رقم هاتف صالحًا للاختبار؛ يطبق الخادم قاعدة الهاتف الجزائري الموثقة. كل POST يبقى snapshot مستقلًا غير متحقق `PENDING`، ولا ينشئ Teacher أو Institution أو رابط مؤسسة أو AuditLog، ولا يطابق مؤسسة قائمة أو يكشف التكرار. لا public edit أو status lookup.

الطلبات المخزنة قبل TASK-041 تبقى بصيغة G3 ولا تُعاد كتابتها. قارئ الطلب للمفتش يتعرف على الشكلين دون تخمين قيم مفقودة؛ `GET /submissions` يبقي `primaryInstitutionName` كاسم حقل **عرض متوافق** مستمد من الاسم القديم أو `workplace.institutionName` الجديد، وتعرض واجهة التفصيل بيانات workplace الجديدة أو الاسم والأسماء الإضافية التاريخية القديمة مع وسم واضح. `GET /teachers/:id` المستقبلي يعرض `declaredWorkplace` الموحّد و`currentInstitution` المعتمدة منفصلين كما أعلاه. لا يتيح ذلك إرسال شكل G3 القديم من جديد بعد تفعيل العقد الجديد، ولا يُعاد تفسير الأسماء الإضافية القديمة كروابط حالية.

الطباعة: `/print` route داخل الواجهة يجلب snapshot موثقًا من endpoints أعلاه؛ `@media print` A4، حفظ PDF من المتصفح. لا يُعلن عن API لملف PDF مولد على الخادم قبل إثبات الحاجة. رفع الملفات وTrainingEvent CRUD عقود مؤجلة؛ foundations في [DATABASE](DATABASE.md) لا تعني endpoints عاملة. تفاصيل الحالة في [UI_MAP](UI_MAP.md).
