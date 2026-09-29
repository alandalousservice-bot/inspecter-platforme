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
| TASK-030 | TeacherSubmission migration/public POST with rate limit | G2 + ADR-015 for required fields؛ prisma/intake | 202 receipt, no lookup/leak, input limits; abuse/integration | teacher creation؛ G3 |
| TASK-031 | Public form RTL + receipt state | 030,012؛ client/public | validation, submit/loading/error/success; E2E | teacher login؛ G3 |
| TASK-032 | Inspector submissions list/detail and duplicate candidates | 030,022؛ server/intake | scoped list, candidates only inspector, no merge; integration | auto decision؛ G3 |
| TASK-033 | Review UI with explicit decision confirmation | 032； client/intake | statuses, candidate warning, 409 feedback; UI/E2E | mass approval؛ G3 |
| TASK-034 | Teacher migration + atomic accept/reject/internal review | 032,025； prisma/intake/teacher | one teacher for accepted request, audit, concurrency safe; integration | assignment creation؛ G3 |
| TASK-035 | Teacher profile GET/PATCH + read UI | 034； server/teacher, client/teacher | district scope, history visible, fields contract; integration/UI | formal fields not approved؛ G3 |

G3: public→review→accept E2E، race/duplicate/privacy checks pass. Tasks 030/035 wait for relevant OPEN fields if required.

## Phase 4 — assignments, schedule, search gate G4

| ID | Objective; Scope | Dependencies; Expected areas | Acceptance Criteria; Tests | Out of Scope; Gate |
|---|---|---|---|---|
| TASK-040 | Assignment migration + interval/workload service | G3； prisma/assignment | multiple institutions, history, total at date; unit/integration | official workload threshold؛ G4 |
| TASK-041 | Assignment API + editor | 040,012； server/client assignments | MAIN/SECONDARY, history, validation; E2E | cross-district transfer؛ G4 |
| TASK-042 | WeeklySchedule/Slot migration + overlap rules | 040； prisma/schedule | structured time, valid assignment, overlap rejected; DB/unit | attachment-only schedule؛ G4 |
| TASK-043 | Schedule API + weekly editor/read view | 042,012؛ server/client schedule | time/day filters, RTL timetable, revision; integration/UI | attendance؛ G4 |
| TASK-044 | Teacher search API + indexed filters | 043,035؛ server/teacher | q/institution/status/visit/time filters, pagination; integration/perf sample | search engine؛ G4 |
| TASK-045 | Teacher table/filter UI | 044,012؛ client/teacher | usable 180+ rows, URL filters, responsive; E2E/visual | client-only filtering؛ G4 |

G4: multi-institution and Tuesday-morning search E2E pass; migration/index review.

## Phase 5 — visits and reporting gate G5

| ID | Objective; Scope | Dependencies; Expected areas | Acceptance Criteria; Tests | Out of Scope; Gate |
|---|---|---|---|---|
| TASK-050 | PedagogicalVisit skeleton migration/API | G4؛ prisma/visits | scoped schedule/status, teacher/institution consistency; integration | evaluation grid؛ G5 |
| TASK-051 | Visit list/detail UI | 050,012؛ client/visits | loading/empty/error and workflow; UI | lesson memo as visit form؛ G5 |
| TASK-052 | InspectionReport draft/final snapshot | 050,025؛ prisma/reports | one report/visit, immutable final, audit; integration | official template fields (ADR-012)؛ G5 |
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
