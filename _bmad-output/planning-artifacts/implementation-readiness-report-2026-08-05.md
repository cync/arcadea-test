---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  prd: "_bmad-output/planning-artifacts/prds/prd-Docket-2026-08-04/prd.md"
  addendum: "_bmad-output/planning-artifacts/prds/prd-Docket-2026-08-04/addendum.md"
  architecture: null
  epics: "_bmad-output/planning-artifacts/epics.md"
  ux: null
---

# Implementation Readiness Assessment Report

**Date:** 2026-08-05
**Project:** Docket

## Document Inventory

### PRD Files Found

**Whole Documents:**
- `_bmad-output/planning-artifacts/prds/prd-Docket-2026-08-04/prd.md` (status: draft)
- Companion: `_bmad-output/planning-artifacts/prds/prd-Docket-2026-08-04/addendum.md`

**Sharded Documents:** none

### Architecture Documents Found

**None found.**

### Epics & Stories Documents Found

**Whole Documents:**
- `_bmad-output/planning-artifacts/epics.md` (6 epics, 15 stories, all 16 FRs covered)

**Sharded Documents:** none

### UX Design Documents Found

**None found.**

## Issues Found

- No duplicates — one PRD, one epics document, no conflicting whole/sharded versions.
- ⚠️ **WARNING: Architecture document not found.** `bmad-architecture` was explicitly skipped by user decision. Several technical decisions remain open (Drive integration mechanism, new-Firm provisioning process) and are only tracked informally in the PRD addendum and epics.md's "Additional Requirements" section.
- ⚠️ **WARNING: UX design contract not found.** No `bmad-ux` run exists. Docket has real UI surface (Kanban-style board, client-facing view) with no design spec backing it.

## PRD Analysis

### Functional Requirements

FR-1: The firm can connect a Google Drive account so Docket can index files within a Matter's Drive folder. Docket never stores a copy of the file's content — only a reference (link, name, last-modified time). If the Drive connection is revoked, existing Document records persist with their status/deadline history, but file links become inactive.

FR-2: `[ASSUMPTION]` When a new file appears in a Matter's connected Drive folder, Docket creates a corresponding Document record at "Draft" status automatically, without requiring a manual "add to Docket" step. A file added directly in Drive appears on the board within a defined polling interval. Out of scope: detecting/reconciling files placed outside the Matter's designated Drive folder structure.

FR-3: Docket tracks only the current (last-saved) version of a linked file — not every save or redline pass. Opening a Document in Docket opens the live file in Drive. Docket displays the file's Drive last-modified timestamp; it does not maintain its own version history.

FR-4: Users can view all Documents for Matters they have access to, grouped by Status, and move a Document between Status values (Draft, Reviewed, Needs Revision, Waiting on Client Signature, Filed/Sent). All transitions are user-initiated; Docket does not infer Status from file changes, renames, or emails.

FR-5: Moving a Document to "Reviewed" requires recording which user performed the review. The board displays "Reviewed by {name}" wherever a Document is in or has passed the Reviewed status.

FR-6: The Attorney of Record can set or edit a Deadline on any Document belonging to their Matter.

FR-7: The board visually indicates how long each Document has sat in its current Status. A Document untouched for more than 3 days is visually distinguished from one recently updated.

FR-8: Docket sends an automated email when a Document's Aging exceeds 3 days. `[ASSUMPTION]` The alert fires once per staleness threshold crossing, not repeatedly every day the item remains stale. `[ASSUMPTION]` Alert recipients are the Attorney of Record and the Office Manager.

FR-9: A user with the Office Manager role can move a Document to Filed/Sent on behalf of the Attorney of Record. The action is recorded distinctly from a standard transition — the board and history show it was a delegated approval, by whom, and when.

FR-10: `[ASSUMPTION]` Every use of the delegated-approval action is logged with actor, timestamp, and the Document/Matter it applied to, visible to the Attorney of Record afterward.

FR-11: A client can be granted a Docket login scoped to one or more specific Matters. A client can never see a Matter, Document, or firm-internal note they have not been explicitly granted access to.

FR-12: `[ASSUMPTION]` A client's view is read-only: Document Status and Deadline only — no internal reviewer names, no ability to change Status or upload.

