# Product evolution — 2026-10-05

Authority: Product Owner confirmed the supplied comprehensive Vision and SOL_6_1_MASTER_IMPLEMENTATION_TASK_FINAL.md on 2026-10-05. This is an additive evolution, not a rewrite. Original Master, ArenaSPEX, historical public submissions, legacy schedules and FINAL reports remain unchanged.

## Accepted explicit product changes / ADR-041

Permanent TeacherAccount is bound one-to-one to an existing Teacher. Inspector-authorized, district-bound onboarding replaces the old no-account assumption, not public intake review. Teacher and Inspector sessions, cookies, CSRF and routes are separate. Teacher does not gain Inspector authorization. Public intake never creates an account automatically. Inspector issues a single-use random invitation after manual identity confirmation; delivery is out of band, token is shown once, stored hashed, expires after 8 hours (existing fixed session safety convention); a new invitation invalidates unused prior invitations. Activation claims only the bound active Teacher in the invitation district. Login identity is independent of mutable Teacher contact email. Passwords use the existing scrypt service; no password reset/email service invented. Tokens are never audit metadata.

Teacher reads an explicit own-profile allowlist, never administrativeNote or other Teachers. Self service contact changes, training declarations and sensitive profile changes are versioned typed proposals; approval is explicit and atomic. Photo is a direct self-service asset, not professional master data. Workplaces remain Inspector-approved. No canonical Institution is created by a Teacher declaration.

Teacher training is nullable for legacy/unknown, otherwise NOT_STARTED/IN_PROGRESS/INCOMPLETE/COMPLETED. A declaration is not verified completion. Verification/evidence required to authorize COMPLETED remains isolated until Product Owner defines verification authority/evidence. New TENURE_CONFIRMATION is forbidden for CONTRACT, and for TRAINEE without verified COMPLETED training; existing visits/reports remain unchanged. Other employment categories acquire no invented eligibility restrictions.

R2 accepted Teacher-owned schedule state machine: initial POST becomes canonical immediately; independent later POST pins expected canonical revision and creates TEACHER_UPDATE SUBMITTED; Inspector request creates INSPECTOR_CORRECTION REQUESTED, Teacher response becomes SUBMITTED. Both origins → explicit Inspector ACCEPTED (snapshot + canonical revision + audit atomically) or REJECTED (required reason + retained proposal + audit, canonical unchanged). Invalid/stale acceptance returns 409 without changing either state; explicit rejection remains available and allows a fresh Teacher proposal. One open review per Teacher/year. All Inspector direct writes are blocked, even without an account; legacy canonical/history remains readable. No impersonation or exceptional override.

Teacher transfer request + originating Inspector decision are safe foundations only. Approval means APPROVED_PENDING_DESTINATION; never silently changes Teacher.districtId or historical access. Destination acceptance / Inspector replacement / historical permissions require a further ADR before effective transfer. ADR-017 remains OPEN for those residual points.

Directory becomes responsive professional cards with server cursor/q/filtering retained. Municipality uses existing Institution.municipality normalized text, not a fabricated official registry. Institution detail is authorized and derives approved home/supplementary Teachers. Training, requests and timetable belong in the dossier; no Dashboard giant timetable.

## Security / engineering contracts

- Teacher cookies: teacher_session HttpOnly, teacher_csrf readable, SameSite=Strict, production Secure, fixed 8h TTL. CSRF is session-bound with distinct role namespace. Pre-auth token for activation/login. Login/claim rate limiting uses the existing trusted-client-IP policy and bounded memory; production multi-instance distributed limiter remains a deployment prerequisite.
- New mutations audit atomic state changes with Teacher actor separately from Inspector actor; IDs/action/kind only, no PII/payload/secret. Old Inspector HTTP audit contract remains valid.
- Request payload discriminated by kind; strict Zod/NFC/bounded input; no generic arbitrary JSON write endpoint. Revision/CAS and baseline prevent stale approval. Decisions are scoped to originating district, no terminal replay.
- Photo storage interface has a private local adapter configured outside repository, fail-closed when missing. Only PNG/JPEG, input/output max 2 MiB; sharp 0.35.5 real full decode, strict truncated/malformed rejection, decoded dimensions ≤4096/pixel budget16777216, orientation normalization, safe re-encode with EXIF/GPS/metadata discarded; sanitized-version serving only, generated key, no user filename/path. Authenticated no-store/nosniff response, no SVG. Replacement keeps earlier metadata/assets without inventing retention. No arbitrary file manager or public static mount.
- Migrations additive and clean-applied only to owned schemas at approved local test target. Persistent UAT public schema unchanged. Production rollout requires explicit operator approval.

## Unresolved product boundaries — not silently accepted

2. What evidence/authority verifies COMPLETED pedagogical training (Teacher declaration alone cannot).
3. Destination Inspector acceptance and effective transfer date / same-district replacement / historical visibility.
4. Exact sensitive-field self-service approval policy beyond already-approved canonical workflows. Conservative proposal foundation does not automatically expand canonical fields.
5. ADR-014 legal retention/permanent deletion remains OPEN.
6. Future exceptional self-edit/administrative schedule override remains unapproved.

## ArenaSPEX selective UI evidence

Read-only source inspected: `src/components/schedule/WeeklyTimetableView.tsx` and `WeeklyScheduleView.tsx` on GitHub main. Rebuild with day columns, chronological session records and computed minutes summary. Do not copy fixed 08:00–17:00 assumptions, hardcoded signature identity, class-account model, palettes, official-document claims or remote runtime. Reference: https://github.com/alandalousservice-bot/arenaspex/blob/main/src/components/schedule/WeeklyTimetableView.tsx

## Verification / implementation record

The comprehensive evolution is not COMPLETED until final gates and end-to-end implementation pass. See PRODUCT_EVOLUTION_REPORT.md for actual delivered scope, test outcomes and residual work; previous individual task statuses are not rewritten retroactively.
