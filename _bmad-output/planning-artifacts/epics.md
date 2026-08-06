---
stepsCompleted: [1, 2, 3]
inputDocuments: ["_bmad-output/planning-artifacts/prds/prd-Docket-2026-08-04/prd.md", "_bmad-output/planning-artifacts/prds/prd-Docket-2026-08-04/addendum.md"]
---

# Docket - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Docket, decomposing the requirements from the PRD (no Architecture or UX design contract exists yet — this run proceeds on the PRD alone, per explicit user decision to skip `bmad-architecture`).

## Requirements Inventory

### Functional Requirements

- FR-1: The firm can connect a Google Drive account so Docket can index files within a Matter's Drive folder, without storing file content itself.
- FR-2: When a new file appears in a Matter's connected Drive folder, Docket creates a corresponding Document record at "Draft" status automatically. `[ASSUMPTION in PRD]`
- FR-3: Docket tracks only the current (last-saved) version of a linked file; opening a Document in Docket opens the live file in Drive.
- FR-4: Users can view all Documents for Matters they have access to, grouped by Status, and move a Document between Status values (Draft, Reviewed, Needs Revision, Waiting on Client Signature, Filed/Sent) via explicit action only.
- FR-5: Moving a Document to "Reviewed" requires recording which user performed the review.
- FR-6: The Attorney of Record can set or edit a Deadline on any Document belonging to their Matter.
- FR-7: The board visually indicates how long each Document has sat in its current Status (Aging).
- FR-8: Docket sends an automated email when a Document's Aging exceeds 3 days.
- FR-9: A user with the Office Manager role can move a Document to Filed/Sent on behalf of the Attorney of Record (Delegated Approval).
- FR-10: Every use of the delegated-approval action is logged with actor, timestamp, and the Document/Matter it applied to. `[ASSUMPTION in PRD]`
- FR-11: A client can be granted a Docket login scoped to one or more specific Matters.
- FR-12: A client's view is read-only: Document Status, Deadline, Owner (Attorney of Record), Aging, and the Blocked indicator — the same data shown on the internal workflow board. No Reviewed-by attribution, no ability to change Status or upload. (Resolved during UX design — widened from the PRD's original Status+Deadline-only assumption.)
- FR-13: The Attorney of Record (or Office Manager) can grant or revoke a client's access to a Matter at any time.
- FR-14: A user can log a paper document as a Scanned Document, capturing a timestamp and who scanned it, and link the resulting scan file.
- FR-15: Every Document has exactly one Attorney of Record, set at creation, who remains the accountable owner regardless of who else edits, reviews, or moves it.
- FR-16: Every Matter, Document, and user account belongs to exactly one Firm; no query, RBAC grant, or Client Access can expose data belonging to a different Firm.

### NonFunctional Requirements

- NFR-1 (Reliability): The 3-day stale-alert check must run reliably (e.g., daily) independent of whether any user has opened the app that day. (PRD §4.3 feature-specific NFR)
- NFR-2 (Security): Firm-scoping (FR-16) must be enforced at the data-access layer, not only the UI — no cross-Firm data exposure even via direct record reference. (PRD §4.8 feature-specific NFR)
- NFR-3 (Security): Client Access (FR-11–13) must never expose a Matter, Document, or firm-internal note the client hasn't been explicitly granted.
- NFR-4 (Platform): The app is a responsive web app usable on mobile browsers; no native mobile app in v1.
- NFR-5 (Data Integrity): Docket never stores or duplicates file content — only references/metadata to the Drive-hosted file (or scan) — so file content always remains Drive's source of truth.

### Additional Requirements

**No Architecture document exists for this project** — `bmad-architecture` was explicitly skipped. The following technical decisions are flagged as open in the PRD/addendum and are NOT resolved; epics/stories below treat them as implementation-detail choices to make during development rather than locked architectural constraints:

- Google Drive integration mechanism: custom API integration vs. an MCP driver (Claude plugin) — undecided (addendum.md, "Drive Integration — Mechanism").
- New-document detection mechanism and polling interval for FR-2 — undecided (PRD §9 Open Question 2).
- New-Firm provisioning process (FR-16 supports multi-tenancy, but no provisioning tool/flow is specified) — undecided (PRD §9 Open Question 5).
- Whether "Filed/Sent without Reviewed" is a hard block or a warning (PRD §9 Open Question 1) — currently assumed as warn-only.
- Behavior when a linked Drive file is deleted or moved out of the watched folder (PRD §9 Open Question 4) — undecided.

