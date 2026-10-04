# G8-VISUAL-A0 — Final ArenaSPEX Visual Integration Architecture Gate

Date: 2026-10-04. Status: PASS (architecture/source audit). Implementation: NOT_STARTED. This document does not claim browser visual parity or a newly executed runtime/print gate.

## 1. Executive Summary

Adopt **ArenaSPEX-family Professional Inspector Theme**, ADR-016 ACCEPTED. Inspector owns domain/API/security/persistence/workflows/print; ArenaSPEX owns visual identity and UX character; Candidate supplies secondary component engineering. Keep Inspector semantic components and behavior, map emerald identity through existing tokens, rebuild public presentation locally. No runtime dependency on references.

Inspector's muted teal/light Sidebar/system font/minimal login do not yet convey that identity. ArenaSPEX supplies deep-green navigation, emerald actions, contextual heroes, calm surfaces and Alexandria. Its utility/CSS cascade and teacher-specific controls cannot be transferred wholesale. Candidate has useful engineering but a different national-color identity and unsupported modules. Eight bounded waves follow; each requires real browser evidence.

## 2. Repository Baselines

| Input | Verified baseline | Access |
|---|---|---|
| Inspector | `master`, HEAD/origin/master `5f309dfb879e8e4be579578da30b0e07f23dedda`, clean start | `https://github.com/alandalousservice-bot/inspecter-platforme.git`; origin fetched and matched |
| ArenaSPEX | verified default branch `main`, SHA `48fec90380a5d34244cc43852e4748d59259b457` | GitHub repo/branch/recursive-tree API; raw source pinned to SHA; READ-ONLY |
| Candidate | `C:\Users\ous\Desktop\inspector-candidate-cp00-partial (1).zip`, root `candidate/` | read-only ZIP streams, not extracted/changed; no verified Git baseline |

Candidate SHA256: `6FB571E963DC8646330CC7F4C28D4558BF84153B7B99B228C9D6A907BA9AF89A`.

