# Visual language

Authority: `docs/DESIGN_SYSTEM.md`, ADR-016 and `docs/G8-VISUAL-A0-REPORT.md`; implemented semantic roles in `packages/web/src/ui/tokens.css` remain the value source. This guide does not replace them.

Digital office for a Physical Education and Sports pedagogical inspector in Algerian primary education; Arabic-first, RTL-first, professional, calm and operational. One inspector may supervise 180+ teachers. Dense scanning and comfortable document reading are different jobs. No marketing/SaaS template, student portal, consumer feed, AI dashboard or oversized teacher-card grid.

Accepted family: **ArenaSPEX-family Professional Inspector Theme**. ArenaSPEX is visual reference, not domain/runtime authority; Candidate is secondary design-system engineering reference.

| Family reference | Value |
|---|---|
| Primary / hover / soft | #047857 / #065f46 / #ecfdf5 |
| Secondary / accent | #0f766e / #b7791f |
| Background / surface / elevated family | #f4f7f6 / #ffffff / #f8fbfa |
| Border / text / muted family | #dce8e3 / #1f2937 / #64748b |
| Success / warning / danger / info | #15803d / #b45309 / #be123c / #0369a1 |

These are family references, NOT replacement CSS or new tokens. Existing roles may use contrast-adjusted values: current text-muted is #475569 and elevated surface #ffffff; subtle surface is #f8fbfa. Preserve those accepted implemented values. Secondary/accent references do not authorize adding tokens. Sidebar stays the current deep-green family. No feature-specific colors, wholesale palette replacement, ornamental gradients or new branding by taste. Preserve the accepted Dashboard Hero; a critic's generic gradient ban does not authorize removing it.

Arabic screen stack: Alexandria, Tajawal, Noto Sans Arabic, system fallbacks, as existing tokens specify. No external font dependency for aesthetics. Prioritize readable Arabic, meaningful hierarchy, document line-height and legible metadata; never shrink text to simulate density. Use the existing 4/8/12/16/24/32/48 spacing scale, radius/elevation/focus/motion roles; no second scale or undefined `--space-5`.
