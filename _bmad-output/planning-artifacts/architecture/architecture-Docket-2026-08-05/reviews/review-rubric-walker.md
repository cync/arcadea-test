---
title: Architecture Spine Review — Rubric Walk
target: ARCHITECTURE-SPINE.md (architecture-Docket-2026-08-05)
reviewer: rubric-walker
date: 2026-08-05
verdict: pass-with-findings
---

# Architecture Spine Review — Docket

Reviewed `ARCHITECTURE-SPINE.md` against the good-spine checklist, cross-referenced against `epics.md` (6 epics / 15 stories), `prd.md`, `DESIGN.md`, `EXPERIENCE.md`, `.memlog.md`, and `implementation-readiness-report-2026-08-05.md`.

## Overall Verdict: PASS-WITH-FINDINGS

The spine's core structural invariants (AD-1 through AD-7) are sound, each names a real divergence risk it's tied to a genuine consequence of the PRD/epics, and the hexagonal paradigm choice is well-justified against the one thing the PRD explicitly left open (Drive integration mechanism). The Stack table is mostly researched, not asserted, and the memlog shows the work. But the spine is not complete at the "feature altitude owns this" level: it decides several structural risks with real teeth (status mutation, firm scoping, aging) while leaving other dimensions of comparable risk (authentication mechanism, field-level redaction for the client role, operational/observability envelope, new-document detection cadence) entirely unaddressed — not decided, not deferred, not flagged as an open question. That silence is exactly the shape of gap the checklist asks to catch.

---

## 1. Does it fix the real divergence points for the 6 epics?

Mapped each epic to its binding AD(s):

| Epic | FRs | AD coverage |
|---|---|---|
| 1. Document Intake | FR-1,2,3,15,16 | AD-1 (firm scoping), AD-2 (Drive port), AD-6 (Story 1.5 reassignment audit) |
| 2. Workflow Board | FR-4,5 | AD-3 (status transitions), AD-4 (Blocked derivation) |
| 3. Deadlines & Staleness | FR-6,7,8 | AD-7 (single Aging computation) |
| 4. Delegated Approval | FR-9,10 | AD-3, AD-6 (audit events) |
| 5. Client Visibility | FR-11,12,13 | AD-5 (shared auth layer) |
| 6. Paper Tracking | FR-14 | **none** — only AD-1's blanket "all epics" |

Epic 6 has no epic-specific AD. FR-14 requires "link the resulting scan file," and NFR-5 requires Docket never store/duplicate file content — which means the scan file's storage location is exactly the kind of decision AD-2 made for Drive-linked documents (isolate behind a port) but never makes for scans. Is a scanned file uploaded to Drive via the same `DriveConnector`, or does it need a second storage adapter? The Structural Seed's adapter list (`drive/`, `email/`, `auth/`, `db/`) has no home for it. This is a real, unaddressed divergence point: two implementers of Story 6.1 could reasonably build incompatible storage paths (one piping through `DriveConnector.upload`-style method, one adding an S3/blob adapter, one storing a bare external URL string) with no port boundary forcing a single answer, exactly the divergence AD-2 exists to prevent for the Drive case.

**Finding (Medium):** Epic 6 / FR-14 scan-file storage mechanism has no AD, no port, no Deferred entry — a genuine gap, not a non-issue.

## 2. Is every AD's Rule enforceable and does it actually prevent its stated divergence?

Each AD was checked for whether its "Rule" clause is realistically enforceable by the mechanism it names, not just by convention.

- **AD-2, AD-4, AD-6, AD-7** — enforceable by structure: a TS interface boundary (AD-2), an absent DB column plus non-writable API field (AD-4), an insert-only repository surface (AD-6), and a single domain function called from both driving adapters (AD-7). These hold up.

- **AD-1 (Finding, Medium):** titled "structural, not conventional," but the actual Rule leans on convention more than the title admits: "no route handler or service may query the database directly" is a code-review norm, not something the named mechanism (a Prisma Client extension that rejects queries missing `firmId`) can compile-enforce on its own — nothing stops a future route handler from importing a raw `PrismaClient` or calling `$queryRaw` directly, bypassing the extension entirely. The mechanism narrows the blast radius but doesn't close the loop the title claims. Worth tightening (e.g., only ever export the extended client from `adapters/db/`, add a lint rule banning direct `@prisma/client` imports outside that module) so the enforcement matches the claim.

