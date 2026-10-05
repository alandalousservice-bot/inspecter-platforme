# Protected contracts and safety

## Dashboard — ADR-037

The bounded read model is authoritative. No fabricated metrics, charts without contract, rankings, AI insights, promotion-mark analytics, activity feed, GPS/map widgets, chat or notifications. Failed data is not zero. Current membership/ownership scoping belongs to the server; UI must not widen it.

## APP versus PRINT

Protect `docs/DESIGN_SYSTEM.md`, TASK-086 and G8-10 adopted print contracts. Visit Report uses the adopted exact two-page A4 template, grayscale, established pagination and provenance. Do not alter its print CSS, layout, page count, source attribution or print actions in a screen-only task. Teacher Information Card print remains independently isolated. Preserve public/login isolation and shell exclusion from printed documents.

## Database / credential safety

Only the approved isolated local PostgreSQL target 127.0.0.1:55432 may be used for integration tests, with verified test database/user and temporary schemas as the existing test harness requires. No port 5432, Production, Neon or remote DB. Preserve persistent UAT: tests do not reseed/reset its business data. No credentials, DB URLs, tokens, personal payloads or secrets in output, tracked files, logs or error details. Do not read secret sources merely for design review.

## Scope gate

Use available authorized data or STOP. Ambiguous lifecycle/eligibility or out-of-scope API/schema/auth/business changes require architecture decision, not executor guessing. Deferred OPEN/PROPOSED ADRs stay deferred; no silent acceptance. Master/ArenaSPEX remain READ-ONLY, no runtime dependency on ArenaSPEX. Dependency, commit and push permissions come from the current task, never a skill.
