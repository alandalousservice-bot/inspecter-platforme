# RTL, accessibility and critique gates

Authority: `docs/DESIGN_SYSTEM.md`, `docs/TEST_STRATEGY.md`, the task's Acceptance Gates. Screenshots/current browser evidence supplement source; never claim browser verification from source alone.

- QA 1440, 1280, 768, 390 and real-browser 200% zoom for changed major workspaces. No page-level horizontal overflow; primary actions reachable, filters compact on small screens, long Arabic wraps, native controls remain usable. A required table overflow region is not permission for page overflow. Fix causes, not global overflow clipping.
- RTL logical layout; isolate Latin email, phone, date, numeric mark, code, URL and mixed institution names with existing bdi/dir patterns. No global direction hack or semantic reformatting.
- One h1, logical headings, one main, semantic tables/captions, native links/buttons, labels and associated validation errors. Visible immediate focus, keyboard order, modal focus containment/Escape/return, non-color-only states, reduced motion. No hidden duplicate interactive tree.
- Preserve public/login/print separation. Screen changes do not modify protected A4 templates or print typography/pagination.
- Review hierarchy, identity prominence, scan speed, density, whitespace, nesting, repeated headings/descriptions, action priority, typography, status clarity, search placement, RTL/Bidi, accessibility and responsive behavior.
- Reject decorative pills, gratuitous animation, fake metrics, generic marketing structures and unnecessary visual sameness; retain meaningful operational badges and consistent shared components. External criticism is not evidence of a defect by itself.

Report verified findings with path/line, impact, severity, evidence and bounded recommendation. Separate source-backed observations from browser checks still required. Design critique may PASS as a governance dry-run without approving a future UI implementation or claiming WCAG conformance.
