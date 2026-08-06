---
title: Docket
status: draft
created: 2026-08-04
updated: 2026-08-05
---

# PRD: Docket
*Working title — confirm.*

## 0. Document Purpose

This PRD defines Docket, an internal document-workflow tool for a single law firm (~12 people). It is written for the firm's stakeholders and for downstream workflow owners (UX, architecture, epics/stories). Terms are Glossary-anchored (§3); Functional Requirements are grouped by feature and globally numbered (§4); inferred content is tagged inline `[ASSUMPTION]` and indexed in §10. This PRD builds on a prior brainstorming session, distilled into `brainstorm-intent.md` (see `_bmad-output/brainstorming/brainstorm-independent-law-firms-document-workflow-2026-08-04/`).

## 1. Vision

Independent law firms run case documents through email, shared drives, and paper — which means finding the *current* version of anything is its own task, and when the attorney of record is unreachable (in court, most often), nobody else can tell whether a filing is drafted, reviewed, or already sent. Deadlines slip silently, and the two failure modes that actually cost the firm money are concrete: an outdated draft gets filed, or an unsigned copy does.

Docket is a single pane of glass — status and deadline, nothing more — layered on top of the Google Drive the firm already uses. It doesn't replace the drive or become a new place to store files; it makes the state of every in-flight document visible to everyone who needs it, and it keeps working even when the one person who owns the document goes dark. Two things do that job: an aging view with a stale-item alert that surfaces risk before it's silent, and a delegated-approval path so someone else can act when the attorney can't.

The bet is narrow on purpose: solve version-and-status visibility well, without asking a firm to change how or where they keep files. Docket launches with one firm, but its data model is multi-tenant from the start — every Matter, Document, and user belongs to a Firm, so onboarding additional firms later is a provisioning decision, not a rebuild.

## 2. Target User

### 2.1 Jobs To Be Done

- When a case document needs to move from draft to filed or sent, the firm wants one place that shows its current version, approval status, and deadline, so that nothing is missed and no one ever sends the wrong version.
- As a paralegal, I want to know at a glance whether a filing is drafted, reviewed, or sent, without emailing to ask.
- As the attorney of record, I want to set a deadline once and trust that someone will be alerted if the document stalls, even if I'm in court and unreachable.
- As the office manager, I want a clear, accountable way to approve and send a filing when the attorney can't, instead of an informal judgment call.
- As a client, I want to see where my matter's documents stand without calling the firm.

### 2.2 Non-Users (v1)

- Firms Docket hasn't been provisioned for. The data model is multi-tenant, but v1 has no self-serve signup — a new Firm is added by an internal/admin process, not a public flow.
- Opposing counsel and court clerks — Docket does not extend visibility outside a Firm and its clients.

### 2.3 Key User Journeys

- **UJ-1. Mara moves a filing from draft to sent.**
  - **Persona + context:** Mara, a paralegal, is finishing a motion that's due Friday.
  - **Entry state:** Authenticated in Docket on her desktop browser, viewing the firm's workflow board.
  - **Path:** She finds the matter's card in "Draft," attaches the finished file (already saved to the matter's Drive folder), and drags the card to "Reviewed," recording the attorney as reviewer. Once the attorney confirms, she drags it to "Filed/Sent."
  - **Climax:** The board shows the document's real status the moment she moves it — no one has to ask her or email to check.
  - **Resolution:** The matter's deadline clears from the "at risk" view; the attorney sees it updated from the courthouse on his phone.
  - **Edge case:** If Mara tries to move a card to "Filed/Sent" without a "Reviewed" step recorded, `[ASSUMPTION]` Docket warns her but does not hard-block the transition — small firm, trusts its own people.

- **UJ-2. The office manager sends a filing the attorney can't reach.**
  - **Persona + context:** Denise, the office manager, gets a stale-item alert: a filing due tomorrow hasn't moved in three days, and the attorney is in trial, unreachable.
  - **Entry state:** Authenticated in Docket, arriving from the alert email link.
  - **Path:** She opens the document card, sees it's sitting at "Reviewed," confirms with the paralegal that it's ready, and uses the delegated-approval action to move it to "Filed/Sent" on the attorney's behalf.
  - **Climax:** The deadline is met without anyone hunting the attorney down mid-trial, and the action is recorded as a delegated approval, not silently as the attorney's own.
  - **Resolution:** The attorney sees, after court, that Denise handled it and exactly when.

