# G9-07 — Dashboard + Shell + Account Convergence

Status: COMPLETED / PASS (2026-10-05). Baseline: `4810d0904fc4d7b237079bc4b040d4b947b24d99`, master, clean, synchronized with fetched origin/master before edits. This closes the implementation wave, **not** Product Owner final G9 acceptance.

## Boundaries and sources

[CODEX rules](CODEX_RULES.md), [skill governance](CODEX-SKILLS.md), [design system](DESIGN_SYSTEM.md), [UI map](UI_MAP.md), ADR-016/037 and the existing professional-identity API contract govern this patch. Dashboard is COMMAND CENTER; Shell is NAVIGATION INFRASTRUCTURE; Identity is LIGHT DOCUMENT / ACCOUNT. No API/client contract, authorization, validation, lifecycle, business state, schema, dependency, public, print or other workspace implementation changed. Master and ArenaSPEX untouched.

Actual installed Codex app-server `skills/list`, forceReload, returned all four enabled: inspector-domain-guardrails and inspector-ui (repo), impeccable and hallmark (personal). Their entrypoints and required project/advisory audit references were read. Impeccable launcher/detector **NOT RUN** under the approved supply-chain boundary; context-loader fallback was explicitly disclosed, and existing project documents supplied context. Both external audits are instruction-guided manual source/rendered critiques, not engine health scores or a full WCAG certification. No hooks, external services, binary downloads, cache, stamp, font, token export or skill update.

## Pre-audit — source-backed recommendations

| Critic / finding | Classification | Inspector-specific action |
|---|---|---|
| Inspector skills: flat AppShell navigation does not express accepted G9 groups | ACCEPT | Group/order the existing routes only; retain the account area, exact Dashboard ownership and nested route behavior. |
| Impeccable accessibility: repeated Dashboard `عرض القسم` links lack distinguishing names | ACCEPT | Add a title-specific accessible name, retaining visible copy, destination and data. |
| Impeccable hierarchy / Hallmark repeated containment: Identity repeats context inside a Card and adds page padding | ACCEPT | Compact header, saved identity context, one FormSection/FormGrid, feedback and explicit save; existing PageContainer owns gutters. |
| Hallmark spacing: content-independent 13rem minimum and bottom-pushed Dashboard links leave unproductive sparse-card space | ADAPT | Screen-only content-driven minimum/link spacing; hide only empty item-list decoration. Retain real counts/categories and dense contextual items. |
| External catalog font/palette, asymmetric navigation, new icons, Hero replacement, blanket white-surface/card/eyebrow ban | REJECT | ADR-016 and the accepted Dashboard identity win; this is operational convergence, not a visual-world redesign. |
| Optimistic Undo, silent save, new account fields, charts/metrics or invented data | REJECT | Existing explicit save/feedback, identity fields and ADR-037 read-model boundaries win. |
| Global overflow clipping, no wrapping of long Arabic labels, new dark mode or decorations | REJECT | Resolve/test actual layout; preserve Arabic readability and existing theme/accessibility. |

Hallmark context-filtered pre-punch list: **0 critical / 0 major / 2 minor**, at `professional-identity.css`/Identity JSX (redundant padding/context) and `dashboard.css` (sparse-card spacing). Navigation grouping is a brief requirement, not an invented anti-pattern. Impeccable five dimensions: token/integrity and semantic baseline preserved; scoped navigation/spacing/accessibility improvements accepted; rendered responsiveness and focus verified below. No fabricated numeric audit score.

## Implemented composition

Sidebar groups, non-interactive labels:

- مساحة العمل → لوحة المتابعة (`/app`).
- ملفات الإشراف → دليل الأساتذة، طلبات الأساتذة، المؤسسات.
- العمل الميداني والمتابعة → الزيارات، إجراءات المتابعة.
- الحساب → هويتي المهنية (separate existing account area).

One existing navigation tree, no accordion/submenu/new destination. Groups have accessible names; in desktop collapse labels remain accessible but visually hidden, spacing tightens and the account separator disappears. Existing icons, ephemeral collapse, tooltip hover/focus, drawer Escape/focus trap/return, inert background and navigation-close behavior remain. TopBar retains only Session email, مساحة المفتش, logout and menu/collapse; no new fetch/data.

Ownership: exact `/app` is Dashboard; Teacher profile/information-card/schedules belong to Teachers; Submission detail to Submissions; Visit create/detail/report to Visits; Institutions, Follow-up and Identity retain their existing parent. No standalone report/accompaniment sidebar entry.

Identity: compact h1 → saved professional name/surname (or truthful incomplete status) → explicitly editable two-field form → supported error/success → save. Uses existing WorkspaceStack document, DetailList, FormSection, FormGrid and states. Saved context does not follow unsaved edits. GET/PUT, NFC/100-code-point/control validation, maxLength, loading, explicit save, in-flight guard and retry-after-save-error remain unchanged. No cancel/autosave/new account fields; load failure still instructs page reload instead of pretending data is empty. Bidi-safe saved text uses existing DetailList.

Dashboard decision: **LIMITED_ADAPTATION**. Preserve Hero, attention-first order, five categories, counts/items/asOf, aggregate request/refresh/retry and quick links. Only sparse spacing, empty-list decoration and accessible repeated link names change. No new metric, aggregation, graph, feed, rank or mark derivation. Zero is displayed only after a successful response.

## Browser / cross-workspace evidence

`node scripts/g9-07-convergence-qa.mjs`: PASS on the actual application in installed Chrome. Every API request intercepted using synthetic fixtures; unexpected requests and page errors = 0. No live backend/database. Screenshots outside Git in Windows Temp (`g9-07-visual-swFrxQ`; confirmation captures also `g9-07-visual-RCpuZl`). Screenshots were visually inspected, not merely generated. An initial focus assertion was corrected to use keyboard modality rather than pointer-origin programmatic focus; drawer captures now wait for the existing transition to finish. No application behavior was changed to make the QA run.

