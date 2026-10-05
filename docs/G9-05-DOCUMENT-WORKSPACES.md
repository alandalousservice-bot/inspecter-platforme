# G9-05 — Document workspace verification

Baseline: `28b8007226ba3e6ff01cbb6ca7fef9a089693516`, `master`, synchronized and clean before edits.

## Presentation

Both existing editors remain on `/app/visits/:id/report`; the existing type-aware dispatcher selects Inspector Visit V1 or inspector-authored legacy accompaniment. No new route, endpoint, per-section fetch, aggregate or document type was introduced.

`WorkspaceStack density="document"` supplies the existing 72ch reading width. Compact `PageHeader`, shared buttons, feedback states and confirmation dialogs are reused without extending primitives. V1's eleven numbered, accessible sections now share one document surface with restrained separators rather than eleven separate cards. Narrative controls span the reading column; optional promotion mark has ordinary input styling, not a colored score panel. Context retains the Visit institution and the existing final identity snapshots. Academic-year text is bidi-isolated. The accompanying legacy editor retains seven fields, quiet context/finalization separators and single-column narrative; contextual FollowUp now follows its content.

Save/finalize eligibility, explicit save, dirty/revision protection, confirmation and FINAL read-only behavior are unchanged. Save is secondary where finalize already exists; no new lifecycle inference. Existing Visit navigation and Teacher Profile links use available IDs. The new V1 Teacher link respects the existing unsaved-content confirmation. Print URL and eligibility are untouched. FollowUp remains an explicit independent action under existing FINAL eligibility; no automatic creation.

## Validation evidence

- Focused UI: V1 17/17, accompaniment 10/10, Visits 34/34, FollowUp 11/11, Teacher Profile 24/24, G9 foundation 10/10, existing print component 3/3; combined 109/109.
- Full web 388/388; API unit 33/33. Typecheck, lint, production build, smoke 2/2 and diff whitespace checks passed.
- Unchanged `task052-reports.integration.mjs` and `task053-followups.integration.mjs`: 16/16 including suite parents (9 report/accompaniment/V1 cases and 5 FollowUp cases). Clean/upgrade, historical snapshots, optional exact promotion decimal, state/revision races, atomic audit, FINAL immutability and contextual FollowUp compatibility passed.
- Database target verified as `127.0.0.1:55432`, `task020_test`, `task020_test_user`; integration fixtures lived solely in uniquely named temporary schemas cleaned by the tests. No persistent UAT business rows, remote database or port 5432 access; no credentials written to the repository.
- `node scripts/g9-05-document-qa.mjs` uses intercepted synthetic API responses only, installed Chrome and a disposable browser profile. Both editors passed 1440/1280/768/390 CSS px, one h1, RTL, labels, visible focus and keyboard Tab from save to finalize. DRAFT/FINAL, five Visit types, promotion mark present/absent, Arabic narrative, validation feedback and loading/error were checked. Real Chrome 200% zoom changed DPR 1.25→2.5 and width 1427→713; both documents retained accessible fields/actions without horizontal overflow. Screenshots are local temporary evidence, not tracked fixtures. Visual review covered desktop/tablet/mobile, narrative, FINAL/FollowUp and zoom captures.
- `node scripts/g8-10-visit-report-print.mjs` passed normal/minimal/dense: exactly two A4 portrait pages each (594.96×841.92 points), no sheet overflow, grayscale and shell/control isolation. The additional document browser gate checks hidden Sidebar/TopBar/mobile menu through their hidden ancestors under print media. G8-10 template, provenance, print components/CSS and pagination are byte-unchanged. Information Card print is NOT_REQUIRED because no shared or print code changed.
- Bundle: JS 577.34 kB (+0.78 versus 576.56); CSS 124.75 kB (-1.27 versus 126.02). Existing >500 kB JS warning remains deferred; no dependencies or code-splitting work.

## Scope closure

Only the two screen components, their two scoped `@media screen` styles, two focused test files, one synthetic browser QA script and related documentation changed. No API/auth/schema/migration/contract/business changes, AI authoring, scoring/ranking or Ministry-authority claim. Directory, dossier, Institutions, Visits/detail, FollowUp list, Submissions, Dashboard, Shell and Information Card remain unchanged. Known G8 debts are not reopened.

G9-05 implementation/automated gates: PASS. Product Owner review remains the next step; G9-06 was not started.