### UX Design Requirements

None — no UX design contract exists for this project yet.

### FR Coverage Map

FR-1: Epic 1 - Google Drive connection
FR-2: Epic 1 - New document detection
FR-3: Epic 1 - Current-version reference
FR-15: Epic 1 - Fixed document ownership (Story 1.3 assignment/immutability, Story 1.5 explicit reassignment)
FR-16: Epic 1 - Firm-scoped data isolation
FR-4: Epic 2 - Workflow board / status transitions
FR-5: Epic 2 - Reviewed-by attribution
FR-6: Epic 3 - Deadline assignment
FR-7: Epic 3 - Aging visualization
FR-8: Epic 3 - Stale alert email
FR-9: Epic 4 - Delegated approval action
FR-10: Epic 4 - Delegated-approval audit trail
FR-11: Epic 5 - Client login and matter scoping
FR-12: Epic 5 - Client view
FR-13: Epic 5 - Access grant/revoke
FR-14: Epic 6 - Scanned document logging

## Epic List

### Epic 1: Document Intake — Connect Drive & See Your Documents
Firm connects Google Drive; every case document in a Matter's folder shows up in Docket automatically, owned by a fixed attorney, scoped to the firm.
**FRs covered:** FR-1, FR-2, FR-3, FR-15, FR-16
**NFRs:** NFR-2, NFR-5

### Epic 2: Workflow Board — Track Status From Draft to Filed
Users see and move documents through Draft → Reviewed → Needs Revision → Waiting on Signature → Filed/Sent, with reviewer attribution.
**FRs covered:** FR-4, FR-5

### Epic 3: Deadlines & Staleness — Never Miss a Deadline Silently
Attorneys set deadlines; the board visualizes aging; a stale item triggers an email alert after 3 days untouched.
**FRs covered:** FR-6, FR-7, FR-8
**NFRs:** NFR-1

### Epic 4: Delegated Approval — Keep Moving When the Attorney's Unreachable
Office Manager can approve & send on the attorney's behalf, with an audit trail.
**FRs covered:** FR-9, FR-10

### Epic 5: Client Visibility — Let Clients Check Status Without Calling
Clients get a scoped, read-only login to see their matter's document status and deadline.
**FRs covered:** FR-11, FR-12, FR-13
**NFRs:** NFR-3

### Epic 6: Paper Document Tracking — Log Scanned Originals
Staff can log a paper original as a Scanned Document (who, when), and it behaves like any other Document on the board.
**FRs covered:** FR-14

## Epic 1: Document Intake — Connect Drive & See Your Documents

Firm connects Google Drive; every case document in a Matter's folder shows up in Docket automatically, owned by a fixed attorney, scoped to the firm. **FRs:** FR-1, FR-2, FR-3, FR-15, FR-16 · **NFRs:** NFR-2, NFR-5

### Story 1.1: Create a Matter

As an Office Manager,
I want to create a new Matter for a case,
So that Docket has a place to track that case's documents.

**Acceptance Criteria:**

**Given** I'm authenticated to my Firm
**When** I create a new Matter with a name and client
**Then** a Matter record is created, scoped to my Firm

**Given** a Matter exists under Firm A
**When** a user authenticated to Firm B attempts to access it by direct ID
**Then** the request is denied — no cross-Firm exposure

### Story 1.2: Connect Google Drive to a Matter

As an Office Manager,
I want to connect my Firm's Google Drive account and link a Matter to a Drive folder,
So that Docket knows where to find that Matter's documents.

**Acceptance Criteria:**

**Given** I'm authenticated
**When** I connect a Google Drive account
**Then** Docket stores the OAuth connection for my Firm — not any file content

**Given** a Matter
**When** I link it to a specific Drive folder
**Then** that folder becomes the watched source for that Matter's Documents

**Given** the Drive connection is later revoked
**When** existing Documents are viewed
**Then** their status/deadline history persists, but file links show as inactive

### Story 1.3: Auto-Detect New Documents from Drive

