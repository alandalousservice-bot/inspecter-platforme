# TASK-077 — Institution location proposal contract

Status: **ACCEPTED contract**, ADR-040 / Product Owner LP-01..LP-04. TASK-077A completes documentation only; runtime remains at TASK-076A. Read this contract with the relevant sections of DATABASE/API_CONTRACTS, ADR-038/039/040 and CODEX_RULES. No implementation is authorized by this document alone.

## Ownership and scope

Canonical WGS84 location belongs only to Institution. TeacherSubmission holds an untrusted proposal for its declared HOME/primary workplace only. No coordinates on Teacher, TeacherSupplementaryWorkplace, WeeklyScheduleSlot or PedagogicalVisit. Supplementary proposals and all browser/device geolocation are deferred; do not build speculative support. No teacher account, tracking, movement history, attendance location or visit proof.

## Public boundary and validation

Extend only POST /api/v1/public/districts/:districtId/submissions with optional `workplace.locationProposal:{latitude:string,longitude:string}`. Omission means no proposal; explicit null, incomplete pairs and unknown nested keys reject the request. Public submitters cannot supply Institution IDs, decision/status/source fields or widen district scope. Existing fields, path routing, 32 KiB body limit, 10 attempts/IP/15 minutes, strict validation and safe error envelope remain unchanged. Success remains exactly `202 {data:{receiptId}}`, request ID and no-store; no proposal status, coordinates, submitted PII or public lookup.

Reuse TASK-076A decimal syntax and exact semantic bounds: latitude -90..90, longitude -180..180, at most six fractional digits, strings only. Reject scientific notation, NaN, Infinity, numeric JSON, excess precision and half pairs before Decimal conversion; no silent PostgreSQL rounding. `0,0` is valid. TASK-075 import keeps ADR-038 unchanged: non-empty coordinates rejected, never mapped into a proposal. Only explicit manual public form entry is supported in MVP.

## Persistence and history

Reuse TeacherSubmission, with nullable typed fields:

- proposedInstitutionLatitude, proposedInstitutionLongitude: exact Decimal/NUMERIC(9,6), range and complete-pair checks.
- locationProposalStatus: String with allowed PENDING/ACCEPTED/REJECTED CHECK.
- locationProposalDecidedAt: decision timestamp; locationProposalDecidedByInspectorId: Inspector UUID FK.
- locationProposalInstitutionId: Institution UUID FK recording the resolved decision target where applicable.
- locationProposalDecisionReason: bounded structural reason, KEEP_CURRENT for that action; no free-text rejection requirement.

No coordinates means all proposal/decision fields NULL. A complete pair starts PENDING with no decision fields. Final states require decision time/Inspector; ACCEPTED requires the resolved Institution. Plain REJECT may occur before Institution resolution and need not fabricate a target. KEEP_CURRENT requires an actual current canonical location and resolved target. Preserve original coordinates and final decision fields; no reopening/update/delete API. Public creation and proposal persistence are atomic, without AuditLog. Do not duplicate proposal coordinates into submittedProfile or rewrite historical snapshots.

Use existing UUID/FK conventions; protect same-district target using Institution's existing (id,districtId) key or equivalent DB invariant. FK deletion is RESTRICT and key updates CASCADE. Exact Prisma mappings, bounded reason storage and necessary retrieval indexes belong to TASK-077B, not a new domain framework. No speculative spatial index, PostGIS or location history table. Proposal receipt time is submission submittedAt; decision time is locationProposalDecidedAt. Preserve existing timestamps and apply project conventions to new mutable persistence where applicable.

One forward-only migration in TASK-077B adds nullable fields and expands the Institution source CHECK. All historical submissions have no proposal; old canonical coordinates/source remain unchanged. No backfill, institution inference or previous migration edits. Global retention/delete/archive remains ADR-014 OPEN; no new deletion policy.

## Independent decision and authorization

Inspector-only detail may expose the proposal and its independent decision history after existing ACTIVE/session/current-district checks. Do not expand public, list, duplicate-candidate or Teacher projections with proposal coordinates. Proposal review does not alter duplicate matching or submission decision semantics.

ACCEPT requires all of: submission ACCEPTED; proposal PENDING; explicit existing Institution resolution/link workflow; target authorized in current Inspector scope, same district as submission and not archived. Use the accepted Teacher's authoritative home Institution linkage, not text matching or an arbitrary client-selected Institution. Rejected submissions and INTERNAL_REVIEW cannot approve proposals. REJECT is permitted for a PENDING proposal under submission district authorization without Institution mutation. KEEP_CURRENT resolves that proposal REJECTED with KEEP_CURRENT reason; no automatic closure of other proposals.

Create/link Institution first via the existing explicit workflow. Coordinates never create Institutions. A failed proposal transaction does not undo an already completed submission acceptance or Institution linking transaction.

