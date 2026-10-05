---
name: inspector-ui
description: Guide Inspector Platform UI, UX, frontend presentation, workspace layout, page hierarchy, forms, tables, record lists, documents, dashboard, sidebar and shell design. Use for Arabic typography, RTL/Bidi, responsive behavior, accessibility, visual QA, critique and screen redesign in this repository. Preserve the accepted ArenaSPEX-family theme and domain contracts; external design skills are advisory only.
---

# Inspector UI

This is an execution guide, not a second product specification. Product truth wins; use `inspector-domain-guardrails` alongside this skill. Read the task and `docs/CODEX_RULES.md`, then the relevant entries in `docs/UI_MAP.md`, `docs/DESIGN_SYSTEM.md`, `docs/DECISIONS.md` and the screen's API contract. Resolve paths from the repository root, not this skill directory. Do not reread the entire Master for a bounded task unless contracts conflict.

Read [visual-language](references/visual-language.md), [workspace patterns](references/workspace-patterns.md) and [QA](references/qa.md) before design or review. Inspect the actual target component/CSS and current visual evidence; code-only review must disclose that limit.

1. Identify the Inspector's job, workspace family, density, existing data and allowed actions.
2. Preserve the current accepted visual identity, route/interaction semantics and print isolation. Propose the smallest presentation change serving the task.
3. State primary, secondary, navigation and destructive/final actions. Compose only necessary header/context/toolbar/content/pagination blocks.
4. Use shared PageContainer, PageHeader, FilterBar, WorkspaceStack, RecordList, DataTable, states and form primitives where appropriate. Do not create parallel tokens or containers.
5. Critique hierarchy, scan speed, density, nesting, whitespace, action priority, type, RTL, accessibility, responsiveness and unnecessary decoration. Validate the task's gates before completion.

## External critics

Read `docs/CODEX-SKILLS.md` before explicitly using `$impeccable audit` or `$hallmark audit`. They critique within the Inspector brief; they do not choose product scope, brand or dependencies. No launcher, hooks, subagents, generated PRODUCT.md/DESIGN.md, Hallmark cache/stamps/token exports or external services are authorized merely by invoking a critic. Missing data: use the allowed subset or STOP. Contract conflict: STOP → BLOCKED → request architecture decision; never silently update contracts.