As a paralegal,
I want a new file added to a Matter's Drive folder to automatically appear in Docket,
So that I don't have to manually add every document.

**Acceptance Criteria:**

**Given** a Matter's Drive folder is connected
**When** a new file appears in that folder
**Then** a Document record is created in Docket at "Draft" status within a defined polling interval
**And** the Document is assigned exactly one Attorney of Record at creation

**Given** a Document already has an assigned Attorney of Record
**When** another user edits or moves the Document
**Then** the Attorney of Record does not change — reassignment is a separate, explicit action

**Given** a file is placed outside the Matter's designated Drive folder
**When** Docket scans for new documents
**Then** that file is not detected or reconciled

### Story 1.4: View a Document's Current Version

As a user,
I want to open a Document in Docket and see its current version,
So that I always work from the latest file, not a stale copy.

**Acceptance Criteria:**

**Given** a Document linked to a Drive file
**When** I open it in Docket
**Then** I see the file's Drive last-modified timestamp and a link that opens the live file in Drive

**Given** Docket never stores file content
**When** I view any Document
**Then** no file content is duplicated or cached within Docket

### Story 1.5: Reassign a Document's Attorney of Record

As the Attorney of Record or Office Manager,
I want to explicitly reassign a Document's Attorney of Record to another Firm member,
So that ownership can change hands deliberately instead of drifting.

**Acceptance Criteria:**

**Given** I'm the current Attorney of Record for a Document, or I'm the Office Manager
**When** I reassign it to another Firm member
**Then** the Document's Attorney of Record updates, and the change is an explicit, logged action distinct from any other edit

**Given** I'm a user without either role for a Document
**When** I attempt to reassign its Attorney of Record
**Then** I'm not permitted to do so