TASK-077B defines the concrete strict decision route/request/response and documents it in API_CONTRACTS before UI consumption, within these accepted actions and invariants; no unrelated workflow or product policy. Mutations require existing CSRF, ACTIVE Inspector and current membership. Outside scope/absent resources use generic 404; stale/final decisions, changed canonical state/link or archived acceptance use safe 409. Do not reveal coordinates/PII in errors.

Protect both the pending proposal claim and Institution canonical state against concurrency using existing Prisma transaction/locking conventions and expected state or an equivalent authoritative stale-write guard. A lock alone must not silently approve replacement of coordinates changed since the Inspector's review. Recheck link, district, archival state and canonical state inside the decision transaction. Exactly one final decision wins; independent proposals cannot silently overwrite a newly changed canonical location.

## Canonical source and audit

Institution keeps nullable coordinate pair plus nullable String/VARCHAR(32) source, all-null or complete triple. Allowed sources after TASK-077B: MANUAL_INSPECTOR and TEACHER_PROPOSED_APPROVED. The latter only means a public declaration explicitly approved by an authorized Inspector, not Ministry/official/GPS verification or presence. Existing Inspector manual POST/PATCH still sets MANUAL_INSPECTOR; subsequent manual changes never erase original proposal history.

ACCEPT sets canonical coordinates when absent or explicitly replaces them when present, and sets TEACHER_PROPOSED_APPROVED. Even matching coordinates require the independent approval decision; audit Institution changes only when actual coordinate/source state changes. KEEP_CURRENT and REJECT leave canonical state unchanged.

Add INSTITUTION_LOCATION_PROPOSAL_ACCEPTED and INSTITUTION_LOCATION_PROPOSAL_REJECTED, entityType TeacherSubmission/entityId submission ID. Structural metadata allowlist: resolved institutionId when applicable and decisionReason KEEP_CURRENT only for that action; no coordinates, request body, names, addresses, device data or arbitrary prose. Required actor/district/requestId use the existing append contract. On actual canonical change append existing INSTITUTION_UPDATED metadata with changedFields including location and locationChange SET/UPDATE. Decision, canonical update and all required audits are one transaction; audit failure rolls everything back. Public creation adds no AuditLog.

## UX, privacy and future navigation

Public form: optional Arabic RTL section “موقع المؤسسة المصرح به”, two accessible manual fields and notice that Inspector approval is required. No Institution selector/UUID, maps, GPS permission or navigator.geolocation/getCurrentPosition/watchPosition. Values stay in ephemeral form state until explicit submit; no localStorage/sessionStorage/IndexedDB, automatic submission or coordinate URL parameters.

Inspector: declared workplace identity, authoritative linked Institution, current canonical location, untrusted proposal/provenance/status and explicit ACCEPT PROPOSED / REJECT / KEEP CURRENT controls. Replacement confirmation must describe the current state; safe stale-conflict refresh, keyboard/focus and responsive G6 primitives. No automatic matching, voting, latest-wins or nearest selection.

TASK-077E may expose “الاتجاه إلى المؤسسة” from canonical Institution coordinates only, through an explicit external Google Maps action. No in-platform map, embed, tiles, SDK, API key, route calculation or Inspector GPS. Pending/rejected proposal coordinates are never navigation input. Explain external destination sharing; do not include Teacher PII or Inspector origin. All application logs/audit metadata/public receipt/internal URL query parameters exclude coordinates.

## Verification contract

077B: clean+upgrade migration with no backfill; absence/valid pair/0,0/range endpoints/half pair/over-precision/scientific/numeric/unknown/null tests; public atomic persistence and no canonical mutation/audit; submission acceptance remains independent; exact eligibility/auth/CSRF/district/generic404/archive checks; acceptance SET/UPDATE/source, rejection/KEEP_CURRENT unchanged canonical; multiple independent proposals, stale link/canonical races and one-winner decision; audit rollback and no coordinate metadata; preserved history after later manual update; TASK-075 rejection unchanged.

077C/D: Arabic labels, validation/loading/empty/error/success, explicit submit/decision, accessible keyboard/focus/RTL and responsive widths; no GPS API, persistent storage, map, unsupported public lookup or auto-approval. 077E: absent location disables action; canonical-only external destination, no proposal navigation/PII/GPS/embed/SDK.

077F: connected public declaration → independent submission acceptance → explicit Institution link → proposal decision; concurrent proposals and stale guards, logs/errors/audit/storage privacy; TASK-075/076A, institutions/intake/review, home/supplementary workplaces, schedules, visits/reports/FollowUps/Dashboard/card regressions and exact TASK-086 1/2/3-page print isolation. Use isolated PostgreSQL test targets only; no 5432, production or remote DB. Apply task-specific checks plus typecheck/lint/tests/build/smoke/diff-check during implementation, not as runtime work in TASK-077A.