| Gate | Result / evidence |
|---|---|
| 1440 / 1280 | PASS: Dashboard/Identity, expanded and collapsed navigation, one h1/main, no page overflow; visible keyboard focus on collapsed account link. |
| 768 / 390 | PASS: both surfaces, fully opened grouped drawer, Escape/focus return, inert background, route-click close, readable labels and usable fields. |
| Actual Chrome 200% | PASS: Chrome settings page zoom, DPR **1.25 → 2.50**, CSS width **1427 → 713**; not CSS zoom or device-scale simulation. Both surfaces, drawer and form-control bounds checked. |
| RTL / Bidi | PASS: Arabic labels/headings, long saved identity, mixed isolated Session email and Dashboard date/numbers. No direction hack or global clipping. |
| Accessibility | PASS for bounded gates: named groups/links, active aria-current, unchanged one-tree drawer focus trap/return, h1/main, labeled fields and associated validation; meaningful Dashboard link names, textual states. Physical touch/assistive-technology certification not claimed. |
| Identity states | Unit/browser PASS: load/incomplete/prefill/edit/explicit save/client error/server save error/retry/success/load failure. Cancel NOT_APPLICABLE. |
| Dashboard truth | PASS: empty and dense fixtures, actual totals/items, error produces no count cards; retry uses existing aggregate request. |
| Public/login isolation | PASS: existing routes render no Sidebar/TopBar; source files unchanged. |

Bounded final journey PASS: Dashboard → Teachers → existing dossier → `زيارات الأستاذ` → Visit detail → report → Follow-up; Shell → Submissions → detail; Shell → Institutions → Identity. No business mutation, except synthetic intercepted Identity PUT. No public submission or persistent UAT write.

Cross-workspace review (no edits): Teachers/Institutions keep compact server-driven hybrid directory grammar; Submissions retains operational list/review and advisory candidates; Visits/Follow-up retain operational date/status/actions; Teacher dossier retains identity/current-vs-declared context and contextual navigation; both V1 Report and legacy Accompaniment keep document reading/edit/finalization hierarchy. Existing Visit create/detail Card compositions are outside G9-07 redesign scope, not a regression or mandate to flatten domain-specific controls. Their sources and full test suites were checked; journey covers principal links. `node scripts/g9-05-document-qa.mjs` independently PASS for both document families at all four widths, actual 200%, DRAFT/FINAL, long prose, five types, optional mark validation, load/error/focus. No out-of-scope defect introduced.

## Print / safety

All new Shell/Dashboard/Identity CSS rules are screen-scoped and owner-class-qualified. Shared tokens/primitives and print source/CSS unchanged. Teacher Information Card print bypasses AppShell before rendering navigation; its independent CSS excludes shell/header/drawer and retains A4/12mm/grayscale and pagination. Full web tests include its protected print-view/isolation assertions. **TASK-086 connected DB/PDF rerun NOT_REQUIRED** for this screen-only patch; no claim of a new 1/2/3 PDF run.

Additional actual `g8-10-visit-report-print.mjs` regression PASS on the unchanged local Vite application with intercepted fixtures: normal/minimal/dense all exactly **2 pages**, **594.96 × 841.92pt A4**, shell hidden, no sheet overflow. No Sidebar/TopBar/mobile navigation in print. Overall print isolation gate PASS. No print edits or DB access.

Database safety: NOT_REQUIRED / NOT_ACCESSED. No credential read/output, connection URL, DB schema, migration, UAT reseed/session, 5432/remote/production access. Persistent UAT preserved by non-access. Temporary browser profiles/screenshots/PDFs/build outputs remain untracked.

## Validation and post-audit

- Focused AppShell/Dashboard/Identity/workspace-foundation: **40/40 PASS**, including all requested nested active owners, group semantics, drawer route close and saved context/error association.
- Full Web: **401/401 PASS** (34 files, includes neighboring workspace/auth/public/print suites).
- API unit: **33/33 PASS**. No DB integration required by changed presentation code.
- typecheck, lint, production build, smoke **2/2**, QA-script syntax and git diff check: **PASS**. An initial test-only TypeScript option error was removed and typecheck rerun successfully.
- G9 foundation actual browser regression: **PASS**, four widths, keyboard/RTL/targets and real Chrome 200%.
- Final production main JS: **579.36kB** (579361 bytes); CSS **128.31kB** (128309 bytes). Against supplied approximate baseline JS 578.84/CSS 127.62kB: **+0.52/+0.69kB**. Small grouping/context markup and scoped CSS; no dependency increase. Existing >500kB warning remains known debt, not a changed warning threshold.

Post inspector-domain-guardrails: **PASS** — domain/action/data/navigation destination authority unchanged. Post inspector-ui: **PASS** — three distinct families, one gutter owner, Arabic/RTL, clear explicit save, no redundant Card nesting or generic metric invention. Impeccable manual post-audit: **PASS** — named accessible links and navigation groups, existing tokens, bounded bundle, responsive/focus/print evidence; detector NOT RUN. Hallmark manual post-audit: **PASS**, **0 critical / 0 major / 0 remaining task-owned minor** after scoped density/context corrections. Rejected false positives remain the accepted Hero, honest category cards, existing white surfaces, consistent operational typography and explicit feedback; no engine score or CSS stamp required.

No P0/P1 task regression found. No implementation wave or future feature started. Next: **STOP — Product Owner review / final G9 acceptance instruction**.
