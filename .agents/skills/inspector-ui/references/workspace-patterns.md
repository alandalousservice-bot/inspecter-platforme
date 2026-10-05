# Workspace patterns

Authority: G9 presentation rules in `docs/DESIGN_SYSTEM.md`, implemented routes in `docs/UI_MAP.md`, screen contracts in `docs/API_CONTRACTS.md`; ADR-037 owns Dashboard data.

| Family | Job | Density / pattern |
|---|---|---|
| COMMAND_CENTER | Dashboard: attention, priorities, next actions | Real attention summaries/cards; not directory grammar |
| OPERATIONAL_WORKSPACE | Teachers, Institutions, Submissions, Visits, Follow-up: search, scan, compare, review, act | COMPACT directories; OPERATIONAL visits/follow-up/review |
| DOSSIER_DOCUMENT | Teacher Profile, Visit Report, Accompaniment, Information Card: context, reading, explicit edit | DOCUMENT, comfortable section rhythm and reading width |

Default anatomy: compact header → optional context → work toolbar → content OR state → pagination when applicable. Omit unnecessary blocks. PageContainer owns gutters/width; AppShell owns main. Containers must represent meaningful units, not repeated border decoration. No Card inside Card inside Card; no Page/List/Results/caption repeats for identical content. Semantic captions may be accessible-only.

Patterns: HYBRID_LIST_TABLE for high-volume teacher comparison with dominant identity/dossier access and structured mobile records; STRUCTURED_RECORD_LIST for operational identity/context/date/state/action; ENHANCE_TABLE where column comparison matters; DOCUMENT_SECTIONS for dossiers. Do not force one pattern everywhere or replace directories with oversized cards. Long Arabic wraps; no fixed row height. A complex row with links is not itself clickable. Maintain one accessible interaction tree, not parallel desktop/mobile controls.

Actions: one clear PRIMARY, lower-weight SECONDARY, recognizable NAVIGATION, contextual DESTRUCTIVE/FINAL. Eligibility belongs to existing server/workflow contracts, never visual inference. Search/filter/pagination semantics remain server-side where currently contracted; no invented filters, counters, routes or sorting.

Loading ≠ Empty ≠ Error. Failed requests are not zero records. Distinguish filtered-empty where the existing contract permits; explicit retry where supported. Use shared feedback without oversized empty boxes or loss of meaning.

Dashboard asks “What needs my attention now?” Preserve attention-first hierarchy, honest counts, contextual items, current Hero identity and existing work links. No new charts, rankings, promotion analytics, activity feed, AI insights or metrics without accepted read-model contracts. Do not make operational workspaces copies of Dashboard.