- **UJ-3. A client checks their matter without calling.**
  - **Persona + context:** A client wants to know if their filing went out before the deadline they were told about.
  - **Entry state:** Authenticated via a client login scoped to their matter(s) only.
  - **Path:** They open Docket, see their matter, and see the one document relevant to them: status "Filed/Sent," with the date.
  - **Climax:** They get the answer without a phone call or a "let me check and get back to you" email.
  - **Resolution:** They close the app reassured; no firm time spent on a status-check call.

## 3. Glossary

- **Firm** — A tenant organization using Docket. Matters and users belong to exactly one Firm; no data or access crosses Firm boundaries.
- **Matter** — A case or client engagement, belonging to a Firm. Documents belong to a Matter. One Matter can have many Documents.
- **Document** — A case file tracked in Docket, backed by a file in the firm's connected Google Drive (or, for paper originals, a scanned copy). Docket does not store the file itself — only its status, deadline, and metadata.
- **Status** — A Document's current stage: Draft, Reviewed, Needs Revision, Waiting on Client Signature, or Filed/Sent. Changed manually by a user action, never inferred automatically.
- **Deadline** — A date set per Document by the Attorney of Record, tied to the Matter.
- **Aging** — How long a Document has sat in its current Status without a change, shown visually on the board.
- **Stale Alert** — An automated email sent when a Document's Aging exceeds 3 days.
- **Delegated Approval** — An action available to the Office Manager role that moves a Document to Filed/Sent on behalf of the Attorney of Record, recorded distinctly from an owner-initiated transition.
- **Attorney of Record** — The single, fixed owner of a Document, regardless of who last edited or moved it.
- **Client Access** — A read-scoped login for a client, limited by RBAC to the Matter(s) they're party to.
- **Scanned Document** — A Document whose source is paper, entered into Docket as a scan with a timestamp and the name of who scanned it.

## 4. Features

### 4.1 Document Intake & Drive Indexing

**Description:** Docket connects to the firm's Google Drive and indexes files per Matter rather than storing copies itself. A Document enters Docket from the moment it's created, not only once a deadline is set. Realizes UJ-1.

#### FR-1: Google Drive connection

The firm can connect a Google Drive account so Docket can index files within a Matter's Drive folder.

**Consequences (testable):**
- Docket never stores a copy of the file's content — only a reference (link, name, last-modified time).
- If the Drive connection is revoked, existing Document records persist with their status/deadline history, but file links become inactive.

#### FR-2: New document detection

`[ASSUMPTION]` When a new file appears in a Matter's connected Drive folder, Docket creates a corresponding Document record at "Draft" status automatically, without requiring a manual "add to Docket" step.

**Consequences (testable):**
- A file added directly in Drive (not through Docket) appears on the board within a defined polling interval.

**Out of Scope:**
- Detecting or reconciling files placed outside the Matter's designated Drive folder structure.

#### FR-3: Current-version reference

Docket tracks only the current (last-saved) version of a linked file — not every save or redline pass. Opening a Document in Docket opens the live file in Drive.

**Consequences (testable):**
- Docket displays the file's Drive last-modified timestamp; it does not maintain its own version history.

### 4.2 Status & Workflow Board

**Description:** A Kanban-style board where Documents move through Status values via explicit user action. Realizes UJ-1.

#### FR-4: Workflow board

Users can view all Documents for Matters they have access to, grouped by Status, and move a Document between Status values.

**Consequences (testable):**
- Status values available: Draft, Reviewed, Needs Revision, Waiting on Client Signature, Filed/Sent.
- All transitions are user-initiated; Docket does not infer Status from file changes, renames, or emails.

#### FR-5: Reviewed-by attribution

Moving a Document to "Reviewed" requires recording which user performed the review.

**Consequences (testable):**
- The board displays "Reviewed by {name}" wherever a Document is in or has passed the Reviewed status.

### 4.3 Deadlines & Aging

**Description:** The Attorney of Record sets a Deadline per Document. The board visualizes Aging and triggers a Stale Alert. Realizes UJ-2.

#### FR-6: Deadline assignment

The Attorney of Record can set or edit a Deadline on any Document belonging to their Matter.

#### FR-7: Aging visualization

The board visually indicates how long each Document has sat in its current Status.

**Consequences (testable):**
- A Document untouched for more than 3 days is visually distinguished from one recently updated.

#### FR-8: Stale alert email

Docket sends an automated email when a Document's Aging exceeds 3 days.

**Consequences (testable):**
- The alert fires once per staleness threshold crossing, not repeatedly every day the item remains stale. `[ASSUMPTION]`
- `[ASSUMPTION]` Alert recipients are the Attorney of Record and the Office Manager — both roles capable of acting on it.

**Feature-specific NFRs:**
- The alert check must run reliably (e.g., daily) independent of whether any user has opened the app that day.

