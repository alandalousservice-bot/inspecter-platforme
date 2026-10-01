# TASK-084 — Teacher Information Card aggregate contract

Status: **COMPLETED**. Implemented and regression-closed on 2026-10-01 against the accepted contract below. Authority: [ADR-036](TEACHER_INFORMATION_CARD_ADR_036_CONTRACT.md), [TASK-080](TASK_080_TEACHER_ADMINISTRATIVE_MASTER_DATA.md), [TASK-081](TASK_081_STRUCTURED_TEACHER_QUALIFICATIONS.md), [TASK-082](TASK_082_TEACHER_SUPPLEMENTARY_WORKPLACES.md), [TASK-083](TASK_083_WORKPLACE_AWARE_SCHEDULE_VISITS.md), [ADR-034/035](../DECISIONS.md), and [TASK-054](TASK_054_INSPECTOR_VISIT_REPORT_V1.md). TASK-084 is a private, current, **read-only aggregate**. No card table, snapshot, Teacher-derived columns, schema migration, dependency or audit event was added. The TASK-053A connected regression fixture now includes a valid TASK-083 workplace/date slot; TASK-083 warning behavior was not changed.

## Time and source ownership

Capture one request instant and derive one `asOfDate` as `YYYY-MM-DD` in `Africa/Algiers`. The card describes current authoritative state at that request, not a selectable historical state. There is no `date=` parameter. A later GET may reflect changed Teacher, Institution, relationship, schedule or report facts. Existing Visit snapshots and report FINAL values remain historical sources and are never rewritten for the card.

The user must supply one canonical consecutive `academicYear=YYYY-YYYY` to select the weekly schedule and display its year label. Do not infer the Algerian school year from today's month, from Teacher, or from a Visit. The card UI may open without a year and ask for one before calling the API; it must not silently choose one. The selected label does **not** define the validity of a slot. All current relationship/slot decisions use `asOfDate`; no date or year is persisted on Teacher for the card.

| Card fact | Authoritative source / rule |
|---|---|
| Identity/contact/professional/admin | Current `Teacher` fields. `name` is الاسم; `surname` is اللقب. `birthProvince` is distinct from `placeOfBirth`. `employedAt` is general employment date, not first appointment or installation. `confirmedAt` is تاريخ الترسيم when recorded. `professionalFramework` is independent of `professionalStatus`. |
| Home | Current `Teacher.institutionId` joined to `Institution`; no historical home inferred. Home-specific appointment fields live on Teacher and describe this link only. An archived linked Institution remains shown with `archivedAt`, not silently hidden or replaced. |
| Institution email | `Institution.email` of the linked home. Never Teacher email or a copied Teacher field. |
| Supplementary workplace | `TeacherSupplementaryWorkplace` joined to its Institution; include only `validFrom <= asOfDate < validTo` or open end. A currently valid relation to an archived Institution remains visible and marked archived; archive does not erase the link. |
| Qualifications | `TeacherQualification` rows in TASK-081 order. `Teacher.qualifications` is separate legacy free text; never parse, backfill or overwrite it. |
| Weekly distribution | The single `WeeklySchedule` for the explicit year, with dated slots whose validity contains `asOfDate`, grouped by weekday regardless of today's weekday. Legacy NULL date/location slots appear separately as unknown, not as verified current slots. Expired/future dated slots belong on the existing schedule page, not this current summary. |
| Last inspection | Latest `PedagogicalVisit` for this Teacher with `status=COMPLETED`, `visitType IN (TENURE_CONFIRMATION,PROMOTION_EVALUATION,MONITORING_FOLLOW_UP,EXCEPTIONAL)`, and non-null `occurredAt`; order `occurredAt DESC, id DESC`. Return the Algeria local **date** of its `occurredAt`, or null. Exclude GUIDANCE, NULL type, PLANNED and CANCELLED. No external visit is invented. |
| Pedagogical mark | Latest qualifying `InspectionReport` with `status=FINAL`, `reportType=INSPECTOR_VISIT`, `templateSource=PRODUCT_OWNER_ADOPTED`, `templateVersion=1`, non-null exact `pedagogicalMark`, joined to this Teacher's `PROMOTION_EVALUATION` Visit. **ADR-036 explicitly orders by `finalizedAt DESC, report.id DESC`**, not Visit time or report `updatedAt`. Return the canonical decimal string or null; never zero for absence, a calculated average, or legacy `markText`. |
| Organizational context | `District.name` of the Teacher and the active session Inspector's optional professional `name/surname`, plus the user-selected year. No Directorate/Inspectorate/province hierarchy, ministry provenance or static paper header is inferred or persisted. |

