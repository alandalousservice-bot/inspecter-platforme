# Domain boundaries

Sources: relevant entries of `docs/DECISIONS.md`, `docs/DATABASE.md`, `docs/API_CONTRACTS.md` and their linked architecture contracts. This summary cannot replace endpoint-specific fields, validation or lifecycle gates.

## Teacher and workplaces — ADR-036

Five professional statuses: PERMANENT, TRAINEE, CONTRACT, TEMPORARY_CONTRACT, SUBSTITUTE. SUBSTITUTE is distinct; professional status is not Teacher record state. No inference and no teacher accounts.

Teacher.institutionId is at most one current inspector-approved administrative home, nullable according to lifecycle. Supplementary workplaces are explicit dated relationships. Historical declarations are not authoritative current institutional data. A historical Visit's institution/context is never replaced with the Teacher's current home.

## Submissions — ADR-011/015 and later intake contracts

Public data remains declared until reviewed. Duplicate candidates are ADVISORY ONLY: no automatic merge/accept/reject/link or fabricated confidence. Existing acceptance contract controls Teacher creation and workplace decision; never infer approval from matching text. Historical declared institution snapshots do not become MAIN/SECONDARY assignments automatically.

## Location — ADR-039/040

Institution alone owns canonical coordinates. Teacher-proposed coordinates remain non-canonical until explicit authorized Inspector approval. No automatic approval, GPS/geolocation/geocoding, tracking or map SDK without a future explicit contract. Existing external directions links are not authorization to add embedded maps.

## Visits, reports, outcomes — ADR-031/034/035

GUIDANCE, TENURE_CONFIRMATION, PROMOTION_EVALUATION, MONITORING_FOLLOW_UP, EXCEPTIONAL are the five explicit visit types. Preserve historical unknown types without inference. Visit ≠ Report; planned/actual/retrospective semantics remain contracted.

Promotion pedagogicalMark: OPTIONAL, MANUAL, exact numeric 0..20, max TWO decimal places, NUMERIC(4,2). Never derive, rank, percentage-convert, color-grade, recommend or infer it. No automatic conversion/reinterpretation of legacy markText; no promotion-mark requirement copied to other types.

Report DRAFT → FINAL; FINAL immutable/read-only by contract. No invented REVIEW/APPROVED/SIGNED or implicit finalization; preserve concurrency checks and atomic audit. Inspector-authored accompaniment is not a proven Ministry template. No fabricated seal/signature/scoring/mark/generated recommendation.

FollowUp: preserve ownership and eligibility, no invented global creation, automatic generation or generated recommendation. Source Visit does not automatically grant report permission or prove report existence. Keep contracted FINAL Report linkage.