FR-13: The Attorney of Record (or Office Manager) can grant or revoke a client's access to a Matter at any time.

FR-14: A user can log a paper document as a Scanned Document, capturing a timestamp and who scanned it, and link the resulting scan file. A Scanned Document behaves like any other Document on the board (Status, Deadline, Aging) once logged.

FR-15: Every Document has exactly one Attorney of Record, set at creation, who remains the accountable owner regardless of who else edits, reviews, or moves it. Reassigning the Attorney of Record is an explicit action, not a side effect of another user editing it.

FR-16: Every Matter, Document, and user account belongs to exactly one Firm. No query, RBAC grant, or Client Access can return or expose data belonging to a different Firm. A user authenticated under one Firm cannot retrieve any Matter or Document record belonging to another Firm, even by direct reference. Firm-scoping is enforced at the data-access layer, not only in the UI.

Total FRs: 16

### Non-Functional Requirements

NFR-1: The stale-alert check must run reliably (e.g., daily) independent of whether any user has opened the app that day. (Reliability — PRD §4.3)

NFR-2: Firm-scoping (FR-16) must be enforced at the data-access layer, not only the UI. (Security — PRD §4.8)

NFR-3: Client Access must never expose a Matter, Document, or firm-internal note the client hasn't been explicitly granted. (Security — PRD §4.5, derived from FR-11)

NFR-4: The app is a responsive web app usable on mobile browsers; no native mobile app in v1. (Platform/Usability — PRD §6.1, §5)

NFR-5: Docket never stores or duplicates file content — only references/metadata to the Drive-hosted file (or scan) — so file content always remains Drive's source of truth. (Data Integrity — PRD §4.1, §5)

Total NFRs: 5

### Additional Requirements

**Explicit Non-Goals (PRD §5):**
- Not a document storage/management system — Drive remains the source of truth for file content.
- Does not encode court filing rules or compliance/procedural logic.
- No sign-off checklists or multi-step approval chains beyond the single Delegated Approval action.
- No automatic Status inference from file activity, renames, or email.
- Not a full practice/case-management system — no billing, no calendaring beyond per-document Deadline, no conflict checks.
- No native mobile app in v1.
- No self-serve Firm signup or billing. `[ASSUMPTION]` New Firms are provisioned by an internal/admin process.

**Open Questions carried into implementation (PRD §9, unresolved):**
1. Hard-block vs. warn-only when moving to Filed/Sent without a recorded Reviewed step.
2. Automatic vs. explicit-action new-document detection from Drive.
3. Whether a client can comment/ask a question through their read-only view.
4. Behavior when a linked Drive file is deleted or moved out of the watched folder.
5. Actual process for provisioning a new Firm (currently assumed manual/admin).

**Technical decisions deferred to implementation (addendum.md, no Architecture doc to resolve them):**
- Google Drive integration mechanism: custom API integration vs. an MCP driver (Claude plugin) — undecided.
- Bulk-import tool for existing Drive folders — named as the contingency response if Activation (SM-1) underperforms, not scoped in this PRD.

### PRD Completeness Assessment

The PRD is well-formed for its stated scope: 16 FRs with testable consequences, 5 NFRs, explicit Non-Goals, MoSCoW prioritization, and quantified Success Metrics with a counter-metric. Traceability is strong — every FR maps to a user journey or feature rationale.

Two completeness risks stand out:
1. **Status is still `draft`.** The PRD's own Finalize pass (reviewer gate, input reconciliation against source documents, open-item triage, polish) was explicitly skipped in favor of moving straight to epics. Nothing here is necessarily wrong, but it hasn't been adversarially reviewed.
2. **5 open questions and 1 unresolved integration-mechanism decision are still live**, with no Architecture document to have forced resolution. All are already reflected in `epics.md`'s "Additional Requirements" section so they aren't silently lost — but they represent real ambiguity a developer could resolve inconsistently with product intent if picked up without a PM check-in.

## Epic Coverage Validation

### Coverage Matrix