The last inspection and mark are **independent** queries. A newer completed monitoring Visit supplies the former even when an older finalized promotion V1 report supplies the latter. A mark may be `0` only when that exact numeric value was actually recorded; null means unavailable. The five existing professional-status values remain distinct: `PERMANENT`, `TRAINEE`, `CONTRACT`, `TEMPORARY_CONTRACT`, `SUBSTITUTE`; reuse accepted Arabic labels, with no new enum or inference.

## Inspector API and exact read projection

`GET /api/v1/teachers/:teacherId/information-card?academicYear=YYYY-YYYY` returns `200 {data:{card:Card}}`. The UUID path and **sole** query parameter are strictly validated with the existing Zod/error envelope. A missing, malformed, repeated or unexpected query parameter is `400 VALIDATION_ERROR`; no body is accepted. Set `Cache-Control: no-store` and retain the request ID header. Require an ACTIVE authenticated Inspector and a current `InspectorDistrictMembership` in `Teacher.districtId`. Check the scoped Teacher before reading its children; nonexistent and out-of-scope Teacher both yield the same generic `404 NOT_FOUND`. No owner-only Visit/report route is used to widen access, no public/Teacher-account route, no card PATCH, and no district ID from the client. This card is a deliberately privileged Inspector district projection; ordinary directory/Visit/FollowUp/report/public projections stay unchanged.

`Card` has the following exact shape. `?` below means a field sourced from a nullable DB value, **returned explicitly as `null`**, not omitted. All PostgreSQL DATEs are `YYYY-MM-DD`, instants are ISO UTC if present, and `pedagogicalMark` is an exact canonical decimal string. An absent collection is `[]`, while an absent single record/derived value is `null`.

```text
Card = {
  asOfDate: YYYY-MM-DD,
  academicYear: YYYY-YYYY,
  teacher: {
    id, name, surname, birthDate?, placeOfBirth?, birthProvince?,
    phone?, email?, professionalStatus?, professionalFramework?,
    employedAt?, confirmedAt?, firstEducationAppointmentDate?,
    firstEducationAppointmentDecisionNumber?, firstInstallationDate?, traineeshipDate?,
    administrativeCategory?, administrativeSection?, administrativeGrade?,
    administrativeClassificationEffectiveDate?, personalAddress?, administrativeNote?,
    recordStatus, archivedAt?
  },
  homeInstitution: null | {
    id, name, municipality?, email?, archivedAt?,
    appointment: { institutionAppointmentDate?, institutionAppointmentNumber?, financialControllerVisaNumber? }
  },
  currentSupplementaryWorkplaces: [
    { id, institution: { id, name, municipality?, archivedAt? }, validFrom, validTo? }
  ],
  qualifications: {
    items: [{ id, name, issuingBody?, qualificationDate? }],
    legacyText: string | null
  },
  weeklySchedule: null | {
    academicYear, revision,
    currentSlots: [{ id, dayOfWeek, startMinute, endMinute, institution: { id, name, municipality?, archivedAt? },
      validFrom, validTo?, workplaceBasis, consistency: { status, reasonCode? } }],
    legacyUnknownSlots: [{ id, dayOfWeek, startMinute, endMinute,
      institution: null, validFrom: null, validTo: null, workplaceBasis: null,
      consistency: { status: 'LEGACY_UNKNOWN', reasonCode: 'LEGACY_LOCATION_UNKNOWN' } }]
  },
  inspectionSummary: { lastInspectionDate: YYYY-MM-DD | null, pedagogicalMark: decimal-string | null },
  organizationalContext: { district: { name }, inspector: null | { name, surname } }
}
```

