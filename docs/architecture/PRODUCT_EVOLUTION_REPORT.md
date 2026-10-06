# Comprehensive product evolution — delivery report

Date: 2026-10-05. Authority: the Product Owner's confirmed new Vision and `SOL_6_1_MASTER_IMPLEMENTATION_TASK_FINAL.md`. This is one implementation delivery, not a proposed backlog.

## Status and baseline

**PARTIAL**: the major safe implementation is delivered and its executed automated gates pass. Unresolved ownership/history/verification transitions remain deliberately gated; this is not production release approval or a claim that all future policy is settled.

- Start/end HEAD: `dbf970177596b17775cf78f12f8c5c778d330167`; branch `master`; local `origin/master` unchanged at the same checkpoint after the initial successful fetch.
- Starting worktree clean; ending worktree intentionally dirty, with implementation/docs/tests for review. No commit, staging or push.
- Original delivery reused existing dependencies; R2 adds only sharp 0.35.5 for required secure image decode/re-encode (manifest/lockfile). Latest R2 evidence supersedes the original validation below: [R2 report](PRODUCT_EVOLUTION_R2_REPORT.md).
- Original Master and both supplied source documents unchanged. ArenaSPEX read-only. Existing migrations unchanged.

## Delivered capabilities

1. Permanent 1:1 Teacher account, Inspector-issued district-bound invitation, one-time activation, separate Teacher login/logout/session/CSRF. No public self-claim or automatic account from an intake submission.
2. Own-profile Teacher Portal with approved identity, contact, professional dates, qualifications/workplaces, private photo and typed update proposals. Inspector-only administrative notes never enter its projection.
3. Inspector request workspace for PROFILE, CONTACT, TRAINING, TRANSFER, WORKPLACE and LOCATION. Explicit confirmation, scoped server filters/cursor totals, safe conflicts and atomic decision/audit. Declarations do not silently become approved master data.
4. Teacher-owned initial weekly timetable, readable in its dossier and portal; dated home/supplementary workplace checks; Inspector correction request → Teacher proposal → explicit Inspector acceptance. Prior canonical schedule stays effective until successful acceptance; previous slots retained in the correction record. R2 closes Inspector writes for all Teachers; later independent updates and explicit reasoned rejection share the correction review/history machinery.
5. Nullable training state, unverified completion declarations and prospective tenure eligibility. CONTRACT is denied; TRAINEE requires verified COMPLETED. Existing visits/reports are not reinterpreted.
6. Non-effective transfer request/source-Inspector decision and traceable status; approval never changes canonical district or historical permissions.
7. Responsive Teacher card directory, server-side search/filter/cursor pagination, private photo presence, current supplementary-workplace indicator, municipality context and accessible dossier links. Constant query count tested at 1 and 100 directory rows.
8. Scoped District → municipality → Institution → Teacher navigation. Municipality remains existing normalized Institution text, not an invented official registry. Institution workspace reuses approved home/supplementary relationships and existing canonical location functionality.
9. Dashboard operational request categories/correction alerts and bounded Teacher/geography previews, alongside existing visit/follow-up modules. No fabricated KPIs, generic notification subsystem or giant Dashboard timetable.
10. Teacher dossier adds training, recent requests/corrections/audit summaries, readable timetable and recent Inspector-owned visit/report/follow-up links. The bounded recent summary is not a complete professional-history database or expanded access to another Inspector's reports.

## UX and source reuse

The project skills `inspector-domain-guardrails` and `inspector-ui` guided declared/approved separation, historical ownership, shared primitives/tokens, Arabic RTL and print isolation. The explicit new Product Owner decision supersedes their old no-account/table-only assumptions, not their safety rules.

ArenaSPEX weekly timetable components were selectively read on GitHub. Day-column/session-record layout and duration summary were rebuilt against Inspector Platform data; no old account model, fixed hours, hardcoded signature, palette, business code or runtime dependency copied.

Teacher Portal is role-separated from AppShell. Existing visits/follow-ups/report workspaces are retained and connected, not cosmetically rewritten. Visit creation/type editing now explains/enforces the eligibility boundary. Institutional labels are configurable display context with explicit no-government-adoption wording; no invented official logo. Current shared theme, focus behavior and screen-only CSS retained.

## Data model and API