- **AD-3 (Finding, Medium):** "every Status change ... calls the single `StatusTransition` application service. No code path writes `Document.status` directly." But the Design Paradigm section's own application-layer list names `StatusTransition` and `DelegatedApproval` as two separate services. The Rule never says whether `DelegatedApproval` composes/calls into `StatusTransition` internally, or independently mutates `Document.status` on its own path. As written, the spine defines two services that both plausibly touch the same field and doesn't specify their relationship — leaving exactly the "reimplemented differently... and drifting apart" risk AD-3 exists to prevent, unresolved for the one pair of services most likely to diverge (the delegated path is explicitly the alternate route to Filed/Sent that AD-3's own "Prevents" clause worries about).

## 3. Could anything under Deferred let two independently-built units diverge incompatibly?

Walked all six Deferred bullets:

- Concrete `DriveConnector` adapter — safe, AD-2 already isolates it structurally; explicit spike recommendation given.
- Managed Postgres hosting — infra vendor choice, no app-level divergence risk.
- Firm-provisioning process — genuinely not needed pre-multi-firm; AD-1 makes the schema ready.
- Notification channel beyond email — explicit PRD non-goal, correctly excluded.
- Client comment/question channel — correctly deferred; EXPERIENCE.md already treats the surface as non-interactive until answered, so no port exists to diverge on.
- Drive file deleted/moved reconciliation (background job vs. lazy check) — low risk; the UX behavior is already fixed by EXPERIENCE.md's State Patterns table, and `DriveConnector.getFileMetadata` already gives either implementation a shared method to key off, so a background-vs-lazy choice made later can't produce incompatible *behavior*, only incompatible *latency*.
- Scheduled-job mechanism for StaleCheck — well-guarded; explicitly gated on "any implementation... as long as it calls the shared StaleCheck service."

None of the six listed Deferred items themselves pose an incompatible-divergence risk — they're honestly deferred with the risk already fenced off by an AD or the UX spec. The problem isn't what's listed under Deferred; it's what's missing from that list entirely (see §5).

## 4. Is named tech verified-current, and does the memlog show research vs. assertion?

Checked each Stack row's plausibility for August 2026 and cross-referenced the memlog's verification language:

| Stack row | Plausible for Aug 2026? | Memlog verification |
|---|---|---|
| Node.js 24 (Active LTS) | Yes — matches the real Node release cadence (even majors go LTS each October; Node 24 released Apr 2025 → LTS Oct 2025 → still Active LTS through Aug 2026; Node 26 Current-not-LTS-until-Oct-2026 is consistent) | "per nodejs.org/endoflife.date web verification" — researched |
| Next.js 16.2.x | Plausible given ~yearly majors (15 shipped Oct 2024) | "per web verification" — researched |
| PostgreSQL 18.x | Plausible — Postgres ships a new major every September; PG18 (Sept 2025) would still be current through Aug 2026 | "per web verification" — researched |
| Prisma ORM 7.x (7.4.2) | Plausible given ~yearly majors | "per web verification" — researched |
| Tailwind CSS 4.3.x | Plausible — v4 shipped Jan 2025, minor-version cadence since | "per web verification" — researched |
| **TypeScript "latest 5.x"** | **Not verified — see finding** | **`[ASSUMPTION]` only, no verification citation** |

**Finding (Medium):** TypeScript is the one Stack row with no "per web verification" citation in the memlog — it's asserted ("paired with Next.js/Node default") rather than researched, unlike all five other rows. This matters concretely here: Microsoft's native/Go-based TypeScript compiler effort (targeting a TS 7 line) was public well ahead of this spine's authoring date, so "latest 5.x" is exactly the kind of claim that a quick search could confirm or correct, the same way the other five rows were checked. The spine's own text claims "All verified current at authoring via web search, not asserted from training data" for the whole table — the memlog doesn't back that claim for this one row.

## 5. Is every feature-altitude dimension decided, deferred, or an explicit open question?

This is where the spine's real gaps are. Three dimensions are silent — not decided, not in the Deferred list, not flagged as an open question:

**Finding (High) — Authentication mechanism is entirely unaddressed.** `AuthProvider` is named as a port, and AD-5 asserts staff and clients share it, but nothing in the spine says what concretely implements it. The Stack table has no auth library (no NextAuth/Auth.js, no Clerk, no custom session scheme). The Structural Seed's `adapters/auth/` folder says only "Auth adapter" with no vendor. Unlike `DriveConnector`, which got an explicit Deferred entry naming the two candidate implementations and a recommended resolution point (a Story 1.2 spike), `AuthProvider` gets no equivalent treatment at all — it's just silently unresolved. This is a materially bigger open question than the Drive adapter choice: staff auth (an internal team) and client auth (external, case-sensitive parties) plausibly need different credential mechanics, and nothing here commits to even the shape of a plan for that. The same gap exists, more mildly, for `EmailNotifier` — no vendor named, no Deferred note (lower stakes than auth, but the same missing-acknowledgment pattern).

**Finding (High) — Field-level redaction for the Client role is not covered by any AD.** DESIGN.md/EXPERIENCE.md commit hard to "the client sees the *identical* Document Card component" — but FR-12 still requires that Reviewed-by attribution never reaches the client, and NFR-3 requires that "firm-internal notes" (delegated-approval reasons, audit entries) never leak to a client either. AD-5's Rule frames Client narrowing purely as *row-level* scoping ("a Client role narrows what's visible... via grant scope on `ClientAccess`") — that's a Matter-level filter, not a field-level one. For a Document a client *does* have legitimate access to, nothing in the spine says where Reviewed-by gets stripped out of the payload before it reaches a client-authenticated request. Given the explicit "same card, same component" design decision, the natural implementation risk is a single serializer/API response shape shared by both roles, with redaction bolted on inconsistently (or forgotten) per endpoint — precisely the "differently-shaped security bugs" AD-5 was written to prevent, just one layer down from where AD-5 currently draws the line.

**Finding (High) — The operational/environmental envelope is effectively silent.** Deployment & environments gets a real (if thin) answer: dev/staging/prod, Vercel, managed Postgres (vendor deferred). But "operations" as a dimension — monitoring, alerting, backup/DR, error tracking — has nothing. Concretely: NFR-1 requires the stale-alert check to "run reliably... independent of whether any user has opened the app," yet nothing in the spine says what happens, or who is told, if the scheduled job itself fails to run or errors out. A silently-failing cron is the single most likely way NFR-1 gets violated in production, and the spine that names NFR-1 as a binding requirement (AD-7) has no answer for it. Similarly: no Postgres backup/DR policy for a system that is the audit-of-record for delegated approvals (AD-6 exists specifically because that trail has to be reliable); no mention of where "structured JSON with a request id" logs actually go (a log destination, not just a log format, is needed for the request-id convention to be useful); no mention of how Drive OAuth tokens (a credential granting access to the firm's case documents) are stored/encrypted at rest — a natural NFR-2/NFR-5-adjacent concern that AD-1's data-isolation focus doesn't cover.

**Finding (Medium) — New-document detection cadence/mechanism for FR-2 (Story 1.3) is missing outright.** PRD Open Question 2 and epics.md's "Additional Requirements" both explicitly flag this as unresolved ("New-document detection mechanism and polling interval for FR-2 — undecided"). AD-2 isolates *how* Drive is called (`listNewFiles`) behind a port, which is good, but says nothing about *when/how often* that method gets invoked — polling on a timer (like StaleCheck), a Drive push/webhook subscription, or something else. This is not a low-stakes deferral: SM-1 (Activation, target 80% of Matters with a Document within 24h) is directly sensitive to detection latency, and the mechanism choice (poll vs. webhook) has real structural consequences — a webhook needs an inbound endpoint and a differently-shaped trigger than the `jobs/` scheduled-runner pattern AD-7 established for StaleCheck. The spine's Deferred section explicitly handles the analogous StaleCheck-trigger question ("Exact scheduled-job mechanism... any implementation satisfies AD-7") — the equivalent acknowledgment for new-document detection is simply absent, not folded into that bullet and not listed separately.

---

## Summary of Findings

| # | Severity | Finding | Location |
|---|---|---|---|
| 1 | High | Authentication mechanism (`AuthProvider` concrete choice) is undecided and, unlike `DriveConnector`, not even acknowledged in Deferred — no stack entry, no adapter vendor, no resolution plan. `EmailNotifier` has the same lesser gap. | ARCHITECTURE-SPINE.md — Stack table; Design Paradigm ports list; Deferred section (missing entry) |
| 2 | High | No AD covers field-level redaction of Reviewed-by / audit data for the Client role; AD-5 only covers row-level (Matter) scoping, not attribute-level, despite the "identical Document Card" design decision making this a real shared-payload risk. | ARCHITECTURE-SPINE.md AD-5; cf. PRD FR-12, NFR-3; EXPERIENCE.md Information Architecture note |
| 3 | High | Operational/environmental envelope (monitoring/alerting on the StaleCheck cron, Postgres backup/DR, log destination, Drive-OAuth-token-at-rest storage) is silent — most acute because NFR-1's reliability requirement has no failure-detection story. | ARCHITECTURE-SPINE.md — Deployment & environments section (absent operations subsection) |
| 4 | Medium | New-document detection mechanism/cadence for FR-2 (Story 1.3) is neither decided nor deferred nor flagged — a real omission despite PRD Open Question 2 and epics.md explicitly calling it unresolved, and despite AD-7 modeling exactly this kind of acknowledgment for the sibling StaleCheck trigger. | ARCHITECTURE-SPINE.md Deferred section (missing entry); cf. epics.md Additional Requirements, PRD §9 Q2 |
| 5 | Medium | AD-3's Rule doesn't clarify whether the separately-listed `DelegatedApproval` application service composes `StatusTransition` or independently mutates `Document.status` — leaves room for the exact "reimplemented differently... and drifting apart" risk AD-3 exists to prevent. | ARCHITECTURE-SPINE.md AD-3 vs. Design Paradigm application-layer list |
| 6 | Medium | Epic 6 / FR-14 scan-file storage mechanism has no AD, port, or Deferred entry, despite NFR-5's "never store file content" constraint applying to scans as much as Drive files. | ARCHITECTURE-SPINE.md — no epic-specific AD for Epic 6; Structural Seed adapters list |
| 7 | Medium | AD-1's "structural, not conventional" framing overstates what the named mechanism (Prisma Client extension) actually enforces — the Rule still depends on a convention ("no route handler may query the database directly") that nothing compiles against. | ARCHITECTURE-SPINE.md AD-1 |
| 8 | Low | TypeScript's Stack row is the only one without a "per web verification" citation in the memlog — asserted, not researched, contradicting the spine's own claim that "All [Stack rows are] verified current at authoring via web search, not asserted from training data." | .memlog.md line 18 vs. ARCHITECTURE-SPINE.md Stack section closing note |

## What's solid (not re-litigating in findings)

- Paradigm choice (hexagonal) is well-justified against the one thing explicitly left open upstream (Drive mechanism), not adopted by default.
- AD-1, AD-4, AD-6, AD-7 each name a real, specific divergence and a mechanism that plausibly prevents it.
- FR/epic coverage for Epics 1–5 is complete and each AD's "Binds" list is accurate against epics.md.
- The Deferred section's six listed items are each honestly scoped, correctly justified, and don't themselves create incompatible-divergence risk (§3 above).
- Five of six Stack rows show genuine, cited research in the memlog, not just assertion.
- The spine correctly incorporates the FR-12 UX override (client sees Owner/Aging/Blocked) and the Story 1.5 reassignment gap the readiness report flagged — both are visibly reconciled in AD-5/AD-6 and the Deferred/consequences language.
