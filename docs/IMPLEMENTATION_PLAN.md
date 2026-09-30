# Implementation Plan v0.1

خطط المهام تنفيذ لاحق، لا إذن بالبرمجة الآن. كل Task ID ثابت ويُنفذ وحده وفق [CODEX_RULES](CODEX_RULES.md). `Gate` رقم المرحلة؛ لا يبدأ التالي قبل تحقق معاييرها. اقرأ وثائق النوع من قواعد Codex. `Tests` تشير إلى [TEST_STRATEGY](TEST_STRATEGY.md). إذا احتاجت المهمة قرارًا OPEN، توقف عند الحدود الواضحة. ملفات/مسارات `src/...` متوقعة فقط، لا توجد الآن.

## Phase 0 — Architecture gate G0

| ID/status | Objective; Scope | Dependencies; Expected areas | Acceptance Criteria; Tests | Out of Scope; Gate |
|---|---|---|---|---|
| TASK-000 COMPLETED | تدقيق ArenaSPEX انتقائي read-only | Master؛ `docs/audits/ARENASPEX_REUSE_AUDIT.md` | مسارات محددة، تصنيف منفرد، مخاطر ومنع النقل موثقة؛ تحقق مراجعة الوثيقة | نقل الكود؛ G0 |
| TASK-001 COMPLETED | مراجعة OPEN عالية التأثير وتثبيت الموافقات اللازمة قبل التنفيذ المتعلق بها | TASK-000؛ `docs/DECISIONS.md` | لكل قرار owner ونتيجة تأجيل موثقة في سجل G0؛ review مكتمل | تعديل Master؛ G0 |

G0: Master/audit/contracts متسقة؛ TASK-000 مكتمل؛ لا تفتح feature يتطلب OPEN غير محسوم.

مراجعة TASK-001: لا قرار من ADR-010..ADR-017 يمنع TASK-010. بقيت حالاتها كما هي؛ راجع سجل المالك وموعد إعادة العرض في [DECISIONS](DECISIONS.md). التأجيل لا يمنح موافقة لأي ميزة لاحقة.

## Phase 1 — foundation gate G1

| ID | Objective; Scope | Dependencies; Expected areas | Acceptance Criteria; Tests | Out of Scope; Gate |
|---|---|---|---|---|
| TASK-010 COMPLETED | Bootstrap TypeScript workspace، scripts/typecheck/lint/build/CI | G0؛ root config, `packages/web`, `packages/api` | clean install/build/typecheck/lint succeeds؛ smoke | feature code؛ G1 |
| TASK-011 COMPLETED | Shared design tokens وRTL shell | 010؛ `packages/web/src/ui`, styles | Arabic/RTL base، token roles، focus states؛ visual/keyboard | branding نهائي؛ G1 |
| TASK-012 COMPLETED | Shared Button/Input/Card/Dialog/State/Table primitives | 011؛ `packages/web/src/ui` | variants/states accessible، no feature colors؛ component/UI tests | feature screens؛ G1 |
| TASK-013 COMPLETED | API skeleton, requestId, error envelope, Zod boundary | 010؛ `packages/api/src/http`, shared schemas | contract errors, health, no PII logs؛ API tests | business endpoints؛ G1 |

G1: build/typecheck/lint وRTL/keyboard baseline وAPI error tests ناجحة.

## Phase 2 — identity and core persistence gate G2

| ID | Objective; Scope | Dependencies; Expected areas | Acceptance Criteria; Tests | Out of Scope; Gate |
|---|---|---|---|---|
| TASK-020 COMPLETED | Migration District/Inspector/Membership/Session | G1؛ `prisma`, identity | FK/index/clean migration؛ DB integration | teacher account؛ G2 |
| TASK-021 COMPLETED | Login/logout/session revoke/CSRF | 020,013؛ identity routes/client login | fixed 8h ACTIVE-only sessions, CSRF, cookie flags and logout; isolated DB integration + UI tests | OAuth؛ G2 |
| TASK-022 COMPLETED | District scope policy helper + Inspector membership date/overlap constraints | 021؛ server policy, Prisma migration | current membership scope; cross-district 404; history/overlap integration tests PASS | broad RBAC UI, Teacher transfer؛ G2 |
| TASK-023 COMPLETED | Migration Institution + scoped list/create | 022؛ prisma/institutions | q/pagination/validation; integration | bulk geo import؛ G2 |
| TASK-024 COMPLETED | Institution list/form UI | 023,012؛ client institutions | RTL states and CRUD per API; UI/E2E | map integration؛ G2 |
| TASK-025 COMPLETED | AuditLog migration + append service | 020؛ prisma/audit | sensitive action logged transactionally, redaction; integration | analytics log pipeline؛ G2 |

