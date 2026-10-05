# G9-06 — Teacher Requests / Review Workspace

Status: COMPLETED / PASS. Baseline: `113de0cb307760a955ca89265fa98e98fb783f74` on clean synchronized `master`.

## Presentation and preserved contracts

Existing routes remain `/app/submissions` and `/app/submissions/:id`. The former nested list/filter cards and six-column table become **HYBRID_LIST_TABLE / OPERATIONAL_REVIEW**: compact header → existing q/status toolbar and trustworthy total → five grouped columns → existing cursor pagination. At 768px the same rows become two-column structured records; at 390px identity/workplace span the record, state and advisory share a compact metadata row. There is one DOM/interaction tree, a semantic table with accessible-only caption, explicit cell/row roles and mobile labels. No oversized card wrapper or clickable row.

Each row emphasizes declared identity, birth date, declared workplace, submitted time, textual review status, advisory boolean and an explicit review link. The list read model supplies no professional status/contact details; no extra fetch is introduced to obtain them. Existing `q`/`status` URL state, server filters, total, page size 25, cursor history and pagination are unchanged. Loading, empty, query-empty and safe retryable error remain distinct. Failed totals display “غير متاح”, not a valid zero.

Detail hierarchy: compact identity header → review status/submitted date → accepted Teacher link where available → declared identity/contact/professional fields → declared workplace → minimized duplicate advisory → existing explicit decision controls → administrative/qualification/supplementary declarations → existing location proposal review. FormSection replaces repetitive card wrappers; missing optional data is not fabricated. Terminal requests are marked read-only for the submission decision; independent location review retains its own existing eligibility.

[ADR-011 and ADR-026/027](DECISIONS.md) and [submission API contracts](API_CONTRACTS.md#inspector-submission-reads-and-potential-duplicates-task-032) remain authoritative. Duplicate context is advisory only: no confidence, ranking, recommendation, merge, automatic acceptance/rejection/link or overwrite. No new candidate endpoint or per-row fetch. PENDING/INTERNAL_REVIEW decision eligibility, explicit confirmation, CSRF, conflict feedback, atomic persistence/audit and refresh behavior are unchanged. ACCEPTED/REJECTED have no submission decision actions. Acceptance never silently approves declared institutions. Canonical coordinates remain Institution-owned, with independent explicit location review. All five professional statuses retain their labels, including SUBSTITUTE. There are no Teacher accounts.

G9-01 primitives used: WorkspaceStack operational, compact PageHeader, workspace FilterBar, compact shared states, Pagination; existing StatusBadge/Button/Dialog and FormSection. No primitive extension. The bounded responsive native table is request-specific, avoiding a shared DataTable contract change. New CSS is screen-only and scoped to these two workspaces. Public intake, every other workspace, shell, shared styles, API/client contract, auth, Prisma, migrations, dependencies and print are unchanged.

## Verification — 2026-10-05

| Gate | Actual result |
|---|---|
| Requests/detail + decisions + location review + policy | 46/46 PASS (17 + 13 + 13 + 3) |
| Teacher Profile | 24/24 PASS |
| Teachers Directory | 20/20 PASS |
| Visits | 34/34 PASS |
| Follow-up | 11/11 PASS |
| G9-01 foundation | 10/10 PASS |
| Combined focused run | 145/145 PASS |
| Full Web | 393/393 PASS |
| API unit | 33/33 PASS |
| TASK-032 submissions DB integration | 8/8 PASS |
| TASK-034 decision DB integration | 9/9 PASS |
| TASK-077B location proposal DB integration | 14/14 PASS |
| typecheck / lint / build | PASS |
| smoke | 2/2 PASS |
| git diff --check | PASS |
| Print regression | NOT_REQUIRED: no shared primitive/style or print consumer changed |

`node scripts/g9-06-requests-qa.mjs` runs real Chrome on its own loopback Vite port 5196 with synthetic intercepted API responses. It checks list/detail at 1440/1280/768/390, long Arabic/mixed Latin workplace/identity, Bidi contacts/dates, no page horizontal overflow, one h1, named semantic table, keyboard focus, actual modal/Escape/focus restoration, existing filters/cursor requests, loading/empty/query-empty/error/retry, PENDING/INTERNAL_REVIEW/ACCEPTED/REJECTED, terminal action absence, accepted Teacher link, optional absence and 0/1/2 advisory candidates. All observed requests are GET; unexpected requests/mutations fail the gate. Existing component tests separately verify confirmed decisions, refresh and conflict semantics.

Real Chrome browser zoom uses the native appearance setting, not CSS scaling or device emulation: DPR 1.25 → 2.5 and CSS viewport width 1427 → 713 at 200%. Both workspaces pass geometry; all three eligible decision buttons remain unclipped. Native CDP screenshots preserve actual zoom. Screenshots were visually inspected for responsive records, detail, dialogs and zoom. Final evidence is local-only: `C:\Users\ous\AppData\Local\Temp\g9-06-requests-JvDu4W`; no screenshots or browser profile are tracked.

DB tests use only loopback 127.0.0.1:55432, database task020_test, role task020_test_user, fresh owned schemas and their cleanup. TASK-032/034 run from an existing temporary API runtime, hash-verified against 61 current API dist/schema/migration/test files, to avoid Prisma DLL regeneration against the running UAT runtime. TASK-077B runs from the repository and uses the shared schema safety helper. No persistent `public` migration/fixture/business writes, no UAT reset or interruption, no port 5432 or remote database, no exposed/stored credentials.

Final bundle: JS **578.84 kB** (+1.50 vs 577.34); CSS **127.62 kB** (+2.87 vs 124.75), uncompressed Vite sizes. The pre-existing >500 kB warning remains deferred; no splitting, dependency or unrelated G8 debt changes.

No new blocking defect. G9-07 was not started. STOP — return result to Product Owner.
