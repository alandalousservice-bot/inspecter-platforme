# TASK-082 — Teacher supplementary workplaces: implementation contract

Status: COMPLETED. Authority: ADR-036 and the existing Teacher/Institution contracts. TASK-080/081 are completed. ADR-014 (retention) and ADR-017 (district transfer) remain OPEN. Implementation evidence is recorded in `docs/IMPLEMENTATION_PLAN.md`; TASK-083 was not started.

## Model and migration

Keep `Teacher.institutionId` as the single current approved home Institution («المؤسسة الأم»). Add `TeacherSupplementaryWorkplace` solely for Inspector-approved «تكملة نصاب». This is not a peer home relationship, public declaration, workload record or HR transfer history. Never fabricate a row from `Teacher.institutionId` or `TeacherSubmission`.

| Field | Prisma/PostgreSQL | Required | Contract |
|---|---|---|---|
| `id` | UUID, `@id @default(uuid())` | yes | Stable row identity. |
| `teacherId` | UUID | yes | Parent Teacher, path-derived. |
| `institutionId` | UUID | yes | Existing Institution, immutable after creation. |
| `districtId` | UUID | yes | Server-derived from locked Teacher, only for composite district FKs; never client-controlled. |
| `validFrom` | `DateTime @db.Date` / DATE | yes | Inclusive start. |
| `validTo` | `DateTime? @db.Date` / DATE | no | Exclusive end; NULL is open-ended. |
| `createdAt` | `DateTime @default(now())` | yes | Creation time. |
| `updatedAt` | `DateTime @updatedAt` | yes | Effective last change; no-op leaves it intact. |

Exactly one additive forward TASK-082 migration. Add a referenced `Teacher(id,districtId)` unique key (not currently present); existing `Institution(id,districtId)` is already unique. Composite FKs `(teacherId,districtId) → Teacher(id,districtId)` and `(institutionId,districtId) → Institution(id,districtId)` prevent cross-district relations, with `ON DELETE RESTRICT, ON UPDATE CASCADE` per existing Teacher/Institution child conventions. PK is `id`; no unique pair key, so disjoint history is allowed. Add `CHECK (validTo IS NULL OR validTo > validFrom)` and GiST exclusion `(teacherId WITH =, institutionId WITH =, daterange(validFrom,validTo,'[)') WITH &&)`; reuse the existing `btree_gist` extension. Add a teacher-leading scoped-read index ordered by `validFrom DESC, id DESC`. Prisma cannot express CHECK/exclusion; migration SQL and integration tests must protect them. No backfill or edits to prior migrations.

`[validFrom,validTo)` permits adjacency, not overlap for the same Teacher/Institution. Different supplementary Institutions may be simultaneous. On date D, a row is valid iff `validFrom <= D AND (validTo IS NULL OR D < validTo)`. For current state D is the Africa/Algiers **local calendar date**, not server UTC date. Future rows are not current; ended rows stay historical. No status enum or academic-year coupling.

## Home, archive and correction

A POST or PATCH must reject a link whose Institution is Teacher's **current home**, with safe `409 CONFLICT`, regardless of the link's start date. The existing `PUT /teachers/:id/current-institution` must check under the same Teacher row lock before a genuine home change: reject target B if B has a supplementary interval intersecting `[today,+∞)`, including a future interval. Require explicit truthful resolution; never auto-close, delete, convert to home history or invent a past interval. An interval ending no later than today is historical and does not block. Changing home to C leaves unrelated B rows intact and preserves TASK-080 appointment reset/audit behavior. Same-home no-op is unchanged. Teacher district transfer is outside scope.

An archived Institution cannot be selected for a **new** link; existing rows remain, including currently valid ones, if Institution is archived later. No automatic close or historical rewrite. Use current Teacher-profile convention: Teacher `recordStatus` and `archivedAt` are read-only context and not new mutation gates; current Inspector membership in Teacher district is the access gate. Historical rows remain readable for inactive/archived Teacher. No new Teacher status/archive endpoint.

Institution ID is immutable. Inspector may correct `validFrom`/`validTo` subject to all constraints, or close by setting `validTo` to a date strictly after `validFrom`. `validTo:null` reopens a closed interval only if all constraints pass. Omission means unchanged. A normalized no-op writes/audits nothing. No DELETE endpoint, including for a just-created wrong row: ADR-036 preserves link history. If a never-effective future error has no truthful date correction, TASK-082 must not fabricate history to remove it; a later explicit correction/removal policy would be required for that exceptional case.

## Inspector API and transactions

All paths below are under `/api/v1`, require ACTIVE Inspector session and current Teacher-district membership, return `Cache-Control: no-store`, and use existing request IDs/error envelope. Mutations require CSRF. UUIDs and strict bodies use Zod. Missing/out-of-scope Teacher, wrong-parent/missing workplace, and cross-district Institution produce generic 404 without existence disclosure.

| Route | Request | Success | Rule |
|---|---|---|---|
| `GET /teachers/:teacherId/supplementary-workplaces` | no filter/body | `200 {items:[Workplace]}` | All authorized current/future/history, ordered `validFrom DESC, createdAt DESC, id DESC`; empty `items:[]`; no pagination for this per-Teacher collection. |
| `POST /teachers/:teacherId/supplementary-workplaces` | strict `{institutionId,validFrom,validTo?}`; UUID and `YYYY-MM-DD`, end nullable | `201 {data:Workplace}` | Existing active, same-district Institution; omitted end is NULL. |
| `PATCH /teachers/:teacherId/supplementary-workplaces/:workplaceId` | strict nonempty subset `{validFrom?,validTo?}`; end nullable | `200 {data:Workplace}` | Date correction or explicit close only; immutable IDs/Institution/district. |
| `DELETE` | — | — | Not provided. |