In the shape above, `?` is explanatory notation for an explicit nullable response field, not optional JSON omission. `homeInstitution:null` represents no approved home; its appointment fields appear only with a home. `weeklySchedule:null` means no schedule for the selected year, while an existing empty schedule has both arrays empty. The current slot array is ordered by `dayOfWeek,startMinute,endMinute,id`; legacy slots use the same order. Include every currently applicable slot even when its TASK-083 consistency is `NEEDS_CORRECTION`, with its existing `reasonCode`; do not fix or hide it. The card must reuse the TASK-083 consistency projection through a shared read helper rather than implement different correction rules. Institution names are current labels, not historical snapshots. The `institution` on a dated slot may remain archived and must retain its correction state. No slot notes, group/level text, contact fields, raw audit metadata, whole Visit/report body or submission snapshot are copied into this aggregate.

Only the derived date and mark are exposed in `inspectionSummary`. The source paper and accepted ADR-036 require those values, not source navigation. Existing Visit and Report detail routes are restricted to the Visit's owner, while the card is district scoped; a source link could fail for another authorized Inspector. Do not expose `visitId`, `reportId` or source-detail links in TASK-084. A future owner/access decision may add provenance navigation without changing these derivations.

## UI and privacy

Use `/app/teachers/:teacherId/information-card` under the existing authenticated `/app` shell. Add a route link from the Teacher profile and a card action from each authorized directory row; preserve existing profile and schedule navigation. The page is Arabic/RTL, responsive, keyboard accessible, and uses existing tokens/primitives. It shows a year selector before data fetch, keeps the selected year in its own URL query, and never guesses a year. Sections: «الهوية والمعلومات الشخصية»; «الوضعية المهنية والإدارية» (distinct appointment/installation/traineeship/confirmation dates); «المؤسسة الأم»; «مؤسسات تكملة النصاب الحالية»; «المؤهلات والشهادات» with visibly separate «مؤهلات سابقة غير مفصلة»; «التصنيف الإداري»; «آخر تفتيش والنقطة /20»; «التوزيع الأسبوعي الحالي» with a link to the full year schedule; and «معلومات إدارية إضافية». The card is a read page; edits use the existing profile, Institution, supplementary-workplace, qualification and schedule routes. Do not add a card mutation endpoint.

Use neutral, specific missing states: «لا توجد مؤسسة أم معتمدة» for null home, «لا توجد تكملة نصاب حالية» for an empty current supplementary list, «لم يُسجَّل جدول لهذه السنة» for null schedule, «موقع/فترة الحصة غير موثقين» for legacy slots, and «غير متوفر» for absent administrative facts/date/mark. An archived linked Institution is labeled «مؤرشفة» alongside its current link; no false active claim. `NEEDS_CORRECTION` is shown as a warning, with its established Arabic reason and link to the schedule, never hidden. Multiple workplaces/qualifications remain separate rows. Long private text wraps safely. No photo storage or implied photo, digital signature, marital status, ambiguous OCR field, official Ministry claim, A4/PDF/print CSS, or automatic mark calculation.

`personalAddress`, `phone`, personal `email`, administrative references and `administrativeNote` may appear **only** on this authorized card and existing expressly authorized detail surfaces. The note remains Inspector-only administrative context. Do not copy private values into URL query, logs, errors, AuditLog, directory rows, Visit/FollowUp lists, unrelated reports, public intake/receipt or search. GET creates no AuditLog event. `Institution.email` comes only from the current linked Institution and is not exposed by schedule slots or ordinary directory rows.

## Bounded query and regression requirements