### 4.4 Delegated Approval

**Description:** Gives the Office Manager a defined path to act when the Attorney of Record is unreachable, instead of an informal workaround. Realizes UJ-2.

#### FR-9: Delegated approval action

A user with the Office Manager role can move a Document to Filed/Sent on behalf of the Attorney of Record.

**Consequences (testable):**
- The action is recorded distinctly from a standard transition — the board and history show it was a delegated approval, by whom, and when.

#### FR-10: Delegated-approval audit trail

`[ASSUMPTION]` Every use of the delegated-approval action is logged with actor, timestamp, and the Document/Matter it applied to, visible to the Attorney of Record afterward.

### 4.5 Client Access

**Description:** Gives clients visibility without a phone call, scoped strictly by RBAC. Realizes UJ-3.

#### FR-11: Client login and matter scoping

A client can be granted a Docket login scoped to one or more specific Matters.

**Consequences (testable):**
- A client can never see a Matter, Document, or firm-internal note they have not been explicitly granted access to.

#### FR-12: Client view

A client's view is read-only: Document Status, Deadline, Owner (Attorney of Record), Aging, and the Blocked indicator — the same data shown on the internal workflow board. No Reviewed-by attribution, no ability to change Status or upload. *(Resolved during UX design: the client card was deliberately widened from the original Status+Deadline-only assumption — showing who's accountable and how stuck a filing is reduces the "let me check and call you back" calls the client-facing metrics care about.)*

#### FR-13: Access grant/revoke

The Attorney of Record (or Office Manager) can grant or revoke a client's access to a Matter at any time.

### 4.6 Paper Document Tracking

**Description:** Covers the reality that not everything arrives digitally. Ties a paper original to an accountable, timestamped record.

#### FR-14: Scanned document logging

A user can log a paper document as a Scanned Document, capturing a timestamp and who scanned it, and link the resulting scan file.

**Consequences (testable):**
- A Scanned Document behaves like any other Document on the board (Status, Deadline, Aging) once logged.

### 4.7 Document Ownership

**Description:** Establishes accountability independent of who last touched a file.

#### FR-15: Fixed document ownership

Every Document has exactly one Attorney of Record, set at creation, who remains the accountable owner regardless of who else edits, reviews, or moves it.

**Consequences (testable):**
- Reassigning the Attorney of Record on a Document is an explicit action, not a side effect of another user editing it.

### 4.8 Multi-Tenant Foundation

**Description:** Docket's data model scopes everything by Firm, so onboarding a second firm later is a provisioning step, not a rebuild. This is infrastructure underlying every other feature, not a user-facing capability on its own.

#### FR-16: Firm-scoped data isolation

Every Matter, Document, and user account belongs to exactly one Firm. No query, RBAC grant, or Client Access (FR-11) can return or expose data belonging to a different Firm.

**Consequences (testable):**
- A user authenticated under one Firm cannot retrieve any Matter or Document record belonging to another Firm, even by direct reference (e.g., guessing an ID).

**Feature-specific NFRs:**
- Firm-scoping is enforced at the data-access layer, not only in the UI.

## 5. Non-Goals (Explicit)

- Docket is not a document storage or management system. It does not duplicate, version, or become the source of truth for file *content* — Google Drive remains that.
- Docket does not encode court filing rules or compliance/procedural logic. Deadline tracking is generic, not jurisdiction-aware.
- Docket does not implement sign-off checklists or multi-step approval chains beyond the single Delegated Approval action.
- Docket does not infer Status automatically from file activity, file renames, or email — all transitions are explicit user actions.
- Docket is not a full practice- or case-management system: no billing, no calendaring beyond the per-document Deadline, no conflict checks.
- No native mobile app in v1 — mobile access is via the responsive web app only.
- No self-serve Firm signup or billing in v1. `[ASSUMPTION]` New Firms are provisioned by an internal/admin process; Docket is multi-tenant underneath, but not a public SaaS onboarding flow.

## 6. MVP Scope

### 6.1 In Scope

- Google Drive connection and per-Matter document indexing (FR-1–3)
- Kanban-style workflow board with the five defined Status values (FR-4–5)
- Attorney-set Deadlines, Aging visualization, 3-day Stale Alert email (FR-6–8)
- Delegated Approval action for the Office Manager, with audit trail (FR-9–10)
- Client Access via RBAC-scoped read-only view (FR-11–13)
- Scanned Document logging for paper originals (FR-14)
- Fixed Attorney-of-Record ownership per Document (FR-15)
- Firm-scoped multi-tenant data isolation (FR-16)
- Responsive web app usable on mobile browsers