Six added models: TeacherAccount, TeacherSession, TeacherInvitation, TeacherChangeRequest, TeacherPhoto, ScheduleCorrection. Teacher adds nullable trainingStatus/trainingVerifiedAt; AuditLog adds a mutually exclusive nullable Teacher actor. No Municipality duplicate table, separate effective timetable or automatic Assignment creation.

Forward-only migrations: `20261005180000_product_evolution_teacher_portal`, plus R2 `20261005220000_product_evolution_r2_schedule_review`. Latest clean chain: 23 migrations. Upgrade test: 21 prior migrations → new migration, with exact legacy Teacher/Visit/FINAL Report/Audit/timetable preservation and no fabricated accounts/training. Unique account/session/invitation identifiers, restricted new FKs, bounded photo metadata, state/verification CHECKs, positive revisions and partial one-pending/open indexes are enforced.

Full routes and typed payloads are centralized in [API_CONTRACTS](../API_CONTRACTS.md#current-teacherinspector-evolution--adr-041); persistence in [DATABASE](../DATABASE.md#current-implemented-evolution--adr-041), execution/policy in [ADR-041](PRODUCT_EVOLUTION_2026.md). New route families are `/teacher/auth`, own `/teacher` resources, `/teacher-requests`, account invitations, schedule corrections, private photo reads and bounded geography/workspace/history read models. Existing directory/institution/visit/schedule contracts have additive, documented changes only.

## Security and database isolation

- Teacher and Inspector role checks/cookies/CSRF namespaces separated. Teacher fixed 8h sessions, HttpOnly session cookie, production Secure/SameSite Strict, expiry/revocation/inactive checks. Existing scrypt and trusted-IP limiter reused. No reset, OTP, OAuth, bulk RBAC or public data lookup invented.
- Server-only ownership/district authorization; strict Zod/NFC/bounds; no raw payload/PII/credential logging or error echo. Atomic canonical mutation + audit, revisions/baselines/Teacher locks; terminal/stale/racing decisions fail safely.
- Private PNG/JPEG adapter outside repository, UUID-generated immutable keys, authenticated no-store/nosniff responses, real decode/re-encode/orientation normalization and metadata stripping, byte/decoded-dimension/pixel checks; no public mount, SVG or caller filename/path. Concurrent replacement ordering is monotonic under the Teacher lock and tested. Prior assets retained, not automatically deleted.
- Only `127.0.0.1:55432`, `task020_test`, `task020_test_user` accessed. External credential file read into transient process environment; values never printed or tracked. No 5432, Neon, remote or Production access.
- Every new integration/E2E write occurs in its freshly owned temporary schema, dropped by its owner. New harnesses fingerprint all persistent `public` tables before/after; equality passes. No public/UAT migration, reseed or reset performed.

## Original delivery validation — historical evidence

The following counts and browser evidence describe the original delivery, not the R2 acceptance gate. In particular, its Edge zoom check does **not** satisfy R2's explicit real-Chrome requirement. Use [R2 report](PRODUCT_EVOLUTION_R2_REPORT.md) for the superseding results.

| Command/gate | Final result / evidence |
|---|---|
| `npm ci` | PASS; existing dependency graph restored; lockfile unchanged |
| Prisma `validate` (existing API-local CLI) | PASS |
| `npm run typecheck` | PASS, Web + API |
| `npm run lint` | PASS |
| `npm test` | PASS: 425 Web + 37 API unit tests |
| `npm run test:db` | PASS: 197 existing integration/database tests |
| `npm run test:evolution` | PASS: 17 new integration/upgrade tests, including concurrent photo replacement |
| `npm run e2e:evolution` | PASS: 2 connected browser tests; persistent UAT fingerprint unchanged |
| `npm run build` | PASS: Web + API; JS 619.09 kB / gzip 165.51 kB; existing >500 kB chunk warning remains |
| `npm run smoke` | PASS: 2 tests |
| `npm run test:isolation` | PASS: 4 safety tests |
| `npm run e2e:task086` | PASS: protected card print regression; minimal 1 / normal 2 / stress 3 pages, A4/pagination/isolation |
| `npm run e2e:task054` | PASS: 2 existing report browser/print tests |
| `npm audit` | PASS: 0 known vulnerabilities |
| `git diff --check` | PASS |
| Secrets/generated-file/scope scan | PASS: no actual credential/connection string, tracked environment file, dependency/build/PG data artifact or protected-source change |

The existing visit lifecycle test exposed a timing race between visible conflict feedback and the Dialog's effect-driven native close. It now **waits for the same required absence assertion**, preserving one-mutation/manual-refresh assertions; the full suite then passes. No assertion weakened or retry of the business mutation added.

The complete `local:uat:test` command was attempted but its persistent-seed case stopped before DB access because the intentional local password environment variable was absent. It was **not rerun with a password**, because that test would reseed persistent UAT. Its three pure target/fixture guard cases passed separately. Persistent seed idempotence is NOT RUN in this delivery, not reported as PASS.

Browser evidence: synthetic connected invitation/activation/login/photo/contact review, training-completion gate, non-effective transfer, initial schedule/correction/acceptance and geography/directory navigation. Directory fixture has 206 Teachers with 25 server-paged cards, tested at 1440/1280/768/390 widths. Basic RTL/no-horizontal-overflow, keyboard and confirmation-focus checks pass. Native browser 200% zoom uses `chrome.tabs.setZoom(2)` in an **isolated disposable Edge profile**, confirms zoom/DPR/layout and exercises Dashboard/directory/profile/institutions/requests/visits/follow-ups/Teacher Portal; not CSS zoom or an operator-profile modification.

Screenshots in ignored `.cache/product-evolution-qa` were visually inspected, including desktop/mobile directory and Teacher Portal plus true 200% views. Native-zoom screenshots use CDP surface capture to avoid Playwright full-page CSS clipping; the final captures show the complete physical viewport. Basic accessibility checks are not a formal WCAG certification. Human Arabic/content/visual acceptance remains necessary.

## Remaining bounded engineering work

| Exact task | Why deferred / affected area | Complexity | Product decision? |
|---|---|---|---|
| Photo decode/re-encode and EXIF/GPS sanitization | Implemented by R2 with sharp, version-1-only serving and synthetic malformed/EXIF/GPS fixtures; see the R2 gate results. This original blocker is no longer an unresolved product decision. | CLOSED_BY_R2 | Retention remains ADR-014 |
| Configure/verify owner-service-only Windows ACLs and private asset backup | POSIX mode flags are not Windows ACL protection; operator provisioning outside repository, not product code or a secret committed to Git | SMALL | No; operator authorization required |
| Lazy route chunks with bundle regression budget | Current build passes with 619.09 kB JS warning; route loading, AppRoutes, Vite/E2E | MEDIUM | No |
| Human screen-reader and final visual acceptance | R2 expands long-Arabic-name, four-width and real-Chrome zoom fixtures; automated/basic visual evidence is not exhaustive assistive-technology certification | SMALL | No, visual acceptance by Product Owner |
| Document deliberate persistent UAT rollout after backup and migration approval | New schema tested only in owned schemas; do not start evolved code against an outdated persistent schema or silently seed it; LOCAL_UAT_GUIDE/operator runbook | SMALL | Operator rollout approval, not a new business policy |
| Distributed auth rate-limit enforcement before multi-instance hosting | Existing in-process bound reused; deployment-specific store/edge configuration, no new hosting infrastructure in this task | MEDIUM | No for security requirement; deployment authority required |

## Isolated product decisions — not implementation polish

1. Independent later schedule review is resolved explicitly by R2; implementation/QA closure is tracked in the R2 report. Future exceptional direct self-edit/administrative overrides remain unapproved.
2. Evidence and authority to verify COMPLETED training. Teacher can declare completion; acceptance/eligibility remains blocked until this decision. Tests prove a manually verified eligible fixture without exposing an unapproved verification endpoint.
3. Destination Inspector acceptance, effective transfer date, absent destination Inspector, same-district Inspector replacement and historical visibility. Source request/decision foundation is delivered; effective ownership transfer is not.
4. Broader sensitive-field self-service/approval exceptions beyond the implemented conservative typed proposal allowlist. No direct Teacher write to professional status/administrative fields.
5. ADR-014 retention/permanent deletion, including prior photo assets. No policy or automatic cleanup invented.

These are genuine policy boundaries, not falsely classified as small technical tasks. ADR-013 official content provenance remains open and TASK-060/content/native/offline infrastructure was not started.

## Handoff

Ready for Product Owner/code review on the isolated synthetic setup, not real-data deployment. Review private asset sanitization/ACLs, deliberate schema rollout and the isolated product decisions before enabling the affected real workflows. Reuse existing operator credentials only through the approved external mechanism; this report contains no credentials. No automatic next task, commit or push.
