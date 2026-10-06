# PRODUCT-EVOLUTION-R2 — pre-commit closure

Date: 2026-10-06. Authority: the Product Owner's bounded R2 schedule/photo/QA instructions. This report supersedes the original delivery's schedule, photo and browser-gate evidence; it is not authorization for rollout or for unresolved workflows.

## Status / preservation

**STATUS: PASS — R2 acceptance gates closed.** No commit, push, staging, reset, stash, clean or discard. Start/end HEAD and local `origin/master`: `dbf970177596b17775cf78f12f8c5c778d330167`, `master`; the pre-existing Product Evolution worktree is retained and intentionally dirty. This is commit-review readiness, not Production or persistent UAT rollout approval.

The recorded entry inventory contains 80 dirty files. All remain present. R2 modifies the relevant existing schedule/photo/review/contracts/tests rather than replacing that worktree. The original `20261005180000_product_evolution_teacher_portal/migration.sql` and prior committed migrations remain unchanged.

## Implemented state machine

| Origin / transition | Canonical schedule / retained evidence |
|---|---|
| No schedule → Teacher initial POST | Immediately canonical; no Inspector approval; atomic Teacher audit |
| Canonical exists → independent Teacher POST | `TEACHER_UPDATE / SUBMITTED`, pins canonical revision; no effective-slot mutation |
| Inspector requests correction → Teacher responds | `INSPECTOR_CORRECTION / REQUESTED → SUBMITTED`; issuer/note distinguish this origin |
| Either submitted origin → Inspector ACCEPTED | Recheck current scope, pinned revision, workplaces and slots; save previous canonical snapshot; replace effective slots and increment revision atomically with audit |
| Either submitted origin → Inspector REJECTED | Required normalized reason; retained proposal/actor/revision/audit; effective schedule unchanged; permits a fresh Teacher proposal |
| Invalid/stale acceptance | Safe 409; no automatic repair, rejection or canonical mutation; explicit reasoned rejection remains available |

Teacher row locks serialize proposal/review operations. The partial unique one-open Teacher/year index is retained; terminal REJECTED records are excluded. Repeated/stale terminal decisions conflict. A racing accept/reject has one winner; required audit failures roll both decisions back.

All four legacy Inspector writes (create schedule, add slot, patch slot, delete slot) unconditionally conflict after existing authentication/CSRF/scope checks. No exception for an absent/inactive/unactivated TeacherAccount. Existing scoped reads remain. Inspector UI offers review/correction only, not slot creation/edit/deletion. No exceptional override or impersonation is introduced.

## Photo pipeline

Untrusted PNG/JPEG → input/header/2 MiB checks → sharp real decoder with strict warning/truncation failure and 16,777,216-pixel budget → actual dimensions ≤4096 each / single image → orientation normalization → PNG compression 9 or JPEG quality 85 safe re-encode → output ≤2 MiB → private generated UUID key. Decoder timeout: five seconds. No metadata-preservation API is used; EXIF/GPS/XMP are stripped.

Only sanitized bytes are persisted, with `sanitizationVersion=1`. Historical raw assets retain NULL and are not served or counted as available photos; they are not deleted or automatically converted. Authenticated reads retain object/district scope, no-store, nosniff, accurate MIME, inline Content-Disposition and restrictive CSP. Own-avatar `v` is a bounded cache revision, not a Teacher selector; unknown query keys fail validation.