| FR Number | PRD Requirement | Epic Coverage | Status |
| --- | --- | --- | --- |
| FR-1 | Google Drive connection, per-Matter indexing, no content storage | Epic 1, Story 1.2 | ✓ Covered |
| FR-2 | New-document auto-detection from Drive folder | Epic 1, Story 1.3 | ✓ Covered |
| FR-3 | Current-version reference only (no version history) | Epic 1, Story 1.4 | ✓ Covered |
| FR-4 | Workflow board, manual Status transitions | Epic 2, Stories 2.1 & 2.2 | ✓ Covered |
| FR-5 | Reviewed-by attribution | Epic 2, Story 2.3 | ✓ Covered |
| FR-6 | Deadline assignment by Attorney of Record | Epic 3, Story 3.1 | ✓ Covered |
| FR-7 | Aging visualization | Epic 3, Story 3.2 | ✓ Covered |
| FR-8 | Stale alert email (3-day threshold) | Epic 3, Story 3.3 | ✓ Covered |
| FR-9 | Delegated approval action (Office Manager) | Epic 4, Story 4.1 | ✓ Covered |
| FR-10 | Delegated-approval audit trail | Epic 4, Story 4.2 | ✓ Covered |
| FR-11 | Client login, Matter-scoped | Epic 5, Story 5.1 | ✓ Covered |
| FR-12 | Client read-only view | Epic 5, Story 5.2 | ✓ Covered |
| FR-13 | Client access grant/revoke | Epic 5, Story 5.3 | ✓ Covered |
| FR-14 | Scanned document logging | Epic 6, Story 6.1 | ✓ Covered |
| FR-15 | Fixed Attorney-of-Record ownership | Epic 1, Story 1.3 | ✓ Covered |
| FR-16 | Firm-scoped data isolation | Epic 1, Story 1.1 | ✓ Covered |

No FRs found in epics.md that are absent from the PRD — the epic set was derived directly from the PRD's FR list, so there's no drift in the other direction either.

### Missing Requirements

None. All 16 PRD Functional Requirements have traceable story-level coverage.

### Coverage Statistics

- Total PRD FRs: 16
- FRs covered in epics: 16
- Coverage percentage: 100%

## UX Alignment Assessment

### UX Document Status

Not Found. No `bmad-ux` run exists (no `DESIGN.md`/`EXPERIENCE.md` pair, no legacy `*ux*.md`).

### Alignment Issues

N/A — no UX document to check alignment against.

### Warnings

⚠️ **UX is clearly implied but missing.** The PRD describes real, non-trivial UI surface: a Kanban-style workflow board (FR-4), a responsive/mobile-capable web app (NFR-4), a distinct read-only client view (FR-11–13), and visual aging indicators (FR-7). None of this has a formal design spec — information architecture, interaction states, and accessibility are all undefined.

One partial input exists: the user has specified that any future UX work must apply the Airtable-inspired design system at `https://getdesign.md/airtable/design-md` (saved as a standing reference for when `bmad-ux` runs). This addresses *visual identity* only — it does not substitute for a full UX design contract (journeys, IA, interaction/accessibility spec), which is still absent.

## Epic Quality Review

Reviewed all 6 epics / 15 stories in `epics.md` against create-epics-and-stories best practices: user-value focus, epic independence, story sizing/sequencing, AC quality, and DB/entity creation timing.

### Compliance Checklist

| Epic | User value | Independent | Stories sized right | No forward deps | Entities created on-demand | Traceable to FRs |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Document Intake | ✓ | ✓ | ✓ | ✓ | ✓ (Matter→Connection→Document, incremental) | ✓ |
| 2. Workflow Board | ✓ | ✓ (needs only Epic 1 output) | ✓ | ✓ | ✓ (reuses Document from Epic 1) | ✓ |
| 3. Deadlines & Staleness | ✓ | ✓ (needs Epic 1 & 2 output) | ✓ | ✓ | ✓ (Deadline field, first use) | ✓ |
| 4. Delegated Approval | ✓ | ✓ (needs Epic 2 output) | ✓ | ✓ | ✓ (audit entity, first use) | ✓ |
| 5. Client Visibility | ✓ | ✓ | ✓ | ✓ | ✓ (access-grant entity, first use) | ✓ |
| 6. Paper Tracking | ✓ | ✓ | ✓ | ✓ | ✓ (scan fields, first use) | ✓ |

No epic is a disguised technical milestone; no epic requires a *later* epic to function; no story references a future story's output.