Capture the same request instant for scope check and Algiers date. After a scoped Teacher read, use targeted, selected-field queries: current home/Institution and District; current Inspector professional name; currently valid supplementary rows joined to Institution; qualification rows in TASK-081 order; at most the one `WeeklySchedule` for explicit year and its currently valid plus legacy slots with the shared consistency projection; `findFirst`/`LIMIT 1` for latest eligible Visit and latest qualifying FINAL promotion Report. Do not load all Visit/report history or all years, and do not query per qualification/slot/workplace. Existing unique `(teacherId,academicYear)`, Teacher/Visit/report FKs and per-Teacher indexes suffice for the initial detail endpoint; no speculative index or migration. Measure query count/plan with 180+ Teachers and realistic history before proposing a later index.

The implementation test suite covers:

1. ACTIVE Inspector/current membership; inactive/unauthenticated rejection; generic 404 for nonexistent/out-of-scope Teacher; strict year/UUID/unknown query validation and no-store/request ID.
2. Exact Teacher/admin field mapping, five distinct statuses, optional nulls, private administrative note only in authorized card/profile, current home with `Institution.email`, no home, archived linked home displayed and labeled without historical inference.
3. Supplementary current/expired/future and `validTo` half-open boundary, multiple current rows in `validFrom DESC,createdAt DESC,id DESC`, archive label and no collapse into one workplace.
4. Multiple qualifications in `qualificationDate DESC NULLS LAST,createdAt DESC,id DESC`; legacy free text independent and unchanged; no parsing/backfill.
5. Current dated slots for **all weekdays** valid on Algiers `asOfDate`, no future/expired slots in current summary; legacy unknown separate; inconsistency retained after workplace change; null schedule versus empty schedule; full schedule page remains available.
6. Latest eligible inspection by `occurredAt DESC,id DESC`; GUIDANCE, NULL type, non-completed and null occurrence excluded; deterministic UTC/Algiers date boundary and null when absent.
7. Latest qualifying mark by **`finalizedAt DESC,report.id DESC`** and exact Decimal serialization; reject DRAFT, legacy type, wrong template/source/version, non-promotion, null mark; null when none. A newer monitoring Visit and older promotion mark remain independently selected.
8. Privacy regression: no added fields in public intake/receipt, directory, Visit/FollowUp/report lists or AuditLog metadata; no read AuditLog event. No unbounded history or N+1 loading.
9. RTL/accessibility/responsive UI: year selection, missing/long values, multiple rows, archive/correction/legacy states, profile/schedule navigation, no unsupported edit/print/photo/signature controls.

Connected E2E on the approved isolated PostgreSQL target: Inspector login → Teacher directory → Teacher profile → card after explicit year selection. Fixture includes home A with email, current supplementary B, structured qualification plus separate legacy text, current B schedule, a newer completed monitoring Visit and an older completed promotion Visit with FINAL V1 mark. Verify each card value against its source. Close B or change an administrative field through its existing authorized workflow, reload the card and verify it reflects current truth without card persistence. Required regressions include TASK-080/081/082/083, TASK-044/045, public intake/acceptance, TASK-050/051/052/053/053A/054, plus typecheck, lint, full UI/API/DB tests, build, smoke, connected E2E and `git diff --check`. Use only verified isolated DB; never production/remote/5432. No new dependency is expected.

TASK-085 public intake changes, TASK-086 printing, TASK-060/ADR-013, photo/signature, marital status, home/HR/classification history, card snapshots, new organization hierarchy, OCR guesswork, official-template claims, scoring/ranking, notifications and PDF/print styling remain outside TASK-084. ADR-014/017 remain independently OPEN. Completion evidence: API integration 166/166, UI 180/180, API unit 30/30, typecheck/lint/build/smoke PASS, isolated connected DB migrations on `127.0.0.1:55432`, TASK-084 E2E 1/1, TASK-053A/TASK-051 E2E 2/2, TASK-083 E2E 1/1, and required connected regressions PASS; no schema/migration/dependency changes. `git diff --check` PASS.