G2: scoped auth, institution CRUD, audit tests and migration check pass.

## Phase 3 — public intake and teacher record gate G3

| ID | Objective; Scope | Dependencies; Expected areas | Acceptance Criteria; Tests | Out of Scope; Gate |
|---|---|---|---|---|
| TASK-030 COMPLETED | TeacherSubmission migration/public POST with rate limit | G2 + ADR-015 for required fields؛ prisma/intake | 202 receipt, no lookup/leak, input limits; abuse/integration؛ clean isolated migration + all TASK-030 checks PASS | teacher creation؛ G3 |
| TASK-031 COMPLETED | Public form RTL + receipt state | 030,012؛ client/public | validation, submit/loading/error/success; E2E | teacher login؛ G3 |
| TASK-032 COMPLETED | Inspector submissions list/detail and duplicate candidates | 030,022؛ server/intake + client/intake | scoped list, candidates only inspector, no merge; unit/UI/integration PASS | auto decision؛ G3 |
| TASK-033 COMPLETED | Reusable review decision UI/client contract; explicit confirmations | 032,026； client/intake | status/action matrix, duplicate warning, 409 feedback, component/UI tests PASS | no production activation before TASK-034; no mass approval؛ G3 |
| TASK-034 COMPLETED | Teacher migration + decision API + atomic accept/reject/internal review; integrate/enable TASK-033 controls | 032,025,026,027؛ prisma/intake/teacher + client integration | Teacher mapping/nullable fields and one Teacher on accept، exact transitions، `409` stale/repeated/concurrent، audit rollback، DB/API integration؛ remove TASK-033 client's ACCEPT `Idempotency-Key` header؛ isolated clean migration, integration/UI/regression PASS | no Assignment/Institution creation, idempotency storage/replay, Teacher profile CRUD or Teacher duplicate-comparison engine؛ G3 |
| TASK-035 COMPLETED | Teacher profile GET/PATCH + Arabic RTL read/edit UI؛ رابط من تفصيل الطلب المقبول | 034,027,028؛ server/teacher، authorized submission detail، client/teacher | current district scope، exact profile/declared-intake read model، strict partial PATCH/null/date/contact rules، audit rollback، source snapshot unchanged؛ DB/API/UI + G3 flow | Teacher list/search (044/045)، status/archive/transfer/assignment/visit، migration؛ G3 |