*(Added during UX design reconciliation — FR-15's "reassignment is an explicit action" consequence had no implementing story; EXPERIENCE.md specified the control, this story closes the gap flagged in the implementation readiness report.)*

## Epic 2: Workflow Board — Track Status From Draft to Filed

Users see and move documents through Draft → Reviewed → Needs Revision → Waiting on Signature → Filed/Sent, with reviewer attribution. **FRs:** FR-4, FR-5

### Story 2.1: View the Workflow Board

As a paralegal,
I want to see all Documents for my Matters grouped by Status,
So that I know at a glance what's drafted, reviewed, or sent.

**Acceptance Criteria:**

**Given** I have access to one or more Matters
**When** I open the workflow board
**Then** I see Documents grouped into columns: Draft, Reviewed, Needs Revision, Waiting on Client Signature, Filed/Sent

**Given** I don't have access to a Matter
**When** I view the board
**Then** none of that Matter's Documents are shown

### Story 2.2: Move a Document Between Statuses

As a paralegal,
I want to move a Document from one Status to another,
So that its status reflects reality as I make progress.

**Acceptance Criteria:**

**Given** a Document in "Draft"
**When** I move it to "Reviewed"
**Then** its Status updates and the change is visible to all users with Matter access

**Given** any Document
**When** its Status changes
**Then** the change only happens via explicit user action — never inferred from file edits, renames, or email

### Story 2.3: Record Reviewer on "Reviewed" Transition

As an attorney,
I want my name recorded when I mark a Document as Reviewed,
So that everyone can see who actually reviewed it.

**Acceptance Criteria:**

**Given** a Document in Draft
**When** a user moves it to "Reviewed"
**Then** they must select/confirm themselves as the reviewer

**Given** a Document is at or has passed "Reviewed"
**When** viewed on the board
**Then** it displays "Reviewed by {name}"

## Epic 3: Deadlines & Staleness — Never Miss a Deadline Silently

Attorneys set deadlines; the board visualizes aging; a stale item triggers an email alert after 3 days untouched. **FRs:** FR-6, FR-7, FR-8 · **NFRs:** NFR-1

### Story 3.1: Set a Deadline on a Document

As the Attorney of Record,
I want to set a deadline on a Document,
So that the firm knows when it's due.

**Acceptance Criteria:**

**Given** I'm the Attorney of Record for a Document
**When** I set or edit a Deadline date
**Then** it's saved and shown on the Document's card

### Story 3.2: See How Long a Document Has Been Stuck (Aging)

As a paralegal,
I want to see how long a Document has sat in its current Status,
So that I can spot ones at risk of slipping.

**Acceptance Criteria:**

**Given** a Document hasn't changed Status recently
**When** I view the board
**Then** its Aging (time in current Status) is visually indicated

**Given** a Document has been untouched for more than 3 days
**When** I view the board
**Then** it's visually distinguished from recently-updated Documents

### Story 3.3: Get a Stale Alert Email

As the Attorney of Record or Office Manager,
I want an email when a Document has been untouched for more than 3 days,
So that I find out before the deadline is missed.

**Acceptance Criteria:**

**Given** a Document's Aging exceeds 3 days
**When** the daily stale check runs
**Then** an email alert is sent to the Attorney of Record and the Office Manager

**Given** a Document has already triggered a stale alert
**When** it remains stale the following day
**Then** a duplicate alert is not sent for the same threshold crossing

**Given** the stale check
**When** it runs
**Then** it executes reliably on schedule regardless of whether any user has opened the app that day

## Epic 4: Delegated Approval — Keep Moving When the Attorney's Unreachable

Office Manager can approve & send on the attorney's behalf, with an audit trail. **FRs:** FR-9, FR-10

### Story 4.1: Delegated Approval Action

As the Office Manager,
I want to move a Document to Filed/Sent on behalf of the Attorney of Record,
So that a deadline isn't missed when the attorney is unreachable.

**Acceptance Criteria:**

**Given** I have the Office Manager role
**When** I use the delegated-approval action on a Document
**Then** it moves to Filed/Sent

**Given** the delegated-approval action is used
**When** the board displays the transition
**Then** it's shown distinctly from a standard attorney-initiated transition

### Story 4.2: Delegated-Approval Audit Trail

As the Attorney of Record,
I want to see a record of any delegated approval used on my Documents,
So that I know exactly what happened while I was unreachable.

**Acceptance Criteria:**

**Given** a delegated approval is used
**When** it's recorded
**Then** the log captures the actor, timestamp, and the Document/Matter it applied to

**Given** I'm the Attorney of Record for a Document
**When** I view its history
**Then** I can see any delegated-approval entries logged against it

## Epic 5: Client Visibility — Let Clients Check Status Without Calling

Clients get a scoped, read-only login to see their matter's document status and deadline. **FRs:** FR-11, FR-12, FR-13 · **NFRs:** NFR-3

### Story 5.1: Grant a Client Access to a Matter

As the Attorney of Record,
I want to grant a client login scoped to their Matter,
So that they can check status without calling.

**Acceptance Criteria:**

**Given** a Matter
**When** I grant client access to a specific client
**Then** that client can log in and see only that Matter

**Given** a client has not been granted access to a Matter
**When** they attempt to view it
**Then** it's not visible or accessible to them

### Story 5.2: Client Read-Only Status View

As a client,
I want to see my Matter's Document status, deadline, and who's responsible for it,
So that I know where things stand without calling the firm.

**Acceptance Criteria:**

**Given** I'm logged in as a client
**When** I view my Matter
**Then** I see each Document's Status, Deadline, Owner (Attorney of Record), Aging, and Blocked indicator — the same card data shown on the internal workflow board, minus Reviewed-by attribution

**Given** I'm logged in as a client
**When** I view a Document
**Then** I have no ability to change its Status or upload a file

### Story 5.3: Revoke Client Access

As the Attorney of Record or Office Manager,
I want to revoke a client's access to a Matter,
So that access can be corrected or ended when needed.

**Acceptance Criteria:**

**Given** a client currently has access to a Matter
**When** I revoke it
**Then** they immediately lose the ability to view that Matter

## Epic 6: Paper Document Tracking — Log Scanned Originals

Staff can log a paper original as a Scanned Document (who, when), and it behaves like any other Document on the board. **FRs:** FR-14

### Story 6.1: Log a Scanned Paper Document

As a paralegal,
I want to log a paper document as scanned,
So that it's tracked in Docket like any other Document.

**Acceptance Criteria:**

**Given** a paper document has been scanned
**When** I log it in Docket
**Then** it's recorded with a timestamp and who scanned it, linked to the scan file

**Given** a Scanned Document is logged
**When** viewed on the board
**Then** it behaves like any other Document — Status, Deadline, and Aging all apply
