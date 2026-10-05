# Inspector design skills — G9-SKILLS-BOOTSTRAP

## Authority and mechanism

Order: Inspector product/domain contracts → inspector-domain-guardrails → inspector-ui → accepted repository ADRs/implementation contracts → Impeccable → Hallmark → generic model taste. Skills route to central contracts; they cannot override their source ADRs. Contradiction or missing authority: STOP → BLOCKED → request architecture decision. User task scope always bounds execution.

Verified on Codex CLI **0.160.0**, against [current OpenAI skill documentation](https://learn.chatgpt.com/docs/build-skills): repo discovery uses `.agents/skills` from cwd to repository root; personal discovery uses the user's `.agents/skills`. This repository's canonical project path is `.agents/skills`, tracked as governance. Do not create a second `.codex/skills` tree. Legacy/system `.codex/skills/.system` supplies the bundled creator/installer, not our project canonical path. Skill-only plugin packaging is another supported distribution mechanism, but no plugin, hook manifest or runtime integration is needed or installed here.

| Name | Location | Source / scope | Invocation |
|---|---|---|---|
| inspector-domain-guardrails | `.agents/skills/inspector-domain-guardrails/SKILL.md` | This repository / repo | `$inspector-domain-guardrails`; implicit enabled |
| inspector-ui | `.agents/skills/inspector-ui/SKILL.md` | This repository / repo | `$inspector-ui`; implicit enabled |
| impeccable | `C:/Users/ous/.agents/skills/impeccable/SKILL.md` | Official upstream / personal | `$impeccable audit <target>`; explicit-only locally |
| hallmark | `C:/Users/ous/.agents/skills/hallmark/SKILL.md` | Official upstream / personal | `$hallmark audit <target>`; explicit-only locally |

Codex CLI `/skills` also exposes selection. Discovery was proven by the installed app-server's `skills/list` with `forceReload=true`: all four returned enabled with repo/user scopes and zero errors for these paths. This is actual harness discovery, not just existence checks; it does not prove an LLM automatically selects a skill on every matching prompt. New turns can load them; restart if the desktop picker remains stale. No model run was needed for discovery.

Suggested bounded prompt: “Use $inspector-domain-guardrails and $inspector-ui for the authorized task; use $impeccable audit and $hallmark audit only as read-only advisory critics. Follow task gates; do not invent domain data.” No permission to begin G9-07 is conveyed by this example.

## Reproducible external provenance

| Skill | Authoritative source / pinned SHA | Skill path / license |
|---|---|---|
| Impeccable | [pbakaus/impeccable](https://github.com/pbakaus/impeccable), `ece38d9904b8a619b3f77cab476eacad09c4fb11` | `.agents/skills/impeccable`, Apache-2.0; SKILL metadata 4.5.0 |
| Hallmark | [Nutlope/hallmark](https://github.com/Nutlope/hallmark), `13ac0ec7e148655948100b6396439e481361d690` | `skills/hallmark`, MIT; 1.1.0 |

Installation: reviewed OpenAI bundled `skill-installer/scripts/install-skill-from-github.py`, download mode, exact `--ref` SHA, explicit `--dest C:/Users/ous/.agents/skills`. Anonymous GitHub archive retrieval; only skill subdirectories copied to personal storage, not entire repositories into this project. Root licenses retained with each local copy. No npm/npx/third-party installer or dependency install. Local metadata adaptation only: Impeccable openai.yaml gains an attributed explicit-only policy; Hallmark gains matching explicit-only metadata. Upstream SKILL.md bodies remain unchanged. Personal copies are not committed.

## Supply-chain and conflict review

Reviewed both entrypoints completely, repository inventories, installation guidance, package metadata and licenses; Impeccable Windows/shell launchers and nested agent metadata; relevant audit/mode and Hallmark audit/anti-pattern/output-contract references. Other external commands are NOT approved by this review. No third-party script, engine, detector, browser payload or nested agent was executed.

- Impeccable ships launchers and supporting scripts/data, no engine binary in the selected Git tree. Launcher can execute environment/cache/PATH binaries or download an engine plus SHA256 sidecar from upstream releases. Checksums do not independently attest a binary's behavior. Engine/executable/browser-script behavior is **not approved**. Its npx installer can install automatic hooks; neither npx nor hooks were used. Agent roles include asset production, source editing and DESIGN.md generation; do not spawn them under this adoption.
- Impeccable explicitly permits context-loader refusal/failure fallback. For this adoption refuse the launcher and disclose: “Context loading did not run; I’ll read the existing project context directly.” Use `docs/PROJECT.md`, `docs/DESIGN_SYSTEM.md`, relevant ADRs and linked contracts instead. Do not create PRODUCT.md/DESIGN.md. Manual code-level audit replaces detector findings; disclose detector NOT RUN, never claim full engine audit or fabricated health scores.
- Hallmark selected skill contains Markdown only (plus our local metadata), no scripts/hooks/dependency runtime. Its upstream installation README's legacy `.codex/skills` example is superseded here by verified `.agents/skills` discovery. “Powered by Together AI” is attribution, not permission to call that service. No provider key or service is required for instruction-only audit.
- Hallmark default/build modes write theme exports, CSS stamps and `.hallmark` caches/memory, rotate themes/navigation and can suggest asset/font libraries. **Only read-only audit is adopted**; no cache/stamp/export writes, generated design system, asset services or theme selection. Its top-level version field is accepted by the current harness; do not rewrite upstream merely to satisfy an older lint allowlist.

| External suggestion/conflict | Inspector override |
|---|---|
| New fonts/pairings, OKLCH conversion or catalog palette | Existing Arabic stack/tokens and ADR-016; no dependencies or second system |
| Giant marketing headings, asymmetry, gradients, decorative backgrounds, card grids | Inspector workspace family and operational density; preserve current accepted Hero, no new ornament by taste |
| Ban every white surface, three-column card group, eyebrow or state stripe | Contextual false-positive review: accepted white surfaces, meaningful Dashboard categories and semantic states are not automatically defects |
| Hallmark requires structural variety; Impeccable Operate values consistency | Consistent Inspector navigation/primitives; variety only where different jobs justify it |
| Prohibit wrapping clickable text / globally clip overflow | Long Arabic identity may wrap; solve overflow causes and test, never hide broken content |
| Motion/effects, icon libraries, browser tooling or screenshot extraction | Existing local SVG/reduced motion; approved tools/evidence only, no service upload or installation by skill |
| Optimistic Undo instead of confirmations; silent success | Existing explicit decision/finalization/feedback contracts, no lifecycle change |
| Automatic init/document/doctor/hook repair or Hallmark caches | No automatic writes or authority replacement; central docs remain sources |
| Impeccable mandatory dark-mode audit score | Light-theme contract only; dark mode not required, no invented failing score |

Update procedure: explicit bounded maintenance request; resolve a new upstream SHA, re-audit changed instructions/scripts/agents/license before replacement, preserve license and local explicit-only metadata, revalidate discovery/conflicts, record provenance. No automatic “latest”, hooks, binary download or dependency update. A task needing an unreviewed command must stop for a separate security/scope review; advisory-only availability is not full CLI approval.

## Read-only dry-run after G9-06

Targets: `packages/web/src/dashboard/DashboardPage.tsx` and `dashboard.css`; `packages/web/src/ui/AppShell.tsx` and `app-shell.css`; `packages/web/src/auth/ProfessionalIdentityPage.tsx` and `professional-identity.css`. Central sources checked: PROJECT, CODEX_RULES, DESIGN_SYSTEM, UI_MAP, ADR-016/037, relevant API and plan. Inspector skills supplied domain/family checks, Impeccable audit supplied technical dimensions, Hallmark audit supplied named anti-pattern checks. Source-backed review only: no browser/contrast measurement, detector, DB or UI mutation. This PASS validates advisory usability, **not G9-07 acceptance or WCAG conformance**.

| Surface | Preserve | Bounded G9-07 consideration |
|---|---|---|
| Dashboard | ADR-037 attention → upcoming visits → existing quick links, real counts/asOf, no failed-data zero, h1/section semantics, accepted green Hero, Bidi | `dashboard.css:67` imposes 13rem card minimum on desktop, with bottom-weighted links; inspect empty/dense balance and reduce unproductive space only if the task authorizes it. Do not replace legitimate attention categories with a directory or invent charts. |
| Sidebar/AppShell | Existing routes, exact `/app` active handling (`AppShell.tsx:137`), nested areas, account separation, collapsed labels, drawer focus/Escape/return, `inert` (`:165`), print/public isolation | Flat existing navigation (`:14`) can receive scoped grouping only after explicit G9-07 brief; retain destinations/order semantics and readable labels. No new section or feature implied by visual grouping. Revalidate hidden drawer keyboard exclusion and 200% zoom. |
| Professional Identity | Only current Inspector name/surname, explicit PUT, NFC/100-code-point validation, incomplete/loading/error/success and no email-derived name | Repeated title/explanation (`ProfessionalIdentityPage.tsx:56–58`) and extra page padding/centering (`professional-identity.css:1–5`) dilute a two-field task. Consider compact form hierarchy using existing page primitives; do not change validation, fields, auth or identity semantics. |

Impeccable dimension outcome: semantic labels/landmarks and drawer behavior present; token-based theming and no new dependency evidenced; responsive breakpoints/reduced-motion present. Performance and rendered contrast/touch/zoom need future task measurements, not made-up 0–4 scores. Integrity coherent with Inspector contracts, with the scoped density observations above; detector not run.

Hallmark punch list (context-filtered): **0 critical · 0 major · 2 minor**. `dashboard.css:67` content-independent minimum height: excess whitespace risk in sparse summaries; test a content-driven rhythm. `ProfessionalIdentityPage.tsx:56–58` repeated headings/context: condense hierarchy within the two-field job. White surfaces, existing Hero gradient, real attention cards and consistent navigation are rejected false positives, not invitations to restyle. No Hallmark CSS stamp requirement applies to this pre-existing Inspector system. Advisory verdict: preserve product-specific system; verify proposed density improvements in future browser evidence.

## Authority tests and closure evidence

| Test | Candidate suggestion | Result / reason |
|---|---|---|
| A | Teacher card grid | PASS: REJECT; HYBRID_LIST_TABLE and 180+ teacher scanning win |
| B | Dashboard chart | PASS: REJECT without accepted ADR-037 read-model change |
| C | New decorative gradient/palette | PASS: REJECT without explicit visual-authority scope |
| D | Duplicate confidence score | PASS: REJECT; candidates remain advisory, no invented confidence |
| E | Screen polish through Report print changes | PASS: REJECT unless print explicitly scoped |
| F | Hierarchy/spacing without domain change | PASS: ALLOW only within authorized task and its QA gates |

G9-07 constraints: explicit target/file plan; preserve Dashboard Hero/attention/read model, existing routes and professional identity fields; improve hierarchy/density only; existing tokens/one page container; no shell/public/print spillover; no invented data or dependency; one interaction tree; Arabic/Bidi, keyboard/focus, 1440/1280/768/390 and actual 200% browser QA; separate browser evidence from source assertions. This bootstrap does not start G9-07.

Validation: installed Codex `skills/list` discovered all four enabled without target parse errors; project frontmatter, metadata and relative links validated using existing `js-yaml` (no install). Bundled Python quick_validate was attempted but both available Python runtimes lack PyYAML; no dependency was installed to enable it. Actual harness discovery and equivalent bounded structural checks are the fallback, not a claim that that Python command passed. A–F and read-only dry-run PASS. Changed scope restricted to two project skills/references/metadata and this document; no application/package/lockfile/schema/API/auth/business/print/test changes. No DB/secret access or third-party execution.
