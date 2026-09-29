# API Contracts v0.1

HTTP JSON `/api/v1`. هذه عقود الموارد والسلوك؛ schemas التفصيلية تتبع حقول [DATABASE](DATABASE.md)، ولا يجوز للمنفذ اختراع حقول بيداغوجية رسمية. كل request/response متحقق بـZod؛ unknown input rejected أو stripped وفق schema منشور، لا mass assignment. `Id` UUID، تواريخ ISO 8601 UTC، `weekday` محلي 0..6 محدد في العقد التنفيذي. الحقول الناقصة في API تُعالج بإصدار contract موثق، لا بافتراض صامت.

## غلاف واستعمال مشترك

نجاح القراءة: `{data, page?: {limit,nextCursor,total?}}`. خطأ: `{error:{code,message,fields?,requestId}}` بلا بيانات شخصية في الرسائل العامة. القائمة `limit` افتراضي 25 وأقصى 100، cursor ثابت وsort allowlist، query `q` مطبّع محدود الطول. رموز: 400 validation، 401 unauthenticated، 403 forbidden، 404 not found within authorized scope (لا يكشف cross-district)، 409 state conflict، 429 rate limit، 500 generic. جميع mutations المسجلة تحمل requestId. لا يتطلب مسار قرار submission `Idempotency-Key` لأي إجراء في MVP وفق ADR-027؛ ولا يتطلبه public submission حيث كل POST عام ينشئ سجلًا مستقلًا وفق ADR-015. لا يقرر هذا استرجاع نتائج لعمليات مستقبلية.