`Workplace` is exactly `{id,institution:{id,name,municipality,archivedAt},validFrom,validTo,isCurrent,createdAt,updatedAt}`. `isCurrent` is derived at read time; dates are `YYYY-MM-DD`, timestamps ISO. `municipality`/`archivedAt` nullable. Institution names are current labels, not historical snapshots. No Institution email/address/director phone, Teacher PII, raw district ID or audit metadata. Avoid N+1 reads. Existing active-only, server-side `GET /institutions` q/cursor list is sufficient for selection; no API expansion or client-side all-record filter, and POST rechecks authorization/active state.

Each mutation locks the Teacher `FOR UPDATE` **first**, re-reads Teacher and checks current Inspector membership inside the Prisma transaction, then locks/reads target Institution or workplace consistently, validates merged dates and home distinction, writes and appends audit using the same transaction client. Extend existing home-change transaction with the future/current supplementary-target guard under its existing Teacher lock. This serializes the cross-model invariant and per-Teacher mutations; GiST remains final overlap protection against races/direct writes. Syntactic/invalid date/body: `400 VALIDATION_ERROR`; overlap, same-as-home, archived target, or stale race: `409 CONFLICT`; missing/out-of-scope/wrong-parent: generic 404. No raw Prisma/Postgres constraint details, input values or PII in errors/logs.

Audit actions: `TEACHER_SUPPLEMENTARY_WORKPLACE_CREATED`, `TEACHER_SUPPLEMENTARY_WORKPLACE_UPDATED`, `TEACHER_SUPPLEMENTARY_WORKPLACE_CLOSED`; `entityType=TeacherSupplementaryWorkplace`, `entityId` row UUID, actor Inspector, Teacher district, HTTP requestId. CREATED/CLOSED metadata `{teacherId,institutionId}`; UPDATED `{teacherId,institutionId,changedFields}` with sorted unique names from `validFrom,validTo` only. CLOSED is an effective open→finite-end PATCH; all other effective PATCHes are UPDATED. No dates, names, contact details, prose or request body in metadata. No-op has no event. Audit and mutation roll back together; no AuditLog schema change.

## UI and later consumers

Add only a section to the existing RTL Teacher profile: «المؤسسة الأم» stays distinct from «مؤسسات تكملة النصاب». Group valid-now, future/planned, and previous rows distinctly; never label a future row current. Show Institution name/municipality and dates, not UUIDs; provide accessible scoped active-Institution search, add, date correction and explicitly confirmed close. No delete action. Shared tokens/primitives, keyboard/focus, narrow-screen, loading/empty/error/success states. Preserve TASK-080/081 profile sections. Do not expand directory, public intake, Visit/FollowUp/report projections.

Conceptual future query: `isValidWorkplace(Teacher,Institution,D)` may use current home for current context or same-district supplementary interval valid on D. TASK-082 can provide the query helper, but must **not** wire it into WeeklySchedule or Visit. Current home is not evidence of a past home after an untracked home change; TASK-083 must preserve ADR-036's retrospective Visit safeguard. Existing schedule/Visit rows and snapshots remain unchanged. Information-card aggregation is TASK-084 only.

## Tests and gate

Verify clean migration and upgrade from TASK-081 HEAD `31e43d381babc623595cd9e0acc7fc2dcfe378f2`: existing home, qualifications, schedules and Visits unchanged; zero fabricated supplementary rows. DB/API tests: required start, open/finite end, real dates, reversed/zero length, adjacency, disjoint history, partial/contained/open overlap, different Institution/Teacher concurrency, composite FK and restrict; same-home and home→active/future-supplement rejection, historical target allowed, C change retaining B and TASK-080 appointment reset; archived and cross-district rejection; inactive/expired membership, CSRF, wrong parent/no leak; PATCH correction, immutable fields, no-op, close/reopen, race error redaction; audit metadata and rollback; Africa/Algiers midnight boundary and history/future grouping. UI tests: current/future/previous, search/pagination picker, add/edit/close/conflict, RTL/keyboard/labels and no DELETE. Connected E2E: login → scoped Teacher home A → add B → reload B current → close B → reload B previous, with home A and schedule/Visit unchanged. Run TASK-080/081, directory, public intake/acceptance, WeeklySchedule, Visit, Report, FollowUp regressions plus typecheck, lint, all tests, build, smoke and diff-check. Mark COMPLETED only on full PASS; do not start TASK-083.

One migration, no expected new dependency. Later DB tests may target **only** verified isolated `127.0.0.1:55432/task020_test` as `task020_test_user`; never 5432, Production or remote, and never print credentials. Out of scope: TASK-083/084/085/086, TASK-060/ADR-013, generic M:N, home/HR transfer history, workload hours/percentages, schedule/Visit assignment, Institution auto-create, public supplementary declarations, relationship snapshots, notes and notifications. ADR-014/017 remain open without blocking this bounded task.
