# TASK-080 — Teacher administrative master-data evolution: execution contract

Status: **COMPLETED (2026-10-01)**. This file records the accepted implementation contract; completion evidence and validation are summarized in [IMPLEMENTATION_PLAN](../IMPLEMENTATION_PLAN.md#post-g5-teacher-information-card-evolution--adr-036-accepted-tasks-proposed). Authority: [ADR-036](../DECISIONS.md#adr-036--teacher-information-workplace-and-administrative-profile-evolution), its [domain contract](TEACHER_INFORMATION_CARD_ADR_036_CONTRACT.md), and the existing [API contracts](../API_CONTRACTS.md). The implementation preserved this scope; executor rules remain in `CODEX_RULES.md`.

## Verified baseline

Committed application HEAD: `18a35e7cbd7a14a588bb3a2711c270addc2cbcec`; only ADR-036 documentation changes were present in the worktree at review. Prisma uses **String**, not a PostgreSQL enum, for `Teacher.professionalStatus` and the public JSON snapshot. The accepted values in API/UI are `PERMANENT`, `TRAINEE`, `CONTRACT`, `TEMPORARY_CONTRACT`.

Current `Teacher` scalar fields exactly: `id`, `districtId`, `institutionId`, `name`, `surname`, `birthDate`, `placeOfBirth`, `phone`, `email`, `professionalStatus`, `employedAt`, `confirmedAt`, `qualifications`, `recordStatus`, `archivedAt`, `createdAt`, `updatedAt`. `birthDate/employedAt/confirmedAt` are PostgreSQL `DATE`; `institutionId` is nullable current home link. Current `Institution` scalars: `id`, `districtId`, `name`, `externalCode`, `municipality`, `address`, `directorPhone`, `archivedAt`, `createdAt`, `updatedAt`. Current `TeacherSubmission` scalars: `id`, `districtId`, `submittedProfile` JSON, `status`, `submittedAt`, `decidedAt`, `decidedByInspectorId`, `acceptedTeacherId`. There are no Prisma enums for these records. Existing `Teacher.qualifications` remains free text.

Current Teacher profile GET/PATCH uses `/api/v1/teachers/:id`, active Inspector session/current district membership, no-store, CSRF for PATCH, strict Zod partial body, row lock + atomic `TEACHER_PROFILE_UPDATED` with `changedFields` names only, normalized semantic no-op. Directory GET is separately projected and cursor-paginated. Institution GET/list/POST/PATCH routes already exist; PATCH rejects archived Institution, uses row lock and `INSTITUTION_UPDATED` with field names only. The current InstitutionsPage has list/create, **no edit surface**; the smallest email edit UI is a focused action/dialog on that page, not a new management subsystem. The Teacher current-home approval route creates Institution and links Teacher atomically but is not an Institution general edit route.

## Schema delta and validation

Exactly **one forward-only TASK-080 migration** adds nullable fields; no rename/drop, backfill, destructive enum change, or migration edit. New text columns use nullable Prisma `String?` with PostgreSQL bounded `varchar(n)` or equivalent CHECK protecting accepted maximum **Unicode code-point** length; Zod remains the primary normalization/validation boundary. A `null` means unknown/cleared. No default fabricated values. Text input must reject raw control characters, normalize NFC, trim, collapse display whitespace where noted, reject empty/whitespace-only values, and count `Array.from(normalized).length` in API. PATCH: absent key = unchanged; `null` = clear; `""`/whitespace-only = 400, **not** clear. For newly added dates, use `DateTime? @db.Date`, exact real `YYYY-MM-DD` in API, no time/zone, no invented inter-date ordering or blanket future rejection. Keep existing `employedAt/confirmedAt/birthDate` validation and semantics unchanged. Unknown keys rejected and safe `VALIDATION_ERROR` does not echo input.

| Source concept | Internal field / owner | DB type / nullable | Input normalization and max | Input authority / public intake |
|---|---|---|---|---|
| مستخلف/مستخلفة | `Teacher.professionalStatus = SUBSTITUTE`; `TeacherSubmission.submittedProfile.professionalStatus` | Existing nullable String / JSON; no new column | exact canonical value `SUBSTITUTE`; existing four unchanged | public **required existing** status field; Inspector PATCH |
| الإطار | `Teacher.professionalFramework` | String? / `varchar(120)` | NFC, trim, collapse whitespace; 1..120 | Inspector only; not inferred from status/report |
| تاريخ أول تعيين في التعليم | `Teacher.firstEducationAppointmentDate` | DateTime? `@db.Date` | real date `YYYY-MM-DD` | Inspector only; **not** employedAt alias |
| رقم قرار أول تعيين في التعليم | `Teacher.firstEducationAppointmentDecisionNumber` | String? / `varchar(120)` | NFC, trim, collapse whitespace; 1..120 | Inspector only |
| تاريخ أول تنصيب | `Teacher.firstInstallationDate` | DateTime? `@db.Date` | real date `YYYY-MM-DD` | Inspector only |
| تاريخ التربص | `Teacher.traineeshipDate` | DateTime? `@db.Date` | real date `YYYY-MM-DD` | Inspector only |
| تاريخ الترسيم | **existing** `Teacher.confirmedAt` | Existing DateTime? `@db.Date` | keep existing API/ordering rules | current optional public `confirmationDate` then Inspector profile; no duplicate column |
| تاريخ التعيين بالمؤسسة الأم الحالية | `Teacher.institutionAppointmentDate` | DateTime? `@db.Date` | real date `YYYY-MM-DD` | Inspector only; requires approved current home Institution |
| رقم التعيين بالمؤسسة الأم الحالية | `Teacher.institutionAppointmentNumber` | String? / `varchar(120)` | NFC, trim, collapse whitespace; 1..120 | Inspector only; requires current home |
| رقم تأشيرة المراقب المالي لهذا التعيين | `Teacher.financialControllerVisaNumber` | String? / `varchar(120)` | NFC, trim, collapse whitespace; 1..120 | Inspector only; requires current home |
| الصنف | `Teacher.administrativeCategory` | String? / `varchar(100)` | NFC, trim, collapse whitespace; 1..100 | Inspector only; no numeric/legal enum |
| القسم الإداري | `Teacher.administrativeSection` | String? / `varchar(100)` | NFC, trim, collapse whitespace; 1..100 | Inspector only; not pupil class/level |
| الدرجة | `Teacher.administrativeGrade` | String? / `varchar(100)` | NFC, trim, collapse whitespace; 1..100 | Inspector only |
| تاريخ سريان التصنيف | `Teacher.administrativeClassificationEffectiveDate` | DateTime? `@db.Date` | real date `YYYY-MM-DD` | Inspector only |
| ولاية الميلاد | `Teacher.birthProvince` | String? / `varchar(100)` | NFC, trim, collapse whitespace; 1..100 | Inspector only; separate from placeOfBirth |
| العنوان الشخصي | `Teacher.personalAddress` | String? / `varchar(300)` | NFC, trim, collapse whitespace; 1..300 | Inspector only; private |
| معلومات أخرى إدارية | `Teacher.administrativeNote` | String? / `varchar(1000)` | NFC, CRLF/CR→LF, trim outer whitespace, preserve meaningful interior spacing/newlines; reject controls except LF; 1..1000 | Inspector only; factual Teacher-card administrative context, not report/follow-up prose |
| البريد الإلكتروني للمؤسسة | `Institution.email` | String? / `varchar(254)` | existing `emailField`: trim, ≤254, valid email, lowercase domain, preserve local part | authorized Institution create/edit; not Teacher/public intake |

Classification fields are **independently nullable**; `administrativeClassificationEffectiveDate` may be supplied even if one/all text labels are missing because a partial administrative record is allowed. UI should indicate incomplete information, not manufacture values. No numeric range or inter-field required invariant. First appointment date/number may also be independently null. Dates are valid calendar dates, not proof of an administrative decision; the Inspector enters verified facts.

The three institution-specific appointment facts belong to the **current approved home** in this MVP. Their PATCH is rejected with safe `409 CONFLICT` when `Teacher.institutionId=NULL` and any is non-null. When the home link actually changes, clear any non-null values **atomically within the existing home-link transaction**; same-home no-op preserves them. The existing `TEACHER_INSTITUTION_CHANGED` audit remains, and if clearing occurs append `TEACHER_PROFILE_UPDATED` with only the cleared field **names**, in the same transaction. No previous appointment/transfer history is invented; the fact that prior facts are cleared is an explicit MVP current-state policy, not a migration of older Teacher rows. If preserving such history is later required, that is a separate domain evolution.

## Status compatibility, APIs, and UI

`SUBSTITUTE` must be accepted end-to-end by the existing required public `professionalStatus`: API Zod list, public form option/TS client type, Inspector submission review label, decision/acceptance mapping into Teacher, Teacher PATCH/detail, directory query filter/client type/UI option, and all presentation labels. The neutral display label «مستخلف» is acceptable; no sex/gender is inferred or stored. Previous four statuses and old TeacherSubmission JSON remain valid and unchanged. No new public field or public body shape. This **moves status compatibility from the old proposed TASK-085 row into TASK-080**; TASK-085 remains a reserved future public-intake task with no executable new-field scope until a separate decision.

Teacher GET adds every new Teacher field above as `string|null` or calendar-date `YYYY-MM-DD|null` to the **authorized detail only**; old fields and declared/current workplace shapes remain compatible. Teacher PATCH extends the existing strict, nonempty partial schema with exactly the new Teacher fields; same active Inspector/session, current district membership, no-store, CSRF, row lock, merged-state validation, field-level `null` clearing, semantic no-op, safe 404 for out-of-scope. No new public route. Existing `recordStatus`, `districtId`, `institutionId`, `TeacherSubmission` snapshot, Visit/Report fields remain uneditable through this PATCH. No new concurrency token; preserve current row-lock serialization. Existing `employedAt` remains general employment date, not first appointment date; `confirmedAt` remains accepted confirmation date. Do not backfill either from new fields.

Institution `email` enters existing `POST /api/v1/institutions` and `PATCH /api/v1/institutions/:id` as optional/nullable under current semantics; GET detail/list response adds `email:string|null` without changing name-only q search, pagination or archive visibility. PATCH to archived Institution remains `409`; unauthorized/cross-district remains safe 404; no changed/empty semantics regression. **Do not include Institution.email in ordinary Teacher directory row or Visit/FollowUp list.** Existing Teacher-profile current-home approval `createInstitution` nested body remains unchanged: it need not capture email at link time; authorized Institution PATCH can set it later. No Institution email full-text search.

UI: extend TeacherProfilePage with grouped sections «المعلومات الشخصية» (birthProvince), «الوضعية المهنية» (SUBSTITUTE/professionalFramework), «بيانات التعيين» (dates/references), «التصنيف الإداري», «بيانات الاتصال» (private personalAddress), «ملاحظات إدارية» (administrativeNote), retaining legacy qualifications and current institution blocks. Use current RTL tokens, labels, accessible focus/clear controls and API field errors; do not create the final Information Card. Institution email appears in the existing InstitutionsPage create surface and a **small authorized email-edit action/dialog** using the existing PATCH route, with no new Institution subsystem, plus authorized detail where present. No update/delete/archive UI expansion beyond this email action.

### Projection matrix

Legend: `E` = expose in authorized detail; `W` = editable in authorized PATCH/create; `H` = hidden; `N/A` = not applicable. `E/W` means both. Current authorized Teacher profile/detail = `E/W` for all new Teacher fields; their **public status** exception is shown separately. No new field is derived except existing source dates/presentation. Institution list/detail is authorized, but Institution.email is **not** Teacher data.

| New field | Teacher detail GET | Teacher PATCH | Teacher directory | Visit list | Visit detail | Report context | FollowUp list | Public submission | AuditLog |
|---|---|---|---|---|---|---|---|---|---|
| `professionalStatus=SUBSTITUTE` (existing field) | E | W | E (existing status column/filter) | existing projection only | existing context only | existing snapshot semantics only | existing projection only | W (existing required field) | H values; changed field name only |
| `professionalFramework` | E | W | H | H | H | H | H | H | H values |
| `firstEducationAppointmentDate` | E | W | H | H | H | H | H | H | H values |
| `firstEducationAppointmentDecisionNumber` | E | W | H | H | H | H | H | H | H values |
| `firstInstallationDate` | E | W | H | H | H | H | H | H | H values |
| `traineeshipDate` | E | W | H | H | H | H | H | H | H | H values |
| `institutionAppointmentDate` | E | W | H | H | H | H | H | H | H values |
| `institutionAppointmentNumber` | E | W | H | H | H | H | H | H | H values |
| `financialControllerVisaNumber` | E | W | H | H | H | H | H | H | H values |
| `administrativeCategory` | E | W | H | H | H | H | H | H | H values |
| `administrativeSection` | E | W | H | H | H | H | H | H | H values |
| `administrativeGrade` | E | W | H | H | H | H | H | H | H values |
| `administrativeClassificationEffectiveDate` | E | W | H | H | H | H | H | H | H values |
| `birthProvince` | E | W | H | H | H | H | H | H | H values |
| `personalAddress` | E | W | H | H | H | H | H | H | H values |
| `administrativeNote` | E | W | H | H | H | H | H | H | H values |
| `Institution.email` | N/A; only currentInstitution authorized detail if explicitly opted in later | N/A | H | H | H | H | H | H | H values |

For `Institution.email`: authorized `GET /institutions` and `GET /institutions/:id` expose `E`, `POST/PATCH /institutions` allow `W`, and `INSTITUTION_UPDATED` metadata contains only `"email"` in `changedFields`. Do not copy it into `Teacher.currentInstitution` or declaredWorkplace in TASK-080. The matrix's `H` for Visit/Report/FollowUp means no **new** field in those projections; it does not remove existing historical snapshots.

### Audit, privacy, and migration

Reuse existing `TEACHER_PROFILE_UPDATED`, `INSTITUTION_CREATED`, and `INSTITUTION_UPDATED`. Extend only their **allowlists** for new structural field names; no new event type or AuditLog schema. In Teacher PATCH, normalized no-op makes no DB write/audit; changed fields sorted, names only. Institution PATCH same. Home-change clearing described above is atomic with link mutation and events. No address, note, email, reference number, raw body, or PII value in metadata/errors/logs. Preserve request IDs/error envelope/Zod boundary and current read-side scoping. Institution email is master contact data, not proof of mailbox ownership. No public receipt or cross-district leakage.

Migration: **one new TASK-080 migration** only. Add nullable bounded Teacher/Institution columns and any minimum genuine length protections; no enum DDL because `professionalStatus` is String. Existing rows remain NULL in new columns; preserve all historical Teachers, TeacherSubmissions, Institutions, Visits, WeeklySchedules, Reports, FollowUps and AuditLogs. Validate clean migration chain and upgrade from committed TASK-054 baseline with realistic existing rows. Use only isolated local `127.0.0.1:55432` `task020_test` during implementation; never 5432/production/remote and never expose credentials. No dependency is expected.

## Required implementation tests and gate

1. Status: old four values and `SUBSTITUTE` in public validation/form, JSON snapshot, Inspector review, acceptance into Teacher, profile PATCH/detail, directory filter and RTL labels; no synonym migration.
2. Migration: clean + upgrade with old Teacher/Institution/Submission/Visit/Schedule/Report/FollowUp/Audit rows; new columns NULL; old four strings intact; no rewrite of old qualifications.
3. Teacher profile API/UI: all new fields set/clear, strict unknown-key rejection, Unicode NFC/code-point bounds, invalid calendar dates, classification partial state, independent dates with no invented ordering, home-specific facts rejected when unlinked/cleared atomically on change, normalized no-op no timestamp/audit write, district isolation and safe errors.
4. Privacy: address/note/references absent from Teacher directory, Visit and FollowUp list/detail where not expressly part of preexisting snapshots, Report context, public receipt/JSON and audit values; only authorized Teacher detail; verify no request-body logging/PII echo.
5. Institution email: create/read/edit including minimal UI surface; invalid/valid/local-part-domain normalization, null clear, archived `409`, cross-district safe 404, unchanged name q/cursor/list count, no-op no audit, IDs/names-only audit.
6. Regression: TASK-035 Teacher profile, TASK-044/045 directory, TASK-050/051 Visit, TASK-052 legacy report, TASK-053 FollowUp, TASK-053A types, TASK-054 V1, and public intake/acceptance; connected browser for impacted Teacher/Institution/public flows.
7. Standard gates: DB integration on isolated target, typecheck, lint, full tests, build, smoke, `git diff --check`, migration diff/scope review. Mark TASK-080 COMPLETED only after every criterion passes; no auto-start TASK-081.

Out of scope: structured TeacherQualification child (081), supplementary workplaces (082), slot/Visit location (083), aggregate Information Card (084), broader public-intake fields (085), card/Visit Report printing (086/other), TASK-060, Teacher photo/marital status/signature, Teacher.mark/lastInspectionDate, ambiguous source label, static header/academicYear Teacher columns. TASK-054 remains COMPLETED; ADR-013 OPEN; TASK-060 NOT_STARTED/BLOCKED.
