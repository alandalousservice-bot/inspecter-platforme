---
name: inspector-domain-guardrails
description: Protect Inspector Platform product and domain truth during implementation, refactors, UI/UX, navigation, data presentation, forms, reports, workflows and design changes in this repository. Prevent visual work from silently changing API, database, authorization, validation, lifecycle, persistence, dependencies or print contracts; stop on unavailable data or ambiguous eligibility.
---

# Inspector domain guardrails

This skill routes to contracts; it cannot override or create them. Read the task, `docs/CODEX_RULES.md` and relevant accepted ADRs in `docs/DECISIONS.md`. Use only the task-relevant API/Database/Architecture sections. Paths resolve from repository root. Read [domain boundaries](references/domain-boundaries.md) and [protected contracts and safety](references/protected-contracts.md) before proposing changes.

Inspector product/domain contracts → these guardrails → inspector-ui → accepted repository ADRs/implementation contracts → Impeccable → Hallmark → generic model taste. ADRs remain underlying contract evidence, not subordinated to a skill summary: an apparent contradiction is STOP, not permission to reinterpret an ADR.

UI improvement must not silently change domain model, business logic, API, schema/migrations, auth/permissions, persistence, validation/lifecycle or dependencies. Where data is unavailable, use only the authorized existing subset or STOP. Do not invent metrics, statuses, permissions, routes or actions.

Before editing: identify field ownership, declared versus approved data, lifecycle/eligibility, historical versus current context and source of counts. Keep external critics advisory. Read `docs/CODEX-SKILLS.md` for reviewed external modes and prohibitions. No automatic merge, acceptance, finalization or inferred professional outcome.

If a task requires an unresolved decision or an out-of-scope contract/API/schema/auth/business change: **STOP → BLOCKED → request architecture decision**. Preserve unrelated/user work, deferred decisions, Master and ArenaSPEX. Never expand scope to make a design work.
