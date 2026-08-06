---
review: version-verification
target: ARCHITECTURE-SPINE.md (Stack table)
target_path: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/ARCHITECTURE-SPINE.md
memlog_path: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/.memlog.md
reviewed_as_of: 2026-08-05
---

# Version Verification Review — Docket Architecture Spine

## Method

Independently re-ran live web searches (not training-data recall) against current sources (npm, official release/changelog pages, endoflife.date, vendor blogs) for each Stack table row, and cross-checked the memlog's citations for actual currency rather than trusting the "per web verification" tag at face value. Also checked whether the "greenfield, no starter template" framing was backed by any alternative-technology comparison.

## Verdict: CONDITIONAL PASS — one row is wrong, one row's citation is stale, rest verified accurate

5 of 6 version claims are confirmed accurate for Aug 2026. One (**TypeScript**) is factually wrong — the ecosystem has moved two majors past what's claimed, and the spine's own labeling shows this row was never actually web-verified, unlike its neighbors. One (**Prisma**) cites a real but six-month-stale patch number, which is a red flag about whether the "same-day" verification implied by the memlog timestamp actually happened live.

## Row-by-row findings

| Row | Spine claim | Independently verified (Aug 2026) | Status |
| --- | --- | --- | --- |
| Node.js | 24, active LTS as of Aug 2026 | Confirmed: Node 24 is Active LTS; Node 26 (released May 2026) stays Current until it becomes LTS in Oct 2026; Node 22 is Maintenance LTS. Matches memlog's own reasoning exactly. | Accurate, well-verified |
| Next.js | 16.2.x, "current stable, June 2026" | Confirmed: 16.2.x is still the current stable line; latest LTS patch is 16.2.12 (July 2026), with a further Turbopack/routing release in early Aug 2026. 16.3 exists only as canary. Minor version claimed is still correct; the "June 2026" freshness marker is ~1-2 patch releases stale but not materially wrong. | Accurate, minor staleness in the parenthetical date only |
| PostgreSQL | 18.x, "current stable, mid-2026" | Confirmed: latest patches are 18.4/17.10/16.14/15.18/14.23 (May 2026); PostgreSQL 19 is only at Beta 2 (July 2026), GA expected ~Sept/Oct 2026. 18.x is correctly the current major. | Accurate |
| Prisma ORM | "7.x, latest patch 7.4.2, Feb 2026" | 7.x is still correct as the current major. But the cited patch (7.4.2, Feb 27 2026) is stale by ~6 months and 5 releases — actual latest on npm as of Aug 2026 is **7.9.1**. Given the memlog's `updated:` timestamp is the same day as the spine (2026-08-05), a live search that day should have surfaced 7.9.x, not a Feb number. This suggests the "per web verification" tag reflects a search that either wasn't actually re-run at authoring time or returned cached/stale results. | **Major version fine; specific patch citation is stale and its "verified" tag is questionable** |
| Tailwind CSS | 4.3.x, "current stable, July 2026" | Confirmed accurate: latest is 4.3.3 (published ~mid-July 2026, ~15 days before this review). Matches claim closely. | Accurate |
| TypeScript | "latest 5.x (paired with Next.js default)" `[ASSUMPTION]` | **Wrong.** TypeScript 6.0 shipped March 23, 2026 (final JS-based release; flips strict mode/ESM/es2025 defaults on). TypeScript 7.0 — the Go-native rewrite with ~8-12x faster builds — reached RC on June 18, 2026 and shipped stable in early August 2026 (per InfoQ, "Microsoft Releases TypeScript 7.0," Aug 2026). Next.js's own July 2026 patch (16.2.12) shipped fixes specifically "to support TypeScript 7," confirming the framework ecosystem has already moved past 5.x. Next.js 16's peer-dependency *floor* is TypeScript ≥5.1.0, but "5.1.0 minimum supported" is not the same claim as "5.x is current" — the spine conflates the two. | **Factually incorrect for Aug 2026; two majors behind current** |

## Root cause on the TypeScript finding

Look at how the memlog tags each Stack row:
- Node.js, Next.js, PostgreSQL, Prisma, Tailwind each carry an explicit "`per web verification`" / "`per nodejs.org/endoflife.date web verification`" citation.
- The TypeScript line (memlog line 18) has **no such citation** — it's just `(paired with Next.js/Node default) [ASSUMPTION]`.

The spine's closing claim — "All verified current at authoring via web search, not asserted from training data" — is therefore not true for every row in the table it's attached to. TypeScript was asserted, not checked, and the assertion happens to be wrong by two major versions. This is exactly the failure mode the review was asked to catch: a row that looks web-verified by proximity to five rows that genuinely were, but wasn't itself.

## Alternatives-not-checked gap

This is greenfield with no starter template and no stated team preference, so the task also asks whether a better-verified alternative should have been checked before settling. The memlog shows single-candidate reasoning for every row (why Prisma, why Vercel, why Postgres) but no evidence any alternative was actually looked up and compared — e.g.:
- **Prisma vs. Drizzle ORM**: Drizzle is a commonly-cited current alternative for exactly the "type-safe, migration-friendly, Postgres" niche this project needs; the spine picks Prisma on its merits (Client extensions for firmId scoping) but never records that Drizzle was considered and ruled out.
- **Vercel vs. other Next.js-compatible hosts**: reasonable default, but similarly asserted rather than compared.

Not a version-accuracy defect, but worth flagging: the spine's stack picks read as "first well-known option that fits" rather than "compared against a verified alternative," which is a softer form of the same training-data-reliance risk the version claims were checked for.

## Summary of required fixes

1. **Fix TypeScript row** — change "latest 5.x" to reflect actual current (TypeScript 6.0 stable since March 2026, TypeScript 7.0 stable as of early Aug 2026). Decide and record which one Docket targets (7.0 is newer/faster but very recently stable — 6.0 may be the safer choice for a first production app; either is defensible, but pick one and cite a real source instead of an unverified assumption).
2. **Refresh Prisma's cited patch** — either drop the specific patch number (just say "7.x, latest minor") or update it to the actual current patch (7.9.1 as of this review) so the citation doesn't imply a verification that didn't reflect live state.
3. **Optional/minor**: update Next.js's parenthetical date from "June 2026" to reflect the July 2026 patch (16.2.12) actually current now — cosmetic only, doesn't change the claimed version.
4. **Optional**: if the team wants stronger footing on the "greenfield, no constraints" stack picks, record what alternative(s) were considered for Prisma (e.g., Drizzle) and Vercel, even briefly, so those `[ASSUMPTION]` rows aren't single-candidate.