Arena evidence: [pinned source tree](https://github.com/alandalousservice-bot/arenaspex/tree/48fec90380a5d34244cc43852e4748d59259b457), `index.html`, `src/index.css`, `src/App.tsx`; `components/landing/LandingScreen.tsx`, `auth/AuthScreen.tsx`, `layout/Header.tsx`, `layout/Sidebar.tsx`, `dashboard/TeacherDashboard.tsx` and its `teacher/TeacherHeroBanner`, `TeacherKpiGrid`, `QuickAccessPanel`, `DailyScheduleList`, `InspectorFeedPanel` imports; `hooks/useAccessibleDialog.ts`; design-system/theme-cascade/typography test source; `docs/ARENASPEX_PLATFORM_AUDIT.md`. Followed relevant actual imports/cascade, not just the prompt's filename list; unrelated domain/server modules not imported into Inspector.

Inspector evidence: current `packages/web/src/AppRoutes.tsx`, LoginPage/login.css, ui/tokens/shell/primitives/app-shell, AppShell/PageSystem/DataTable/Dialog/States, dashboard and operational pages/CSS, public intake, Teacher Information Card print contract and Visit Report editor; docs DESIGN_SYSTEM/UI_MAP/DECISIONS/CODEX_RULES. Candidate: corresponding tokens/shell/primitives/AppShell/Dialog/login/dashboard/routes, `docs/integration/G7_THEME_SPEC.md`, `CP00_THEME_DELTA.md`. Paths belong to their respective source root, not one shared runtime.

Limitations: this is source/cascade architecture evidence, not an authenticated Arena browser inspection. No three-way rendered screenshots or foreign build/test run in this pass. Candidate explicitly describes static contrast and unverified browser geometry. Arena's prior platform audit covers older `bf299186...`, not proof of current defects or current PASS. Future exact visual parity must use real rendering and source-matched reference captures.

## 3. Current Inspector Visual State

Primary `#2e6170`, hover `#254f5b`, background `#f3f5f6`, white surfaces; card/control/dialog radius10/6/16px; normal controls44px; system font. Light232px Sidebar/76px collapsed rail,64px header,64rem drawer breakpoint with focus/Escape/inert/return. PageContainer owns gutters/max-width. Semantic form/table/dialog/state primitives already work. Dashboard uses operational counts/freshness. `/` redirects to `/login`: standalone Landing **NOT IMPLEMENTED**. Login is centered light28rem card; public intake separate56rem surface. Print card bypasses AppShell.

Keep field labels, server filters/cursors, revisions, safe errors, focus and print. Several docs/source comments retain earlier OPEN ADR-016 or pre-Dashboard history; this accepted ADR explicitly supersedes their visual status without editing application code or rewriting historical business decisions.

## 4. ArenaSPEX Visual System Audit

`src/index.css`: primary `#047857`, hover `#065f46`, soft `#ecfdf5`, secondary teal `#0f766e`, canvas `#f4f7f6`, white/light surfaces, border `#dce8e3`, text `#1f2937`, green/amber/rose/blue statuses. Sidebar force-mapped to `#064e3b`, workspace hero `#065f46`, auth `#052e2b`. Radius8/12/16px, subtle shadows, header white94%/minimum4.25rem. Screen typography and mixed numerals normalized. Explicit brand action/tab classes coexist with neutral/status broad `!important` overrides.

JSX gradient classes are not final computed styling: public gradient backgrounds become flat emerald; auth canvas becomes dark teal-green; dashboard hero becomes dark green. Landing slate950 canvas remains dark, with decorative glows and some text-gradient treatment. Rebuild with scoped semantic rules; do not copy substring utility selectors, override chains or assume an older screenshot matches current source.

## 5. ArenaSPEX Index/Landing Audit

LandingScreen provides dark public canvas, sticky80px header, identity/icon block and login action; centered hero max-w-7xl1280px, responsive30/48/60px title, constrained descriptive text, stacked-to-inline CTAs, info band, role cards, final CTA/footer. Rounded cards/compact icon panels give recognizability. Blurred green/blue/purple circles and ping/scale/rotate motion clutter an administrative adaptation. Later CSS removes gradient backgrounds, not all decoration. Teacher/director roles, statistics, national/compliance claims and locked-account copy are not Inspector content. Reuse hierarchy/spacing/CTA rhythm only.

## 6. ArenaSPEX Login Audit

AuthScreen resolves to dark `#052e2b` viewport, corner glows, max-w-md28rem slate800/90 card, JSX24px rounding,24→32px padding, centered64px shield/24px title, professional copy, role picker and login/register/forgot tabs. Fields have inset icons, native password, label copy; success/error blocks and full-width CTA. Public CSS flattens CTA to emerald. Some source labels/focus handling are weaker than Inspector's explicit associations. Keep Inspector labels/autocomplete/error/loading; exclude role picker/rank/register/forgot/Google/reset/Ministry footer. The inspected login field has no requirement to transplant a password-toggle control.

## 7. ArenaSPEX Internal Teacher Theme Audit

Header is sticky/light with emerald brand, role capsule, search, AI/live-lesson/notification/avatar/logout groups. Adopt spacing and identity treatment, not absent actions. Sidebar is256px/64px at desktop≥768px, deep green, active emerald/white, group labels/footer panel; mobile drawer plus fixed teacher quick-nav. Inspector's1024px drawer and accessible NavLinks/focus are retained; no teacher bottom bar.

TeacherDashboard actually composes HeroBanner/KpiGrid/DailySchedule/InspectorFeed/QuickAccess. Hero contextualizes current work; KPI grid1/2/4; schedule+aside3-column layout; actions use icon tiles and directional affordances. Source has loading/no-work/error text. No universal accessible state layer is proven by Arena. `useAccessibleDialog` exists but custom overlay consumers also exist: retain Inspector native Dialog. Teacher percentages, quality judgments, pedagogical scores, AI/chat/notifications are rejected as domain transfers.

## 8. Candidate Visual System Audit

CP00 primary `#006633`, white/red/gold national accents, canvas `#f4f6f8`, dark variant, system font,4px spacing,44/40px controls,256px rail/68px header, explicit focus/on-colors/elevation. Shell has minmax/logical properties/collapse/drawer but national banner/theme toggle/emblems. Native Dialog/fields/local table scroll/reduced motion overlap Inspector. Dashboard CSS largely matches Inspector structure; login remains light28rem card with official-style border; root redirects login, no Landing.

CP00_THEME_DELTA reports60 declared contrast pairs passing after corrections; not rendered WCAG proof. Archive contains Teacher App/chat/map/offline/alternate auth/domain; all excluded. Engineering reference does not override Arena identity or Inspector behavior.

## 9. Three-Way Comparison

| Area | Inspector | ArenaSPEX | Candidate | Final choice |
|---|---|---|---|---|
| Identity | provisional muted teal | emerald/deep green/Arabic | national green/red/gold | Arena roles in existing semantic tokens |
| Entry | redirect; no Landing | hero/features/repeated CTA | redirect | rebuild Inspector public page |
| Login | safe light card | dark green branded card | light card/official styling | Arena composition + Inspector form |
| Shell | semantic routing/focus/light rail | deep rail/context | token grid/national banner | Inspector logic + Arena skin |
| Dashboard | attention-first model | contextual teacher hero/KPI | mostly Inspector grid | adapt presentation/data untouched |
| Components | native/accessible | utility-heavy/mixed ownership | explicit token APIs | keep Inspector APIs and contrast engineering |
| Print | tested independent card | multiple specialized renderers | card prototype | Inspector contract only |

## 10. Final Visual Identity

**ArenaSPEX-family Professional Inspector Theme**. Light operational workspace/deep-green navigation/emerald actions/white cards/subtle borders; dark restrained entry/Login. No theme-switch product, unofficial emblems, national ribbons or endorsement claims. PE identity via restrained educational SVG/copy, not animated sports decoration. One h1 per page, readable Arabic, functional depth. Current palette remains unchanged in code until separately authorized G8 implementation.

## 11. Final Color System

Target values, not applied. Existing token names/aliases remain the single source. New surface roles exist only when needed; no raw feature palette.

| Role / token | Target | Origin/use |
|---|---|---|
| primary / `--color-primary` | `#047857` | Arena action |
| primary-hover | `#065f46` | Arena hover |
| primary-active (new) | `#064e3b` | Arena deep green |
| primary-soft / existing primary-subtle | `#ecfdf5` | Arena soft |
| on-primary | `#ffffff` | white on emerald |
| navigation-background (new) | `#064e3b` | Arena Sidebar |
| navigation-active / hover (new) | `#047857` / `#065f46` | distinguish current/hover plus label/indicator |
| navigation-text / muted (new) | `#ecfdf5` / `#a7f3d0` | opaque light foregrounds |
| public-background / public-surface (new) | `#052e2b` / `#064e3b` | scoped entry/login; no global dark mode |
| public-text / muted (new) | white / `#d1fae5` | dark surface hierarchy |
| background | `#f4f7f6` | Arena canvas |
| surface / elevated / subtle | white / `#f8fbfa` / `#f8fbfa` | Arena/light surfaces; dialog white |
| border / border-strong | `#dce8e3` / `#6b8479` | Arena separator; derived accessible control boundary |
| text-primary | `#1f2937` | Arena text |
| text-secondary / muted | `#475569` / `#475569` | actual Arena workspace normalization; darkened canvas text |
| success / soft / on | `#15803d` / `#f0fdf4` / white | not an alias for brand |
| warning / soft / on | `#b45309` / `#fffbeb` / white | semantic amber |
| danger / soft / on | `#be123c` / `#fff1f2` / white | semantic rose |
| info / soft / on | `#0369a1` / `#f0f9ff` / white | semantic blue |
| focus-ring | `#047857` | opaque3px+2px offset on light |
| focus-on-dark (new) | `#6ee7b7` | opaque light ring on dark |

Static sRGB checks in this gate: primary/white5.48; strong-border/white4.04 and elevated3.88; nav-muted/rail7.58; warning/soft4.84,danger/soft5.72,info/soft5.57. Arena `#64748b` over canvas is4.41:1, so not adopted for normal canvas text. Alpha focus ring not copied. This is sampled evidence, not exhaustive certification. G8-01 must test all used foreground/background/hover/disabled/mixed pairs and rendered AA4.5 text/3 large-text and UI boundaries. Border-default is decorative, not sole input boundary. Do not compound disabled opacity into unreadable labels.

## 12. Final Typography

SCREEN: `Alexandria, Tajawal, "Noto Sans Arabic", system-ui, sans-serif`. Arena index fetches Alexandria400/500/600/700 and Cairo externally; screen CSS overrides Cairo with Alexandria. Inspector self-hosts verified Alexandria with `font-display: swap`, fallback, OFL, no mandatory network font service. [Upstream OFL](https://github.com/google/fonts/blob/main/ofl/alexandria/OFL.txt) was read: Copyright2022 Alexandria Project Authors, SIL OFL1.1. G8-01 must pin actual asset source/hash/license and verify shaping/loading cost; no font is added here.

| Role | Size / weight / line-height |
|---|---|
| display (Landing) | responsive2–3.5rem /700/1.25 |
| page title |1.75rem/700/1.35 |
| section title |1.5rem/600/1.4 |
| card title |1.0625rem/600/1.45 |
| body |1rem/400/1.65 |
| body-small |.875rem/400/1.65 |
| control |.875rem/600/1.5 |
| table |.875rem/400/1.5; header600 |
| metadata |.8125rem/400/1.5 |
| badge |.75rem/600/1.5 |

Arena body15px/table13px adjusted upward for dense Inspector readability. Arabic labels align logical start, not universal center; isolate numbers/bidi. PRINT keeps existing Arabic-capable system stack/card10–11pt contract. No inherited screen-font swap into print.

## 13. Final Spacing

Keep4/8/12/16/24/32/48px scale. Gutter desktop32/tablet24/mobile16; page/section gap24; cards24desktop/16mobile; form gap16/section24; table cell block12/inline16. Public hero vertical48desktop/32mobile. PageContainer owns gutters; no parallel max-width/padding per page.

## 14. Final Geometry

radius-sm8px controls/md12px cards/filter/lg16px hero/Dialog; pill limited to brief statuses. Existing radius-control/card/dialog aliases map to those roles. Normal input/button/control min44px, compact40px only safe contexts/touch target preserved. Textarea grows. Workspace max90rem/public80rem/login28rem. Sidebar16rem/collapsed4.75rem (existing accessible rail)/header4.25rem. Logical properties, minmax(0,1fr),100dvh; no forced body minimum causing clipping.

## 15. Final Elevation and Motion

shadow-sm `0 1px 2px rgb(15 23 42 / 5%)`; shadow-md `0 10px 24px rgb(15 118 110 / 8%)`; modal `0 20px 48px rgb(6 78 59 / 18%)`. Existing elevation aliases map once; card styles own shadow, not shell overrides. Fast160ms/normal210ms, purposeful color/opacity changes. No transition:all/ping/pulse/route entrances/hover scale loops. Reduced-motion removes transforms/spinners as needed while progress text remains. No shadows or motion in PRINT.

## 16. Index/Landing Decision

REBUILD LOCALLY in G8-02: `/` becomes a public presentation page, not new anonymous data access. Header name/login; hero «منصة مفتش التربية البدنية والرياضية»; CTA «دخول فضاء المفتش»→`/login`. Concise five existing capability descriptions: إدارة الأساتذة، إدارة المؤسسات، الزيارات، المتابعة، التقارير البيداغوجية. Restrained dark-green composition, light text, existing local SVG, one accent background. Stacked mobile actions, factual footer; no role selection/registration/stats/Ministry claims. Login success remains `/app`; public district route and wildcard behavior preserved. No sensitive fetches for landing.

## 17. Login Decision

ADAPT Arena visual concept around existing LoginPage. Dark public canvas/green card28rem max/24→32px padding/local educational icon/concise inspector copy; native labelled fields/full-width emerald submit/readable safe error and busy state. Preserve existing client/auth/validation/autocomplete/redirect; presentation-only back-to-Landing link permitted G8-02. No new rank/role/reset/OAuth/MFA/remember-me/identity fetch. No password-control feature invented by visual audit.

## 18. AppShell Decision

ADAPT existing shell:256px deep-green rail/68px white TopBar/neutral workspace/existing PageContainer. Keep main ownership/NavLink routing/auth,1024px drawer threshold (not Arena768),inert/Escape/focus/scroll handling. Public and print separate. Dense content retains local table scroll. No Candidate national banner or theme state.

## 19. Sidebar Decision

Deep-green rail, current SVG icons, emerald active fill plus readable text/aria-current/logical indicator. Actual nav only: `/app`,institutions,teachers,submissions,visits,follow-ups; professional identity separate account link. Dashboard exact-match, nested areas remain active. Collapse local/ephemeral; accessible label + focus/hover tooltip must escape clipping. Drawer full-label same visual theme. No reports/resources/settings menu without implemented route; report remains Visit-context navigation; no teacher bottom bar.

## 20. TopBar Decision

Light header/compact emerald brand/context + current email/logout; LTR email isolation with mobile bounded layout and accessible value. No displayed IDs/extra identity fetch. No Arena global search/bell/AI/live-session/role picker/Candidate theme button. Useful breadcrumbs remain PageHeader, not duplicate navigation.

## 21. Dashboard Decision

Compact contextual hero/white attention cards preserve ADR-037 «ما الذي يحتاج انتباهي الآن؟». Keep existing counts/items/freshness/refresh/upcoming/quick links; DOM attention→visits→actions. No change to top3/count/filter/API/order. No new account/year fetch for decoration, charts/quality/ranking/marks/progress percentages. Empty counts truthful, failed requests remain errors.

## 22. Operational Screen Decisions

Emerald PageHeader accent/white groups/fact hierarchy/current contextual actions; Teacher/Institution declarations and approval remain distinct. No foreign workspace tabs or fields. Schedule grid/Visit snapshots/report revision/FINAL/FollowUp semantics unchanged. Report editor is not exact paper-template reproduction. Use compact headers, not a large hero on every page. Full route matrix below governs scope.

## 23. Forms / Tables / Dialog Decisions

KEEP native fields/label/help/error/HTML types/server validation/dirty guards/explicit confirmation. ADAPT primitive geometry/colors, not business values. Keep server search/cursor pages, caption/col scope/local keyboard scroll. Rows min44px; long content wraps. Native Dialog showModal/Escape/cancel/disabled-busy/focus return unchanged; white16px modal/clear title/wrapped footer. No Arena overlay substitution or duplicate Candidate CSS. G8-01 applies core mapping; G8-06 consolidates consumer exceptions rather than creating a second system.

## 24. Status / Empty / Loading / Error States

KEEP presentation-only StatusBadge/domain maps, text plus shape/icon; brand does not override success/warning/danger meaning. Preserve no-data/no-results/safe retry/persistent near-content success/busy/status/button progress. No toast/skeleton/notification engine. No shimmer/continuous decorative animation. Pending location differs from accepted canonical state; FINAL is not a digital signature.

## 25. Mobile / Responsive Strategy

≥64rem desktop rail; below drawer/reduced gutters. At768px forms two columns only where readable;390px single column/wrapped actions/facts/header. Attention priority remains. Named/focusable table region may scroll locally with all actions; no document overflow. Width:min()/min-width:0/logical properties/longArabic-Latin wrap. Actual200% zoom must preserve controls/values/messages; no CSS scale substitute.

## 26. RTL / Accessibility Strategy

Arabic lang/rtl root/logical properties/DOM order. Bdi/LTR for email/phone/coords/dates/numeric strings in permitted contexts, no unnecessary UUIDs. Landmarks/skip link/headings44px targets/visible light+dark focus/semantic names/no hover-only actions. Keep modal focus return and drawer inert. AA4.5:1 normal text,3:1 large text/control/focus measured with actual compositing; reduced-motion/forced-colors checks. No removal of validation/status messages for appearance.

## 27. Print Isolation

TASK-086 retains separate print route/root,A4portrait210×297mm,12mm margins/186×273mm content,grayscale/natural minimal1-normal2-stress3 pages,photo35×45mm/signature50×18mm,no private note/shell. Route bypass alone does not prevent inherited font changes: screen changes must be scoped; print font/line-height/geometry remain explicit and verified by PDFs. Screen print controls restyle only; no auto window.print.

Current Inspector Visit Report editor/read-only view has no dedicated exact two-page print route or print handler in inspected page/CSS. Two-page source-template reproduction **NOT IMPLEMENTED/NOT PROVEN**. Preserve independent future printing task; no new PDF/print in G8. Arena notebook/landscape formats do not transfer.

## 28. ArenaSPEX Reuse Matrix

| Element | Class | Recommendation/risk |
|---|---|---|
| Landing composition/CTA | REUSE VISUAL CONCEPT | rebuild local Inspector content; omit figures/official claims |
| Login card/backdrop | REUSE VISUAL CONCEPT | keep Inspector form/auth; dark contrast gate |
| Emerald/Alexandria | REUSE VISUAL CONCEPT | exact role mapping + corrections/local licensed font |
| Sidebar/active/header | REBUILD LOCALLY | style current shell; keep Inspector navigation/focus |
| Hero/KPI/quick-action hierarchy | REUSE VISUAL CONCEPT | existing Inspector model only |
| Explicit action-class idea | ADAPT CODE (conditional future) | minimal local adaptation after license/provenance check, not wholesale code |
| Form/table/status/empty | REBUILD LOCALLY | Inspector primitives/semantics stronger |
| AccessibleDialog hook | DO NOT REUSE code | native Inspector Dialog already satisfies behavior |
| Broad remapping/important/physical offsets | DO NOT REUSE | cascade/contrast/print risk |
| Teacher/auth/store/services/DB/AI/chat/offline | DO NOT REUSE | incompatible scope/authority |
| Print renderers/official badges | DO NOT REUSE | Inspector print/truthful copy wins |

No LICENSE path appeared in inspected Arena tree. No code/assets copied. Public GitHub visibility does not establish reuse rights; direct code transfer needs license/permission/provenance gate. Local implementation of visual concepts avoids making that a blocker for architecture.

## 29. Candidate Reuse Matrix

| Element | Decision | Boundary |
|---|---|---|
| Semantic aliases/on-colors | REUSE CONCEPT | Arena values, not national palette |
|4px/minmax/min-width/44px| KEEP/ADAPT | one current foundation |
| Card single CSS ownership | REUSE CONCEPT | no import-order duplicate |
| Native Dialog/form/table APIs | KEEP Inspector | already present; no copying duplicates |
| Contrast/focus/reduced-motion testing | REUSE CONCEPT | static60pairs ≠ rendered certification |
|256/68px shell | ADAPT | Arena dark rail/Inspector behavior |
| Login/dashboard CSS | KEEP structure/ADAPT | not superior domain/landing |
| National ribbon/emblem/theme switch | DO NOT REUSE | unverified authority/unrequested behavior |
| TeacherApp/chat/GPS/maps/WebSocket/offline/authDB | DO NOT REUSE | no feature transfer |

## 30. Full Visual Mapping Matrix

I paths are Inspector `packages/web/src`; A paths Arena `src/components` plus index.css; C corresponding Candidate web paths. A visual analogy does not assert that the exact Inspector business feature exists in Arena. L/M/H reflect regression exposure.

| Area | CURRENT INSPECTOR STATE | ARENASPEX REFERENCE | CANDIDATE REFERENCE | FINAL DECISION/class | EXPECTED CHANGE | RISK | WAVE |
|---|---|---|---|---|---|---|---|
|1 Index/Landing|NOT IMPLEMENTED;root redirect|LandingScreen|NOT IMPLEMENTED;root redirect|REBUILD|local public hero/features/CTA|M routing/copy|02|
|2 Login|LoginPage/light28rem|AuthScreen/darkgreen|LoginPage/light|ADAPT|green presentation/form retained|H auth/contrast|02|
|3 AppShell|semantic light grid|App/Header/Sidebar|token grid|ADAPT|deep rail/light header256/68|H focus/print|03|
|4 Sidebar|NavLinks/collapse|Sidebar|collapse/tooltips|ADAPT|green active/labels|M nested route|03|
|5 TopBar|context/email/logout|Header|TopBar|ADAPT|light brand grouping|M small viewport|03|
|6 Mobile nav|drawer/inert/focus|drawer+teacher bottom bar|drawer|KEEP behavior/ADAPT|green drawer,no bottom nav|H focus|03|
|7 Dashboard|DashboardPage/ADR037|Hero/KPI/Schedule/QuickAccess|same grid|ADAPT|attention-first geometry|H meaning/order|04|
|8 Teacher directory|TeacherDirectoryPage/filter/table|workspace/header/table CSS|directory CSS|ADAPT|header/filter/rows|M q/cursor|05|
|9 Teacher profile|TeacherProfilePage/facts/edit/link|workspace forms/cards|profile CSS|ADAPT|existing section hierarchy|H approval/private facts|05|
|10 Information card|TeacherInformationCardPage/read|workspace fact/card idea|card CSS|ADAPT screen|clear facts/title|H print inheritance|05|
|11 Institutions|InstitutionsPage/current controls|workspace table/actions|institutions CSS|ADAPT|create/filter/location controls|H canonical privacy|05|
|12 Public submission|PublicTeacherIntake/import/receipt|public/auth family|intake CSS|ADAPT|light form/scoped green frame|H validation/PII|05|
|13 Submission review|SubmissionDetail/DecisionControls|workspace details/confirm|submissions CSS|ADAPT|declaration/verified hierarchy|H atomic decision|05|
|14 Location review|InstitutionLocationProposalReview|comparison/card visual idea|no approved canonical counterpart|KEEP behavior/ADAPT|pending/current separation|H077/races|05|
|15 Weekly Schedule|WeeklySchedulePage editor|weekly workspace navy/cyan|schedule CSS|ADAPT|keep grid/emerald/no navy subtheme|H slot/workplace|05|
|16 Visits list|VisitListPage|workspace table|visits CSS|ADAPT|filter/status/rows|M cursor/status|05|
|17 Visit create|VisitCreatePage/pickers|workspace form|visit forms|ADAPT|sections/warnings|H consent/context|05|
|18 Visit detail|VisitDetailPage|context/header/cards|visit detail|ADAPT|fact/action hierarchy|H lifecycle/revision|05|
|19 Inspector report|V1+legacy editor/read-only|workspace/report idea|report CSS|ADAPT screen|criteria/FINAL/dirty presentation|H concurrency/immutability|05|
|20 Follow-up|FollowUpsPage|schedule/status grouping|followups CSS|ADAPT|dates/alerts/readability|H report ownership|05|
|21 Search/filter|FilterBar/q/current filters|workspace search/header|semantic filter|KEEP API/ADAPT|layout/focus|M server behavior|06|
|22 Forms|Input/Select/Textarea/FormSection|workspace controls|native primitives|KEEP API/ADAPT|geometry/spacing/contrast|H validation/access|01/06|
|23 Tables|DataTable/local scroll|table normalization|scroll/contrast|KEEP semantics/ADAPT|headers/rows|M clipping|06|
|24 Dialogs|native Dialog|hook/custom overlays|native Dialog|KEEP behavior/ADAPT|16px/modal depth|H focus/cancel|01/06|
|25 Buttons|variants/loading|action-primary|semantic variants|KEEP API/ADAPT|emerald/heights/on-color|M disabled/focus|01/06|
|26 Badges/status|StatusBadge/domain maps|labels/colors|contrast roles|KEEP meaning/ADAPT|soft status pairs|M meaning|01/06|
|27 Empty|no-data/no-results|schedule/workspace empty|same state layer|KEEP/ADAPT|calm feedback|L|06|
|28 Loading|status/busy/button|schedule text|same states|KEEP/ADAPT|progress text/no shimmer|M announcements|06|
|29 Error|safe ErrorState/retry|error block|semantic errors|KEEP/ADAPT|safe readable feedback|H redaction|06|
|30 Pagination|API cursor/total|workspace controls|Pagination|KEEP behavior/ADAPT|size/focus/wrap|M server pages|06|
|31 Profile/settings|professional identity ONLY;general settings NOT IMPLEMENTED|Header/Settings idea|identity+prototype options|ADAPT existing/DO NOT REUSE missing|current professional form only|M unsupported nav|05|
|32 Print entry|card manual print;Visit exact print NOT IMPLEMENTED|dedicated docs|card isolation|KEEP print/ADAPT screen|screen button only|H1/2/3pages|05/08|
|33 Responsive/mobile|logical grids/drawer/table scroll|md drawer/teacher grids|grid/focus/min-width|KEEP/ADAPT|64rem drawer32/24/16gutters|H zoom/RTL|03/07|

## 31. ADR-016 Final Decision

ACCEPTED by explicit Product Owner direction. DECISIONS records priority/boundaries; DESIGN_SYSTEM records current implementation versus target. No other ADR status changed. Older milestone OPEN wording is historical, superseded for current visual identity. No official asset is adopted, so unverified government authority does not block this chosen nonofficial identity. Font-license evidence exists; asset provenance/delivery is a G8-01 acceptance gate.

## 32. Implementation Waves

All waves NOT_STARTED, separately authorized. Rollback means return to prior accepted presentation through reviewed revert commit when authorized, never reset/discard legitimate work. Expected files refer only to Inspector. Every wave runs diff-check, typecheck/lint/Web+API tests/build/smoke; focused connected/DB gates as relevant; final08 runs full integrations. No business/API/schema/auth/dependency expansion. No automatic next wave.

| Wave | Exact scope/files | Prohibited changes | Required tests/regressions | Required screenshots | Rollback / suggested commit |
|---|---|---|---|---|---|
|G8-01|ui/tokens,shell,primitives;local Alexandria asset/OFL;type/roles/basic controls|routes/features/theme switch/print fonts|token/contrast/shaping,primitives,representative shell/forms;086PDF1/2/3|BEFORE/REFERENCE/AFTER controls/login/print1440/768/390+actual200%|foundation assets/styles;`style: align inspector visual foundation with ArenaSPEX`|
|G8-02|local LandingPage/scopedCSS;LoginPage/login.css;AppRoutes root only|auth client/new account/roles/reset/PII queries/other routes|root/login/back/public deep links,success/fail/loading/autocomplete|Landing/Login1440x900,1280x800,768,390,longcopy/errors/focus/200%|public/root slice;`style: add ArenaSPEX-family inspector entry`|
|G8-03|AppShell presentation/app-shell.css/ShellIcon existing|new routes/session prefs/global search/bell/AI/print wrapper|expanded/collapsed/nested nav,drawer inert/Escape/return/resize,public/print isolation|all widths,rail/drawer/focus/200%|shell slice;`style: align inspector shell with ArenaSPEX`|
|G8-04|DashboardPage/dashboard.css presentation|aggregations/counts/filters/limits/new metrics/queries|all dashboard states/links/freshness/API/connected regression|normal/empty/error/retry/dense,widths+200%|dashboard slice;`style: converge inspector dashboard visual language`|
|G8-05|existing operational pages/CSS:teachers,institutions,submissions,public,schedules,visits,reports,followups,identity|fields/workflows/API/newCRUD/confirmation removal/print document|Teacher/G3/directory,075,077,085,schedule/Visit/report/FollowUp as affected;connected/DB gates|each list/detail/form,error/dense,narrow/200%,public receipt/location distinction|route-family slices;`style: converge inspector operational screens`|
|G8-06|shared component CSS + verified consumer exceptions|new semantic APIs/engines/client filters/pages/status mappings|labels/validation/focus/dialogCancel/busy/no-results/rowActions/cursors|real consumers/long Arabic-mixed/dialog/mobile/states|component slice;`style: unify inspector controls and feedback`|
|G8-07|bounded responsive/logicalCSS/access fixes+tests proven in browser|domain/new navigation/hidden essential controls|true200%,keyboard/reducedmotion/forcedcolors/no clipping/workflows|1440x900/1280x800/768/390 at100+200%,focus/RTL|verified fixes;`fix: close inspector RTL and responsive visual gaps`|
|G8-08|final evidence/docs/tests;style fixes only for verified blockers|new features/contracts/deps/migrations|full project+DB+Dashboard/Teacher/Visit/075/077/086,bundle/print1/2/3|full three-way dossier/grayscalePDF/allstates|final evidence/fixes;`test: close inspector ArenaSPEX visual integration`|

G8-05 should subdivide into bounded route families:directory/profile/card; institutions/location;public/submissions;schedules;visits/reports/followup. Each sub-checkpoint independently reviewable. G8-06 consolidates real-use exceptions, not a parallel system or deferral of accessible primitives beyond01. License/provenance required before any direct reference-code copy; local rebuilding preferred.

## 33. Visual QA Plan

Real browser:1440×900,1280×800,tablet~768,mobile~390 at100%/actual200% (no CSS scaling/deviceScaleFactor shortcut). Capture Inspector BEFORE at wave parent,pinned Arena REFERENCE,Inspector AFTER comparable state/viewport. Use synthetic isolated fixtures; no production identities. If authenticated Arena reference cannot be safely obtained, mark parity NOT_VERIFIABLE and resolve reference evidence for final gate; do not invent a screenshot.

States:normal/hover/focus/disabled/loading/empty/error/retry/dense,longArabic,mixedLatin,large tables,Dialog,expanded/collapsed rail/drawer. Inspect images for hierarchy/Arabic shaping/contrast/gutters/focus/no overflow. Route/state/viewport/zoom/sourceSHA label evidence. Unit/source assertions do not establish visual parity. Font fallback or absent reference asset must be disclosed.

## 34. Regression Plan

Use existing package scripts, verify names before invocation. Final08 includes full DB integrations and connected Dashboard,G3/directory,075,085,Visit/report/FollowUp,077,086. DB tests use approved owned temporary schema helper on127.0.0.1:55432/task020_test/task020_test_user, cleanup/prove zero leftovers. No5432/remote/Production. No persistent UAT reseed/mutation for screenshot satisfaction; disclose existing TASK085 declaration-fixture warning separately.

077 invariants stay closed: Institution canonical owner/proposal distinct; independent explicit decision/source allowlist/stale409+read-only refresh/no mutation retry/atomic coordinate-free audit; no automatic linking/lookup/acceptance. Directions canonical-only/externalHTTPS/noorigin/noGoogle request before action/noembed/GPS/tracking. Preserve public receipt/privacy/current district scope. Verify no backend/schema/migration/API/auth changes. Bundle compare baseline with explained font/CSS delta; no icon/chart framework.086PDF minimal1/normal2/stress3,A4portrait12mm,grayscale/no blank/clipping/shell/private facts. All previous print behaviors remain unchanged.

## 35. Risks

| Risk | Mitigation |
|---|---|
|Foreign cascade changes intended colors|semantic scoped classes,no important transplant|
|Dark fields/error/muted text fail AA|opaque pairs/static+rendered all-state contrast|
|Font affects width/print/bundle|local verifiedOFL/swap/fallback/explicit print-font/086PDF|
|Wider rail/tooltips/zoom clip work|current drawer/local scroll/focus and long labels|
|Hero invents statistics or judgments|ADR037 data-only presentation|
|Proposal looks canonical|distinct statuses/headers/actions,077regressions|
|Root change breaks deep links|root-only routing tests/no auth rewrite|
|Unofficial branding leaks|truthful platform copy/no emblems/certification|
|Source audit mistaken for parity|explicit limitation and final real-browser comparison|
|Known UAT fixture issue|disclose,no repair/reseed within visual waves|

## 36. Explicit Rejections

No Arena Teacher/account/domain/store/planning/authDB/security assumptions/AI/provider/community/chat/offline/cache. No Candidate TeacherApp/GPS/maps/WebSocket/offline/Electron/Capacitor/alternateauthDB/national branding. No telemetry/notifications/mapsSDK/keys/geolocation/tracking/route calculations. No teacher/inspector ranking/marks-as-metrics/invented stats/charts. No new curriculum/reference tasks060/071/Midan. No automatic Institution merge/link/approval or location decision. No government claim without verified authority; none adopted here. No print redesign/source extraction/reference write/commit/push. No G8 broad implementation in this pass.

## 37. Final Recommendation

Architecture PASS: three inputs identified/inspected, ADR-016 ACCEPTED, 33 areas mapped, exact semantic target and bounded waves documented. The Product Owner reviewed and approved this result for the documentation-only G8-VISUAL-A0-CLOSE checkpoint. Safe to begin **G8-01 only when separately instructed**; it remains NOT_STARTED. No already-achieved visual parity is claimed. The original audit left application HEAD unchanged and its three documentation files uncommitted; the approved closure records them in one documentation-only commit without altering the TASK-077F checkpoint. TASK-077 is closed; ADR-013 OPEN / TASK-060 BLOCKED remain preserved. STOP.
