# API Contracts v0.1

HTTP JSON `/api/v1`. هذه عقود الموارد والسلوك؛ schemas التفصيلية تتبع حقول [DATABASE](DATABASE.md)، ولا يجوز للمنفذ اختراع حقول بيداغوجية رسمية. كل request/response متحقق بـZod؛ unknown input rejected أو stripped وفق schema منشور، لا mass assignment. `Id` UUID، تواريخ ISO 8601 UTC، `weekday` محلي 0..6 محدد في العقد التنفيذي. الحقول الناقصة في API تُعالج بإصدار contract موثق، لا بافتراض صامت.

## غلاف واستعمال مشترك

نجاح القراءة: `{data, page?: {limit,nextCursor,total?}}`. خطأ: `{error:{code,message,fields?,requestId}}` بلا بيانات شخصية في الرسائل العامة. القائمة `limit` افتراضي 25 وأقصى 100، cursor ثابت وsort allowlist، query `q` مطبّع محدود الطول. رموز: 400 validation، 401 unauthenticated، 403 forbidden، 404 not found within authorized scope (لا يكشف cross-district)، 409 state conflict، 429 rate limit، 500 generic. جميع mutations المسجلة تحمل requestId؛ `Idempotency-Key` مطلوب لقبول submission وللعمليات القابلة للتكرار.

عند تدقيق HTTP mutation لاحقًا، تمرر خدمة المورد `requestId` الذي يولده الخادم إلى append service داخل Prisma transaction نفسها؛ لا يُقبل من جسم الطلب أو header عميل. NULL في حقل DB محجوز لفعل آلي موثوق مستقبلًا. TASK-025 يؤسس التخزين والخدمة فقط ولا يضيف endpoint؛ `/audit-events` GET عقد لاحق منفصل. انظر [ADR-025](DECISIONS.md#adr-025--auditlog-event-payload-and-append-contract).

جلسة المفتش في cookie آمنة `HttpOnly`, و`Secure` في production، و`SameSite=Strict`. يقبل `POST /auth/login` جسم `{email,password}`؛ الحساب `ACTIVE` فقط يستطيع الدخول. تنشأ Session ثابتة لمدة 8 ساعات من `createdAt` (`expiresAt = createdAt + 8h`) دون sliding expiration أو Remember Me، وعمر cookie لا يتجاوز `expiresAt`. يخزن الخادم hashًا لرمز الجلسة مع `tokenHash` فريد؛ `GET /auth/me` يتحقق من عدم انتهاء الجلسة أو إبطالها ومن بقاء Inspector بحالة `ACTIVE`. `POST /auth/logout` يبطل الجلسة الحالية فقط.

تتطلب cookie mutations قيمة CSRF في cookie `inspector_csrf` ورأس `X-CSRF-Token` مطابق. `GET /auth/me` غير المصادق عليه يهيئ CSRF cookie ثم يعيد 401؛ بعد login ترتبط قيمة CSRF بالجلسة. لا تميّز ردود فشل login بين حساب مفقود أو كلمة مرور خاطئة أو حساب `INACTIVE`. فحص district membership وملكية كل مورد في service. لا JWT/teacher session ولا endpoints عامة لملفات Teacher. حماية public intake من spam بمحدد معدل ووسيلة تحدٍ قابلة للضبط؛ لا تعرض duplicate candidates للمُرسل.

## الموارد

| Endpoint | العمليات | نطاق الإدخال/الإخراج والحماية |
|---|---|---|
| `/public/districts/:districtId/submissions` | POST | Public minimal profile + institution selections/notes وفق نموذج معتمد؛ يرجع receipt ID فقط و202؛ لا lookup شخصي |
| `/submissions` | GET | inspector، `status`, `districtId`, `q`, cursor؛ لا قبول آلي |
| `/submissions/:id` | GET | البيانات والمرشحات المحتملة للمفتش فقط |
| `/submissions/:id/decision` | POST | `{action:ACCEPT/REJECT/INTERNAL_REVIEW, expectedStatus, reason?}`؛ ACCEPT ينشئ Teacher مرة واحدة مع AuditLog؛ 409 عند السباق |
| `/institutions` | GET/POST | district-scoped، q/pagination؛ create للمفتش المصرح |
| `/institutions/:id` | GET/PATCH | نسخة جزئية مصرح بها؛ archive endpoint منفصل |
| `/teachers` | GET | q, district, institution, professionalStatus, recordStatus, visited/from/to, weekday/time filters؛ indexed/server-side |
| `/teachers/:id` | GET/PATCH | ملف مهني، الإسنادات/الزيارات روابط موارد؛ لا حساب مستخدم |
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

الطباعة: `/print` route داخل الواجهة يجلب snapshot موثقًا من endpoints أعلاه؛ `@media print` A4، حفظ PDF من المتصفح. لا يُعلن عن API لملف PDF مولد على الخادم قبل إثبات الحاجة. رفع الملفات وTrainingEvent CRUD عقود مؤجلة؛ foundations في [DATABASE](DATABASE.md) لا تعني endpoints عاملة. تفاصيل الحالة في [UI_MAP](UI_MAP.md).
