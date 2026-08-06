---
baseline_commit: NO_VCS
---

# Story 2.2: Move a Document Between Statuses

Status: review

## Story

As a paralegal,
I want to move a Document from one Status to another,
so that its status reflects reality as I make progress.

## Acceptance Criteria

1. Given a Document in "Draft", When I move it to "Reviewed", Then its Status updates and the change is visible to all users with Matter access. [Source: epics.md#Story-2.2]
2. Given any Document, When its Status changes, Then the change only happens via explicit user action — never inferred from file edits, renames, or email. [Source: epics.md#Story-2.2]

## Tasks / Subtasks

- [x] Task 1: `StatusTransition` application service (AC: #1, #2) — **the single-owner service AD-3 names directly**
  - [x] New file `application/StatusTransition.ts`. This is the first story to use `StatusTransition` — the exact name AD-3/ARCHITECTURE-SPINE.md's directory sketch (`application/ StatusTransition, DelegatedApproval, MatterOnboarding, StaleCheck`) already commits to, unlike `WorkflowBoard`/`DocumentViewer` which this codebase invented on its own.
  - [x] `StatusTransitionError` class with `code: "NOT_FOUND"` (same pattern as every other application-service error class — `ReassignmentError`, `DriveFolderLinkError`).
  - [x] `StatusTransition.transition(input: { documentId: string; toStatus: DocumentStatus }): Promise<Document>`: loads the Document via `DocumentRepository.findById` (firmId-scoped `findFirst`, existing) — throws `StatusTransitionError(NOT_FOUND)` if missing/cross-Firm. Otherwise calls the new `DocumentRepository.updateStatus` (Task 2) and returns the updated Document. No `firmId` parameter on `transition()` — the repository is already Firm-bound at construction (same minimal shape as `WorkflowBoard.getBoard()`, which took no params for the same reason); there's no second repository here needing a raw `firmId` the way `AttorneyReassignment`/`DocumentViewer` needed one.
  - [x] **No `AuditEntry` write in this story.** AD-6 requires an audit row only for three named actions — Delegated Approval, Reviewed-by, reassignment — not for an ordinary transition. AD-7 does require `statusChangedAt` to update on *every* transition (Task 2 covers this) — don't conflate the two: `statusChangedAt` always updates, `AuditEntry` only sometimes (starting with Story 2.3's Reviewed-by case).
  - [x] **No enforced linear order, no validation of `toStatus` against the current status.** Per epics AC #2 and EXPERIENCE.md ("No enforced linear order — any Status may move to any other Status via explicit action"), any of the five statuses may transition to any other. Don't add a state-machine/adjacency check that isn't asked for.
  - [x] **Known, deliberate follow-on (do not build it now):** Story 2.3 (next) extends this exact service to add Reviewed-by confirmation and the matching `AuditEntry` write for the `REVIEWED` case specifically. Keep `transition()`'s signature minimal to this story's own two ACs — re-read this file before extending it in 2.3 rather than guessing its future shape here.

- [x] Task 2: Repository extension + API route (AC: #1, #2)
  - [x] Add `updateStatus(documentId: string, status: DocumentStatus): Promise<Document>` to `DocumentRepository` (`application/DocumentDetection.ts`) and `PrismaDocumentRepository` (`adapters/db/documentRepository.ts`) — `updateMany({ where: { id: documentId }, data: { status, statusChangedAt: new Date() } })` then `findFirst`, same `updateMany`-then-`findFirst` shape as `setAttorneyOfRecord`/`setPrimaryAttorney`. Writing `status` and `statusChangedAt` in the same `updateMany` call satisfies AD-7 ("written only by StatusTransition, in the same transaction as the status change") — a single-row `updateMany` is inherently atomic, no explicit `$transaction` needed.
  - [x] `POST /api/documents/:id/status` (new route file `app/api/documents/[id]/status/route.ts`, sibling to `app/api/documents/[id]/route.ts` and `.../attorney/route.ts`) — body `{ status: DocumentStatus }`. Staff roles only (Paralegal, Attorney of Record, Office Manager — EXPERIENCE.md's Roles & Permissions table: "Paralegal... move Status", inherited by the two rows above it; Client explicitly "Cannot change Status"). Validate `status` is one of the five literal `DocumentStatus` values at the route (400 `VALIDATION_ERROR` otherwise, same body-validation-at-the-route pattern as `POST /api/matters/:id/drive-folder`'s `folder` field) — `StatusTransitionError(NOT_FOUND) → 404`.

- [x] Task 3: Tests (AC: #1, #2)
  - [x] Unit: `StatusTransition.transition` against a fake `DocumentRepository` — a Draft→Reviewed transition calls `updateStatus` with the new status and returns the updated Document; an arbitrary Status→Status transition succeeds (proves "no enforced linear order," AC #2's other half); an unknown Document throws `NOT_FOUND`.
  - [x] Integration (PGlite-backed): `POST /api/documents/:id/status` end-to-end — 200 + updated `status` and a newer `statusChangedAt` than before the call; 404 for a cross-Firm Document id; 400 for an invalid/missing `status` value; 403 for a Client role; 401 with no session.

## Dev Notes

- **This is the first story to name the `StatusTransition` service the architecture spine already committed to** (`ARCHITECTURE-SPINE.md`'s directory sketch lists it explicitly, and AD-3 binds it by name). Story 2.3 and, later, Epic 4's `DelegatedApproval` both call into this same service rather than writing `Document.status` independently — AD-3's whole point. Don't let this story's naming or shape make that extension awkward later, but don't pre-build the extension either (see Task 1's last bullet).
- **AD-6 vs. AD-7 is the one easy mistake here.** AD-7 (Aging anchor) applies to *every* transition — this story's own `updateStatus` must always bump `statusChangedAt`. AD-6 (audit trail) applies to only three named action types, none of which this story produces. Getting this backwards (e.g. skipping `statusChangedAt` because "no audit is needed") breaks Story 3.2's Aging feature before it's even built.
- **No status adjacency/state-machine validation** — confirmed twice, in the epics AC and independently in EXPERIENCE.md's Interaction Primitives ("Any other Status-to-Status move... No enforced linear order"). The one exception EXPERIENCE.md does call out — a soft, non-blocking *warn* when moving to Filed/Sent without a prior Reviewed step — is a UI-level inline-confirm interaction ("Continue completes the move, Cancel returns the card"), not a backend rule; this codebase has no UI layer yet (every story so far is API-only), so there is nothing for this story to enforce or even warn about server-side.
- **Reuses:** the firmId-scoped-404 pattern (`DocumentRepository.findById`, Stories 1.4/1.5), the `updateMany`-then-`findFirst` repository-write shape (`matterRepository.ts`, `documentRepository.ts`'s `setAttorneyOfRecord`), the staff-only `ALLOWED_ROLES` route pattern, `tests/helpers/testDb.ts`.
- **No schema change this story.** `Document.status` and `Document.statusChangedAt` already exist (Story 1.3's migration).

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/ARCHITECTURE-SPINE.md — AD-3 (StatusTransition is the single owner), AD-6 (AuditEntry only for 3 named actions), AD-7 (statusChangedAt updates on every transition)]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Docket-2026-08-05/EXPERIENCE.md — Roles & Permissions (staff can move Status, Client cannot), Interaction Primitives ("No enforced linear order"), State Patterns (Filed/Sent warn-not-block is a UI concern)]
- [Source: _bmad-output/implementation-artifacts/1-1, 1-4, 1-5, 2-1 — previous stories, patterns cited above]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `npx vitest run tests/unit/statusTransition.test.ts` before implementation — confirmed RED (module not found)
- `npx vitest run` — 19 files, 126 tests passed
- `npx tsc --noEmit` — clean
- `npx eslint .` — clean
- `npx next build` — succeeded; `/api/documents/[id]/status` present in the route list as a dynamic route

### Completion Notes List

- `application/StatusTransition.ts` — first story to use the `StatusTransition` name the architecture spine already committed to. `transition()` takes no `firmId` (repository is already Firm-bound); no `AuditEntry` write (ordinary transitions aren't one of AD-6's three named actions); no adjacency/state-machine check (any Status may move to any other, confirmed by both the epics AC and EXPERIENCE.md).
- `DocumentRepository.updateStatus` writes `status` and `statusChangedAt` in the same `updateMany` call, satisfying AD-7's "same transaction as the status change" — a single-row `updateMany` is inherently atomic.
- `POST /api/documents/:id/status` validates the `status` body field against the five literal `DocumentStatus` values at the route (400 otherwise), same pattern as the `folder` field in `POST /api/matters/:id/drive-folder`.
- Left an explicit, deliberate follow-on note in the story file and in `StatusTransition.ts`'s own comment: Story 2.3 will extend this same service for the Reviewed-by case (confirmation + `AuditEntry`) rather than writing a parallel path.
- Updated existing test fakes (`documentDetection.test.ts`, `documentViewer.test.ts`, `attorneyReassignment.test.ts`, `workflowBoard.test.ts`) with an `updateStatus` mock after the `DocumentRepository` interface changed — same recurring pattern as prior stories.
- Full verification suite green: `tsc --noEmit`, `vitest run` (126/126 across all 19 test files, no regressions), `eslint .`, `next build`.

### File List

- `application/StatusTransition.ts` (new)
- `application/DocumentDetection.ts` (modified — added `updateStatus` to `DocumentRepository` interface)
- `adapters/db/documentRepository.ts` (modified — added `updateStatus`)
- `app/api/documents/[id]/status/route.ts` (new)
- `tests/unit/statusTransition.test.ts` (new)
- `tests/integration/statusTransitionRoute.test.ts` (new)
- `tests/unit/documentDetection.test.ts` (modified — added `updateStatus` mock)
- `tests/unit/documentViewer.test.ts` (modified — added `updateStatus` mock)
- `tests/unit/attorneyReassignment.test.ts` (modified — added `updateStatus` mock)
- `tests/unit/workflowBoard.test.ts` (modified — added `updateStatus` mock)

## Change Log

- 2026-08-05: Story 2.2 implemented — `StatusTransition` application service, `POST /api/documents/:id/status` route, `DocumentRepository.updateStatus`, unit + integration tests. Status set to `review`.