### 6.2 Out of Scope for MVP

- Multi-provider cloud storage (Dropbox, OneDrive, etc.) — Google Drive only. Reason: confirmed as the firm's actual tool.
- In-app or SMS notifications — email only for the Stale Alert. `[NOTE FOR PM]` revisit if the 3-day alert proves too easy to miss in inbox noise.
- Automatic status inference from file or email activity.
- Bulk-import tooling for existing Drive folders — deferred, but see §8 counter-metric response: build this first if Activation underperforms rather than assuming the workflow itself is wrong.
- Reporting/analytics dashboards beyond the three Success Metrics.
- SSO beyond what Google Drive's own OAuth provides. `[ASSUMPTION]`

## 7. Prioritization (MoSCoW)

*For stakeholder alignment. Maps directly to the FRs in §4 — use this to validate scope quickly across the firm before committing to epics/stories.*

**Must have (v1 cannot ship without):**
- FR-1 Google Drive connection
- FR-2 New document detection
- FR-3 Current-version reference
- FR-4 Workflow board
- FR-6 Deadline assignment
- FR-7 Aging visualization
- FR-8 Stale alert email
- FR-9 Delegated approval action
- FR-15 Fixed document ownership
- FR-16 Firm-scoped data isolation

**Should have (important, not launch-blocking):**
- FR-5 Reviewed-by attribution
- FR-10 Delegated-approval audit trail
- FR-11 Client login and matter scoping
- FR-12 Client view
- FR-13 Access grant/revoke

**Could have (valuable, defer under time pressure):**
- FR-14 Scanned document logging

**Won't have (this version):**
- Multi-provider cloud storage (Dropbox, OneDrive, etc.)
- In-app or SMS notifications (email-only Stale Alert)
- Automatic status inference from file/email activity
- Bulk-import tool for existing Drive folders (deferred; see SM-C1)
- Reporting/analytics dashboards beyond §8's Success Metrics
- Native mobile app
- Self-serve Firm signup or billing
- SSO beyond Google's own OAuth

## 8. Success Metrics

**Primary**
- **SM-1 (Activation):** % of new Matters with at least one Document uploaded within 24 hours of Matter creation. Target: 80%. Validates FR-1, FR-2.
- **SM-2 (Engagement):** Weekly active Documents-in-workflow — Documents that move Status at least once per week — as a proxy for whether the pipeline is used or bypassed. Validates FR-4.
- **SM-3 (Outcome):** Missed-deadline rate — % of Deadlined Documents not Filed/Sent by their due date. Target: <2%, measured against the firm's self-reported baseline before Docket. Validates FR-6, FR-7, FR-8, FR-9.

**Counter-metrics (do not optimize)**
- **SM-C1:** If SM-1 (Activation) is low, the working hypothesis is onboarding friction — investigate a bulk-import tool from existing Drive folders — before concluding the workflow itself is rejected. Counterbalances SM-1.

## 9. Open Questions

1. Should moving a Document to "Filed/Sent" without a recorded "Reviewed" step be hard-blocked, or just warned (current assumption, UJ-1 edge case)?
2. Is new-document detection from Drive automatic (current assumption, FR-2) or should it require an explicit "add to Docket" action — automatic is more seamless but riskier if the Drive folder also holds non-case files?
3. Can a client comment or ask a question through their read-only view, or is it strictly view-only with no interaction channel?
4. What happens to a Document's Docket record if its underlying Drive file is deleted or moved out of the watched folder?
5. Now that Docket is multi-tenant (FR-16), what's the actual process for provisioning a new Firm — a manual admin/ops step, an internal tool, or something else? Currently assumed manual (§5); worth confirming before `bmad-architecture`.

## 10. Assumptions Index

- §2.3 UJ-1 edge case — moving to Filed/Sent without a Reviewed step warns but doesn't hard-block.
- §4.1 FR-2 — new-document detection from Drive is automatic, not manually triggered.
- §4.3 FR-8 — stale alert fires once per threshold crossing, not daily while stale; recipients are Attorney of Record + Office Manager.
- §4.4 FR-10 — delegated-approval actions are logged with actor, timestamp, and target, visible to the Attorney of Record.
- §4.5 FR-12 — client view is read-only, resolved (not assumed) at UX design to include Owner/Aging/Blocked alongside Status + Deadline; still no Reviewed-by attribution or upload capability.
- §5 — new Firms are provisioned by an internal/admin process, not self-serve signup. Flagged as an open question in §9.
- §6.2 — no SSO beyond Google's own OAuth is in scope for v1.