### 🔴 Critical Violations

None found.

### 🟠 Major Issues

1. **Systemic lack of negative/error-path acceptance criteria.** Nearly all 15 stories cover only the happy path. Concrete gaps: Story 1.2 has no AC for a failed/denied Drive OAuth connection; Story 1.1 has no AC for invalid/incomplete Matter data; Story 3.1 has no AC for an invalid deadline date; Story 5.3 has no AC for revoking access that was never granted. **Recommendation:** add at least one error-path AC per story before a dev agent picks it up, or explicitly accept this as a gap to be caught during `bmad-dev-story`/`bmad-code-review`.
2. **FR-15's reassignment consequence has no implementing story.** The PRD states "Reassigning the Attorney of Record on a Document is an explicit action" (FR-15), and Story 1.3's AC asserts ownership *doesn't* change as a side effect — but no story anywhere delivers the reassignment action itself. **Recommendation:** either add a "Reassign Attorney of Record" story to Epic 1, or confirm ownership is immutable post-creation for MVP and drop the "explicit action" language from the PRD.

### 🟡 Minor Concerns

1. Story 3.1 (Set a Deadline) has only one AC — thinner than its siblings. Consider adding an AC for editing an existing deadline.
2. Access-denial ACs (e.g., Story 1.1's cross-Firm denial) describe behavior generically ("the request is denied") without a specific system response — normal at story granularity, but a dev agent will need this pinned down at implementation time since no Architecture exists to have specified it.
3. No explicit project-scaffolding/dev-environment story exists in Epic 1. Not a violation on its own (no Architecture-specified starter template to require it), but worth a conscious call before Story 1.1 starts, since there's no Architecture doc to have made that call either way.
4. The Status-transition graph (which Status → Status moves are actually valid — e.g., can Filed/Sent revert to Draft?) is unconstrained in both the PRD and Story 2.2. This is an inherited PRD ambiguity, not a new defect introduced by the epics — but it's worth resolving before Epic 2 development starts.

## Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK**

FR-to-story traceability is complete (100%, no critical epic-quality violations) — the planning is not broken. But two upstream artifacts were deliberately skipped (Architecture, UX), and that absence is already visible as concrete downstream risk: an unresolved integration mechanism that Story 1.2 needs, an undefined interaction/IA spec that Epic 2's board needs, and a PRD still sitting in `draft` status with 5 open questions never adversarially reviewed.

### Critical Issues Requiring Immediate Action

None are blocking — nothing here prevents starting Epic 1, Story 1.1 today. But three things will stall development within the first few stories if left unresolved:

1. **Drive integration mechanism undecided** (custom API vs. MCP driver) — needed by Story 1.2, the second story in the plan.
2. **No UX spec** — needed by Epic 2 (the workflow board), the second epic in the plan. Only a visual-identity reference exists (Airtable-inspired design system); IA, journeys, and accessibility are undefined.
3. **FR-15's "reassignment is an explicit action"** has no implementing story — a real feature-vs-constraint ambiguity that should be resolved before Epic 1 is considered complete, not discovered mid-development.

### Recommended Next Steps

1. Decide the Drive integration mechanism (or explicitly defer it to be decided *during* Story 1.2's implementation) — cheap to resolve now, expensive to discover mid-story.
2. Run `bmad-ux` before Epic 2 starts, applying the saved Airtable-inspired design-system reference — at minimum for the workflow board and client view, the two most UI-heavy surfaces.
3. Resolve the FR-15 reassignment gap: add a story, or confirm ownership is immutable post-creation and update the PRD.
4. Add error-path ACs to the stories called out in Major Issue #1, or explicitly accept the gap and catch it during `bmad-dev-story`/`bmad-code-review`.
5. Consider running the PRD's own Finalize pass (reviewer gate + input reconciliation) retroactively, since it was skipped — the PRD has never been adversarially reviewed and still carries `status: draft`.

### Final Note

This assessment identified 2 warnings (missing Architecture, missing UX), 2 major issues, and 4 minor concerns across document discovery, PRD analysis, epic coverage, UX alignment, and epic quality review. None are critical or block starting Epic 1 immediately. These findings can be used to improve the artifacts, or you may choose to proceed as-is and resolve them as they're hit during development.