عند تدقيق HTTP mutation لاحقًا، تمرر خدمة المورد `requestId` الذي يولده الخادم إلى append service داخل Prisma transaction نفسها؛ لا يُقبل من جسم الطلب أو header عميل. NULL في حقل DB محجوز لفعل آلي موثوق مستقبلًا. TASK-025 يؤسس التخزين والخدمة فقط ولا يضيف endpoint؛ `/audit-events` GET عقد لاحق منفصل. انظر [ADR-025](DECISIONS.md#adr-025--auditlog-event-payload-and-append-contract).

جلسة المفتش في cookie آمنة `HttpOnly`, و`Secure` في production، و`SameSite=Strict`. يقبل `POST /auth/login` جسم `{email,password}`؛ الحساب `ACTIVE` فقط يستطيع الدخول. تنشأ Session ثابتة لمدة 8 ساعات من `createdAt` (`expiresAt = createdAt + 8h`) دون sliding expiration أو Remember Me، وعمر cookie لا يتجاوز `expiresAt`. يخزن الخادم hashًا لرمز الجلسة مع `tokenHash` فريد؛ `GET /auth/me` يتحقق من عدم انتهاء الجلسة أو إبطالها ومن بقاء Inspector بحالة `ACTIVE`. `POST /auth/logout` يبطل الجلسة الحالية فقط.

تتطلب cookie mutations قيمة CSRF في cookie `inspector_csrf` ورأس `X-CSRF-Token` مطابق. `GET /auth/me` غير المصادق عليه يهيئ CSRF cookie ثم يعيد 401؛ بعد login ترتبط قيمة CSRF بالجلسة. لا تميّز ردود فشل login بين حساب مفقود أو كلمة مرور خاطئة أو حساب `INACTIVE`. فحص district membership وملكية كل مورد في service. لا JWT/teacher session ولا endpoints عامة لملفات Teacher. حماية public intake في TASK-030 بمحدد معدل وstrict validation وحد JSON؛ تحدٍ أو CAPTCHA/WAF تقوية مستقبلية فقط عند ثبوت الحاجة، وليست شرطًا في TASK-030. لا تعرض duplicate candidates للمُرسل.

## الموارد

| Endpoint | العمليات | نطاق الإدخال/الإخراج والحماية |
|---|---|---|
| `/public/districts/:districtId/submissions` | POST | حقول Teacher المطلوبة/الاختيارية وأسماء مؤسسات معلنة كنصوص وفق ADR-015؛ district من المسار؛ ينشئ TeacherSubmission مستقلًا بحالة داخلية PENDING؛ `202` وreceipt ID فقط بلا PII أو status أو duplicate disclosure؛ لا lookup |
| `/submissions` | GET | Inspector مصادق؛ `status` افتراضيًا `PENDING`، و`districtId`, `q`, cursor وفق العقد؛ قائمة scoped ومؤشر `hasPotentialDuplicates` منطقي دون تفاصيل المرشحين |
| `/submissions/:id` | GET | بيانات الطلب للمفتش المصرح و`potentialDuplicates` بأسباب التشابه فقط؛ 404 عام خارج النطاق |
| `/submissions/:id/decision` | POST | عقد TASK-033/034 أدناه؛ ACTIVE Inspector، CSRF، district scope؛ 409 عند تعارض الحالة |
| `/institutions` | GET/POST | district-scoped، q/pagination؛ create للمفتش المصرح |
| `/institutions/:id` | GET/PATCH | نسخة جزئية مصرح بها؛ archive endpoint منفصل |
| `/teachers` | GET | q, district, institution, professionalStatus, recordStatus, visited/from/to, weekday/time filters؛ indexed/server-side |
| `/teachers/:id` | GET/PATCH | ملف مهني حالي وفق عقد TASK-035 أدناه؛ لا حساب مستخدم أو تحرير إسنادات/زيارات |
| `/teachers/:id/assignments` | GET/POST | kind, workloadMinutes, validity؛ تحقق من district وhistorical overlap |
| `/assignments/:id` | PATCH/POST archive | change بإغلاق interval/نسخة جديدة عند اللزوم، لا rewrite للتاريخ |
| `/teachers/:id/schedules` | GET/POST | academicYear/revision؛ GET structured slots |
| `/schedules/:id/slots` | POST | assignmentId, weekday, start/endMinute, level/group label؛ يتحقق من الصلاحية والتداخل |
| `/slots/:id` | PATCH/DELETE | تعديل draft schedule فقط؛ النسخ المعتمدة لا تُمسح بصمت |
| `/visits` | GET/POST | teacherId, institutionId, scheduledAt، status، filter by date |
| `/visits/:id` | GET/PATCH | وصف هيكلي؛ لا حقول تقييم رسمية |
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

### Authenticated District context

`GET /me/districts` requires a valid session belonging to an `ACTIVE` Inspector. It returns exactly `{items:[{id,name}]}` for distinct Districts with a current membership for that Inspector (`validFrom <= now` and `validTo IS NULL OR validTo > now`). Expired and future memberships are excluded. The client cannot request or broaden District scope; membership identifiers and validity dates are not returned. No pagination or District mutation/CRUD is provided.

### Institution list/create (TASK-023)

- `GET /institutions` lists Institutions only in the authenticated Inspector's current District memberships. Optional `districtId` narrows the list and must be in scope; an out-of-scope District is returned as generic 404. `q` is a trimmed, bounded case-insensitive name search; `limit` defaults to 25 and is capped at 100; cursor pagination has a stable `name,id` order. Only `archivedAt = NULL` rows are considered, including search results, pagination, and `page.total`; no archived selector is defined in this task. Response is `{data, page:{limit,nextCursor,total}}`.
- `POST /institutions` accepts only `{districtId,name,externalCode?}`. District membership is required; an out-of-scope District returns generic 404. No update, delete, archive, or unarchive operation is introduced by TASK-023.
- Archive semantics are defined by [ADR-024](DECISIONS.md#adr-024--institution-archive-list-policy).

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

### Public Teacher intake (TASK-030)

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

الطباعة: `/print` route داخل الواجهة يجلب snapshot موثقًا من endpoints أعلاه؛ `@media print` A4، حفظ PDF من المتصفح. لا يُعلن عن API لملف PDF مولد على الخادم قبل إثبات الحاجة. رفع الملفات وTrainingEvent CRUD عقود مؤجلة؛ foundations في [DATABASE](DATABASE.md) لا تعني endpoints عاملة. تفاصيل الحالة في [UI_MAP](UI_MAP.md).