The only direct runtime library added relative to the approved checkpoint is **sharp 0.35.5**, with its normal lockfile/platform decoder dependencies. It replaces an unsafe header-only boundary with a mature decoder, not a custom codec or extra image subsystem. Primary dependency references: [constructor / decoder options](https://sharp.pixelplumbing.com/api-constructor/) and [output / metadata defaults](https://sharp.pixelplumbing.com/api-output/).

The final audit exposed [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) in existing transitive `source-map-js` 1.2.1. A dry run proved a one-package in-range patch update, then `npm update source-map-js --ignore-scripts` installed 1.2.2. No package was added, no framework/direct dependency changed, no force/audit-wide update was used. Canonical lock-graph hashes excluding that one entry and all three root/Web/API manifests remained identical. Audit then reported zero vulnerabilities; affected Web/build/browser/print gates are rerun after the patch. This closes a newly observed pre-commit security gate, not a product/architecture expansion.

## Security and history

- Teacher/Inspector sessions and CSRF namespaces remain separate. Teacher account/session state, expiry and revocation checks are retained.
- Schedule tests deny Teacher decisions, missing CSRF, caller-selected Teacher IDs and cross-district Inspector decisions without changing pending/canonical rows. Independent proposals are available only through current authorized Inspector scope; corrective responses retain issuer restriction.
- New schedule audit metadata is strictly `{}`; actor/action/resource/request/context IDs only. No schedule text, reason, passwords, tokens, photo bytes, PII or raw payloads are copied into audit/logs/errors.
- No historical Teacher, Visit, FINAL Report, Audit or canonical schedule is rewritten during upgrade. Existing correction rows retain origin/history; existing raw photos remain unavailable until a new sanitized upload.
- Master, supplied source artifacts and ArenaSPEX remain unchanged. No persistent UAT migration, seed/reset, remote/Production access or port 5432 access.

## Executed gates

| Command / gate | Result |
|---|---|
| Prisma validate | PASS |
| `npm run typecheck` | PASS: Web/API, rerun after security patch |
| `npm run lint` | PASS, rerun after security patch |
| `npm test` | PASS: 429 Web / 42 API unit, rerun after security patch and dialog-test timing correction |
| Focused existing V1 Report test file | PASS: 17/17 (included in the Web total), same conflict/no-auto-retry assertions |
| `npm run test:db` | PASS: final rerun 197/197; includes existing auth, district, intake, teacher, schedule, visit, report, follow-up, Dashboard and location regressions |
| `npm run test:evolution` | PASS: 33/33, including upgrade, SCHEDULE-01…12, simultaneous proposal creation, decision races/rollback and object/CSRF boundaries |
| `npm run e2e:evolution` | PASS: 2/2 connected tests, rerun after final security patch; persistent public/UAT fingerprint equal before/after |
| `npm run build` | PASS: Web/API; JS 621.71 kB, gzip 166.28 kB; existing >500 kB warning is not a new build failure |
| `npm run smoke` | PASS: 2/2 after final security patch |
| `npm run test:isolation` | PASS: 4/4 after final security patch |
| `npm run e2e:task086` | PASS: final rerun 1/1; minimal 1 / normal 2 / stress 3 pages; A4 geometry, pagination, privacy, native print action and shell isolation |
| `npm run e2e:task054` | PASS: final rerun 2/2 connected V1 lifecycle/responsive/print-style regressions |
| `node scripts/g8-10-visit-report-print.mjs` | PASS: rerun after final dependency patch; minimal/normal/dense each exactly 2 A4 portrait pages, grayscale, no sheet overflow, isolated shell. Synthetic intercepted read model; no DB access |
| `npm audit` | PASS: 0 known vulnerabilities after the bounded source-map-js patch; earlier failing audit is not reported as a pass |
| `git diff --check` / untracked whitespace | PASS; no staged changes, deleted files or whitespace violations |
| Secret/artifact scan | PASS: 348 tracked/untracked project files; no actual credential, private key, tracked environment, dependency/build/PG-data artifact. Two database URL literals are synthetic safety-unit fixtures only |

PHOTO-01…07 use generated images only. Negative fixtures include forged PNG/JPEG, truncated pixels, malformed APP1, unsupported WebP and 4097×4097 images. A real synthetic EXIF TIFF/GPS IFD/orientation fixture verifies stored **and served** JPEG bytes, metadata removal and orientation, not just header checks. Unsanitized legacy metadata remains retained and unservable.

## Connected visual evidence

All seven affected workspaces execute at **1440, 1280, 768, 390**: Teacher Portal; Teacher schedule; Inspector directory; Teacher dossier; Inspector schedule review; Institutions hierarchy; Dashboard attention surfaces. Ignored `.cache/product-evolution-qa` PNGs are reproducible local evidence, not committed artifacts.

The flow exercises invitation/activation/login/private photo, conservative training/transfer gates, initial timetable, corrective response/acceptance, independent pending update, required rejection reason, visible rejected history, fresh revision and atomic acceptance. It asserts canonical values before/after decisions, server-paged 206-Teacher fixture / 25 visible cards, geography navigation, loading, empty and safe error states. Long Arabic Teacher and Institution names are visible, not merely present off-page. Keyboard/focus-visible, single main/h1, labels, RTL and document-overflow checks are retained.

**Real installed Google Chrome 200%: PASS.** The installed branded Chrome runs headless in a disposable profile with native Appearance → Page zoom → 200%, not Edge, CSS zoom, viewport emulation or a changed deviceScaleFactor. Measured baseline `{width:1422,dpr:1}` becomes `{width:711,dpr:2}`. Actual CDP viewport captures cover the seven affected surfaces plus requests/visits/follow-up and the long-name fixture; schedule captures scroll to the effective timetable without altering layout. Operator browser profiles are untouched.

Visual inspection confirms wrapping without page-level horizontal scroll, visible keyboard outlines, current/proposed/history distinction and reachable review actions. Narrow schedules intentionally stack day columns and require vertical scrolling; no redesign or global overflow clipping was introduced. Empty/loading/error are distinct; internal request identifiers are absent. Native file/date controls follow browser locale; Arabic labels remain explicit. This is basic accessibility/visual evidence, not full screen-reader or WCAG certification; final human visual acceptance remains with the Product Owner.

Harness corrections did not weaken business assertions: cache revision validation now supports the existing avatar; test focus starts in the main workspace rather than crossing shell breakpoint teardown; Chrome settings use real browser geometry; synthetic HOME validity remains prospective across midnight instead of relaxing the date contract.

## Database / migration evidence

Only `127.0.0.1:55432 / task020_test / task020_test_user`. External credential remains process-only, never printed or tracked. Owned ephemeral schemas are clean-applied then removed; private test assets are process-owned temporary directories. Public/UAT fingerprints are compared by the evolution integration/browser harnesses.

- Pre-existing migration: `20261005180000_product_evolution_teacher_portal` — preserved byte-for-byte.
- One R2 migration: `20261005220000_product_evolution_r2_schedule_review` — additive origin/decision/rejection constraints, decision Inspector FK and photo sanitization marker.
- Clean chain: 23 migrations. Upgrade: 21 → 22 → 23, preserving original rows and the intermediate migration's correction/photo records.
- Final read-only public/UAT fingerprint equals the closing-gate baseline: `05a8e4921c06f40a015f480fad0b7d4b249e80de9996add1eccb0fc71a6c5aba`. Evolution/browser harness before/after comparisons also pass. Owned evolution/TASK-086/TASK-054 temporary schemas remaining: **0**. No persistent business or Session rows were changed by these gates.

## Acceptance gates

| Gate | Result / direct evidence |
|---|---|
| A — independent update end-to-end | PASS: connected Teacher proposal → Inspector review → accepted effective timetable |
| B — all Inspector writes closed | PASS: all four routes, including no-account Teacher; read-only review UI |
| C — no stuck stale submitted correction | PASS: safe conflict → explicit reasoned rejection → fresh proposal |
| D — canonical unchanged before acceptance | PASS: SQL and connected current/proposed assertions |
| E — reason and history | PASS: required reason, retained rejected proposal, readable Teacher result |
| F — real photo sanitization | PASS: real decoder/re-encode/orientation, sanitized-only persistence/serving |
| G — invalid photos denied | PASS: forged/truncated/malformed/unsupported/pixel-limit fixtures |
| H — object/role authorization | PASS: role/CSRF/object/district negatives, including photo and review decisions |
| I — Product Evolution / G9 regressions | PASS: 429 Web, 42 API unit, 197 DB, 33 evolution, connected and print gates |
| J — UAT/remote/Production isolation | PASS: owned schemas only, matching public fingerprints, approved local target only |
| K — documentation | PASS: independent review/rejection accepted; superseded Edge/header-only evidence labeled historical |
| L — no invented Product policy | PASS: unresolved training/transfer/retention/override decisions remain deferred |

## File scope

Recorded entry files: 80; none removed. R2 modifies 30 of those files; 50 remain byte-identical. It also changes four previously clean tracked files and creates four files. Ending inventory: 88 dirty files (50 modified tracked / 38 untracked), no deleted or staged files. Other pre-existing Product Evolution changes remain retained rather than being reattributed to R2.

The four newly modified tracked files are `packages/api/package.json`, `package-lock.json` (sharp and its normal lockfile dependencies, plus the bounded existing source-map-js security patch), `packages/api/test/task048-weekly-schedule.integration.mjs` (legacy regression migrated to Teacher-owned initial writes without weakening Inspector-write rejection, FK, date, overlap, race or rollback assertions) and `packages/web/src/visits/InspectorVisitReportV1Page.test.tsx`.

The last file changes one synchronous `getByRole` assertion to awaited `findByRole` for the **same** newest-version button. The existing conflict test observed error feedback before native Dialog.showModal's effect opened the dialog. Dirty-content preservation and exactly-one save/no-auto-retry assertions remain; no Report implementation, contract or styling changed. This is a required regression-gate timing correction, not a Report feature or weaker assertion.

R2 overlap with the 80-file entry snapshot:

- Docs: `API_CONTRACTS.md`, `ARCHITECTURE.md`, `CODEX_RULES.md`, `DATABASE.md`, `DECISIONS.md`, `IMPLEMENTATION_PLAN.md`, `TEST_STRATEGY.md`, `UI_MAP.md`, `architecture/PRODUCT_EVOLUTION_2026.md`, `architecture/PRODUCT_EVOLUTION_REPORT.md`.
- API/schema: `prisma/schema.prisma`; `src/audit/append.ts`; `src/schedules/routes.ts`; `src/teachers/directory-routes.ts`; `src/teacher-portal/{audit,photos,routes,schedules,workspace}.ts`.
- API tests: `test/{product-evolution-upgrade.integration,product-evolution.integration,product-evolution.test,task020-db.integration}.mjs`.
- Web: `src/teacher-portal/{client.ts,InspectorSchedulePage.tsx,TeacherPortal.test.tsx,TeacherPortalPage.tsx,TeacherScheduleEditor.tsx}`.
- Browser: `e2e/product-evolution.spec.ts`, `scripts/product-evolution-e2e.mjs`.

New R2 files:

- `packages/api/prisma/migrations/20261005220000_product_evolution_r2_schedule_review/migration.sql`
- `packages/api/test/fixtures/synthetic-photo.mjs`
- `packages/web/src/teacher-portal/ScheduleReview.test.tsx`
- This report.

`packages/api/package.json` and `package-lock.json` contain the one justified image-library addition relative to HEAD. No new framework, parallel schedule subsystem, distributed limiter, external service, final training verification, effective transfer, scoring, chat, official endorsement, AI, content wing, deployment or retention workflow.

## Still OPEN / handoff

Training-completion authority/evidence; final transfer and destination acceptance; effective date and historical access after transfer; ADR-014 retention/final deletion; future exceptional self-edit/administrative override. Independent later schedule review is **accepted and implemented**, not OPEN. ADR-013 official-content provenance remains untouched/out of scope.

SAFE_TO_COMMIT_PRODUCT_EVOLUTION: **YES**. A commit-ready code review is not permission to migrate persistent UAT or Production. After this report: bounded Product Evolution checkpoint review only, on explicit authorization. No next task executed. COMMIT: NONE. PUSH: NONE.