G3: **CLOSED / PASS** بعد نجاح `npm run e2e:g3` في Chromium: browser → Vite web → local API → PostgreSQL المعزولة، على schema مؤقتة تطبق migration chain وتُحذف بعد التشغيل. غطى التدفق الإرسال العام، دخول المفتش ومراجعة الطلب والتنبيه غير الحاجب للتشابه، القبول وإنشاء Teacher واحد، فتح الملف وتعديله وتحقق audit وثبات snapshot وإعادة التحميل، ثم الرفض والإحالة للمراجعة الداخلية فالقبول. كما نجحت اختبارات regression بما فيها 72 قاعدة بيانات/تكاملية. TASK-030/031/032/033/034/035 تبقى COMPLETED؛ لا يغيّر ذلك حدود TASK-040 أو أي قرار منتج. `DECISION_UI_RELEASE_GATE = OPEN` مستقل عن G3 ولا يُغلق بهذا الدليل. عقد PATCH في [API_CONTRACTS](API_CONTRACTS.md#teacher-profile-task-035).

TASK-034 migration محدودة بجدول Teacher وعلاقته بـDistrict وFK/uniqueness لرابط `TeacherSubmission.acceptedTeacherId` والفهارس اللازمة للنطاق؛ لم تُعدّل migrations سابقة ولم يُضف جدول idempotency أو مجالات مستقبلية. مصدر المقارنة الحالي في ADR-011 يبقى الطلبات `PENDING/INTERNAL_REVIEW`؛ المقبول مستبعد، وإضافة Teacher إلى مرشحي التشابه تحتاج مهمة وعقد قراءة مستقلين حتى لا يظهر المصدر ونتيجته مرتين. TASK-035 يملك GET/PATCH وواجهة الملف، لا TASK-034؛ `districtId` غير قابل للتعديل والتصريحات المؤسسية سياق intake للقراءة فقط إن عُرضت، وتُحسم حقول PATCH الدقيقة قبل التنفيذ.

ADR-015 ACCEPTED: قرار Product Owner لحقول public intake والتوجيه والتحقق والتكرار والتصحيح وحدود إدخال MVP موثق في [DECISIONS](DECISIONS.md#adr-015--public-teacher-intake-fields-and-handling) و[API_CONTRACTS](API_CONTRACTS.md#public-teacher-intake-task-030). TASK-030 اكتملت بعد clean isolated migration وكل التحققات، وTASK-031 اكتملت كواجهة عامة؛ لا يعني ذلك إغلاق G3. يُراجع مسار مطابقة/اعتماد أسماء المؤسسات المعلنة قبل TASK-034/TASK-040 دون تغيير نطاقهما الآن.

## Phase 4 — current workplace, schedule, search gate G4

[ADR-029](DECISIONS.md#adr-029--one-current-teacher-workplace-after-g3) يحل محل افتراض الإسنادات المتعددة بعد G3، و[ADR-030](DECISIONS.md#adr-030--weekly-schedule-mvp-contract) يحسم جدول MVP قبل TASK-047. لا يُعاد تنفيذ TASK-030..035 أو تعديل migrations السابقة. IDs `TASK-044/045` تبقى للدليل/البحث؛ تسلسل التنفيذ الفعلي هو `040 → 041 → 042 → 043 → 046 → 047 → 048 → 044 → 045` لأن بحث اليوم/الوقت يعتمد على الجدول.

| ID | Objective; Scope | Dependencies; Expected areas | Acceptance Criteria; Tests | Out of Scope; Gate |
|---|---|---|---|---|
| TASK-040 COMPLETED | Forward migration: Institution municipality/address/directorPhone nullable + Teacher.institutionId nullable | G3, ADR-029؛ prisma/institution/teacher | clean+upgrade على قاعدة اختبار، صفوف G2/G3 بلا backfill، FK مركب يمنع cross-district، Teacher بلا رابط أو برابط واحد، لا تغيير migration سابق؛ persistence/regression gates PASS | Assignment/جدول/تدفق اعتماد/API؛ G4 |
| TASK-041 COMPLETED | Public workplace intake evolution المتصل: API + RTL form + قرّاء الطلب التاريخي | 040, TASK-030/031/032, ADR-015/029؛ intake API/client وsubmission list/detail وprofile alias | POST جديد strict بأربعة حقول workplace مطلوبة وبلا مفاتيح G3 القديمة؛ form واحد وreceipt، عرض تصريح جديد/قديم، snapshot قديم ثابت، 202/limits/rate/privacy؛ connected G3 regression بعد تحديث fixture للشكل الجديد؛ جميع بوابات TASK-041 PASS | مطابقة Institution/قبول رابط؛ G4 |
| TASK-042 COMPLETED | Institution details API extension | 040, TASK-023/025, ADR-029؛ institutions/audit | list/create additive للحقول الجديدة، GET/PATCH scoped، CSRF لمسار POST القائم، validation/null clear/archived 409، audit إنشاء/تعديل بلا قيم PII؛ DB/API integration؛ جميع بوابات TASK-042 PASS | Teacher link/UI/auto-merge؛ G4 |
| TASK-043 COMPLETED | Current Teacher institution link API + read model | 040,041,042, TASK-035, ADR-029؛ teachers/institutions/audit | PUT اختيار/إنشاء ذري بشرط `expectedInstitutionId`، 404/409 وFK district، أحداث تدقيق، GET Teacher يميز currentInstitution عن declaredWorkplace؛ API/DB integration وكل بوابات المهمة PASS | UI/transfer history/weekly slots؛ G4 |
| TASK-046 COMPLETED | Teacher profile workplace review/link UI | 041,042,043,012؛ client/teacher/institution | معلن مقابل معتمد، حالة «لم تُعتمد مؤسسة حالية»، اختيار مؤسسة قائمة أو إنشاء صريح بتأكيد، استبدال الرابط بلا لغة نقل؛ RTL/states/E2E؛ بوابات المهمة PASS | auto-match/merge/جدول أسبوعي؛ G4 |
| TASK-047 COMPLETED | WeeklySchedule/WeeklyScheduleSlot persistence migration | 040,046,ADR-030؛ Prisma schema/migration | جدول واحد لكل Teacher/year، revision بلا history، يوم 1..7 ودقائق 0..1440، DB checks وفهرس وGiST exclusion للتداخل مع سماح التجاور؛ forward-only clean+upgrade migration وDB/integration PASS، بلا institutionId/assignmentId على slot | API/UI/AuditLog أو دليل Teacher أو عطلات/نقل؛ G4 |
| TASK-048 COMPLETED | Schedule API + weekly editor/read view | 047,012,ADR-030؛ server/client schedule | auth/district scope وCSRF، جدول السنة الحالي وslots متعددة/يوم، revision concurrency، تحقق/tداخل وأخطاء آمنة، منع mutation قبل مؤسسة حالية، AuditLog ذري آمن، محرر RTL؛ API/DB 98/98، UI 97/97، connected Playwright وكل بوابات المهمة PASS | حضور/عطلات/استثناءات أو نقل مؤسسة أو تاريخ نسخ؛ G4 |
| TASK-044 COMPLETED | Teacher search API + indexed filters | 048,035,043؛ server/teacher | `GET /api/v1/teachers` وفق [عقد TASK-044](API_CONTRACTS.md#teacher-directory-search-task-044-contract): نطاق المقاطعات الحالية، q، المؤسسة الحالية/غير المسندين، الحالة المهنية وحالة السجل، يعمل اليوم/الآن مع سنة دراسية صريحة، و`limit/cursor` خادميًا؛ اختبارات تكامل للنطاق والفلاتر والتصفح وعينة أداء 180+ PASS | لا search engine أو فلاتر زيارة قبل TASK-050، ولا فلتر بلدية الآن؛ G4 |
| TASK-045 COMPLETED | Teacher directory RTL UI | 044,012؛ `packages/web/src/teachers/TeacherDirectoryPage.tsx`، client/tests، connected Playwright | `/app/teachers`؛ بحث q مؤجل قصيرًا، district/institution/status/workplace/schedule filters بعقودها، سنة صريحة ووقت HH:mm، URL filter state، cursor history/total، تحميل/فراغ/خطأ، responsive accessible table، تنقل profile/schedule؛ 112 UI/unit + connected Tuesday-morning API E2E PASS | لا client filtering/pagination أو per-row fetch أو municipality filter؛ G4 |

G4: CLOSED / PASS — اكتملت مراجعة ربط مؤسسة حالية واحدة فقط بعد موافقة المفتش، وبقاء التصريح منفصلًا عن المعتمد، وجدول/بحث الثلاثاء صباحًا E2E، ومراجعة migrations والفهارس. اكتملت TASK-040..048 وTASK-044/045؛ دليل الواجهة يستخدم عقد البحث دون تغييره، واجتازت تغطية المتصفح المتصلة وبوابات التحقق. checkpoint تغييرات مكان العمل السابق موثق في سجل Git قبل TASK-047.

## Phase 5 — visits and reporting gate G5

| ID | Objective; Scope | Dependencies; Expected areas | Acceptance Criteria; Tests | Out of Scope; Gate |
|---|---|---|---|---|
| TASK-050 COMPLETED | PedagogicalVisit migration + scoped list/create/detail/reschedule/complete/cancel API وفق [ADR-031](DECISIONS.md#adr-031--pedagogicalvisit-scheduling-and-historical-context-task-050) | G4,025,ADR-031؛ prisma/visits + service/routes/audit؛ اقرأ [DB](DATABASE.md#pedagogicalvisit-persistence-contract-adr-031--task-050) و[API](API_CONTRACTS.md#pedagogical-visit-contract-adr-031--task-050) فقط للزيارة | clean+upgrade migration، لقطة Institution ودائرة تاريخيتان، teacher/institution scope، `PLANNED→COMPLETED/CANCELLED`، وقت بداية/نهاية، advisory schedule بإقرار صريح، منع التداخل في DB تحت السباق، revision وAuditLog ذري، list/cursor/validation/خصوصية؛ integration حسب TEST_STRATEGY وبوابات typecheck/lint/tests/build/diff-check: PASS | لا Visit UI أو نوع أو notes أو تقرير/شبكة تقييم/طباعة أو نقل Teacher؛ G5 |
| TASK-051 COMPLETED | Visit management UI: list/create/detail/reschedule/complete/cancel وفق [ADR-032](DECISIONS.md#adr-032--pedagogical-visit-management-ui-task-051) | 050,012,044,045,ADR-031/032؛ `packages/web/src/visits`، routing/nav وAPI client؛ اقرأ [UI](UI_MAP.md#task-051--visit-management-ui-adr-032)، [API](API_CONTRACTS.md#pedagogical-visit-contract-adr-031--task-050)، [Design](DESIGN_SYSTEM.md)، [Tests](TEST_STRATEGY.md#task-051--visit-management-ui) | list/filters/total/cursor، Teacher picker bounded، إنشاء وتنقل، تحذير الجدول بإقرار صريح، revision/overlap/workplace conflicts، انتقالات الحالة وتوقيت الجزائر/السنة الصريحة، التاريخ المؤسسي، loading/empty/error/RTL/keyboard/responsive؛ UI + connected browser وtypecheck/lint/tests/build/diff-check | لا TASK-052 أو تقرير/lesson memo، ولا API/schema/migration/dependency جديد أو طباعة، ولا بحث Visit نصي أو جلب صفوف كامل أو per-row fetch؛ G5 |
| TASK-052A COMPLETED | Inspector professional identity prerequisite: `name/surname` للمالك الحالي فقط | 021,025,ADR-012؛ `prisma/identity`, `identity` API، `/app/me/professional-identity`؛ اقرأ [DB](DATABASE.md#inspector-professional-identity-prerequisite-task-052a)، [API](API_CONTRACTS.md#inspector-professional-identity-task-052a)، [UI](UI_MAP.md#task-052a--inspector-professional-identity)، [Tests](TEST_STRATEGY.md#task-052a--inspector-professional-identity) | migration forward-only nullable بلا backfill؛ GET/PUT ذاتيان آمنان مع تحقق عربي/Unicode وCSRF/AuditLog ذري؛ واجهة RTL صريحة؛ login/session/ACTIVE وعضويات وIDs باقية؛ clean+upgrade migration وintegration/UI/connected browser وبوابات typecheck/lint/tests/build/diff-check: PASS | لا إدارة مفتشين أو إنشاء حساب أو تحرير email/password أو تقرير؛ G5؛ تُكمل قبل TASK-052 |
| TASK-052 COMPLETED | تقرير مرافقة بيداغوجية غير رسمي: persistence/API ومحرر RTL وحفظ DRAFT صريح وإتمام FINAL | 050,025,052A,ADR-012؛ `prisma/reports`, report service/routes/audit، `/app/visits/:id/report`؛ اقرأ [DB](DATABASE.md#inspectionreport-persistence-contract-adr-012--task-052)، [API](API_CONTRACTS.md#pedagogical-accompaniment-report-adr-012--task-052)، [UI](UI_MAP.md#task-052--pedagogical-accompaniment-report)، [Design](DESIGN_SYSTEM.md)، [Tests](TEST_STRATEGY.md#task-052--pedagogical-accompaniment-report) | migration واحدة forward-only؛ Visit واحدة/Report، DRAFT أثناء PLANNED/COMPLETED، FINAL فقط بعد COMPLETED ومع هوية المفتش المهنية؛ حقول محدودة وتحقق/لقطات هوية تاريخية؛ revision وسباقات إنشاء/حفظ/إتمام؛ AuditLog إتمام ذري؛ UI/unit + DB/API integration + connected browser، clean+upgrade، regressions G3/G4/051 وtypecheck/lint/tests/build/diff-check | لا قالب وزاري أو scoring أو تصحيح/نسخ أو حذف أو مرفقات أو توقيع رقمي؛ لا طباعة/A4/PDF (TASK-072)؛ G5 |
| TASK-053 | FollowUp entity/API + views | 052؛ prisma/followup, client | due/status/owner, alertable; integration/E2E | full training module؛ G5 |

G5: visit→report→follow-up E2E and final immutability pass.

## Phase 6 — pedagogical guidance gate G6

| ID | Objective; Scope | Dependencies; Expected areas | Acceptance Criteria; Tests | Out of Scope; Gate |
|---|---|---|---|---|
| TASK-060 | CurriculumSource/Item migration/read API | G2 + verified source ADR-013 for content؛ prisma/reference | provenance required; no fabricated official data; integration | bulk unverified import؛ G6 |
| TASK-061 | Reference library UI | 060,012؛ client/reference | source/authority labels, filters, RTL states; UI | reference editing by inspector؛ G6 |
| TASK-062 | Proposal/Revision/ReferenceLink migration + kind schemas | 060,025؛ prisma/proposals | immutable revisions, kind validation, separate source; unit/integration | official content mutation؛ G6 |
| TASK-063 | Proposal list/create/clone/archive API | 062؛ server/proposals | owner/district guard, clone new ID, audit; integration | public sharing؛ G6 |
| TASK-064 | Learning section editor + save revision UI | 063,012؛ client/proposals | create/edit/copy/archive with proposal badge; E2E | hard-coded official fields؛ G6 |
| TASK-065 | Annual plan/distribution editors | 063,064؛ client/proposals | separate kind schemas/views, revisions; E2E | mandatory formal taxonomy؛ G6 |
| TASK-066 | Lesson memo template editor/library for teachers | 063,064؛ client/proposals | no Visit/Report dependency, variants, revisions; E2E | inspector visit memo/AI generator؛ G6 |

G6: source/proposal separation and all four proposal kinds roundtrip tests pass. Unverified official data remains absent.

## Phase 7 — dashboard, print and release gate G7

| ID | Objective; Scope | Dependencies; Expected areas | Acceptance Criteria; Tests | Out of Scope; Gate |
|---|---|---|---|---|
| TASK-070 | Dashboard aggregate API with scoped time windows | G5؛ server/dashboard | count definitions, no cross-district data, empty states; integration | decorative charts؛ G7 |
| TASK-071 | Interactive dashboard UI | 070,012؛ client/dashboard | KPI links/pending/upcoming/alerts/activity, meaningful chart only; UI/E2E | false zero values؛ G7 |
| TASK-072 | Shared A4 print layouts + browser PDF save | 052,064,065,066؛ client/print | proposal/visit labels, RTL pagination/preview; print visual | server PDF service؛ G7 |
| TASK-073 | Restore/backup, logs, release migration/deploy runbook | 072؛ ops docs/config | staging restore verified, secrets env, health/log redaction, rollback plan; ops checks | production deploy without approval؛ G7 |
| TASK-074 | Full acceptance/regression/accessibility review | 073؛ tests/docs | gates G0–G7 evidence, desktop/mobile/print, no critical regressions; E2E/a11y | new features؛ G7 |

G7: MVP release candidate only after security/privacy, restore, migrations, full workflows and print checks pass. Future phase: training participation detail, regulated report template, object uploads, external sharing, Windows/Mobile/offline sync — each requires separate product/architecture decisions.
