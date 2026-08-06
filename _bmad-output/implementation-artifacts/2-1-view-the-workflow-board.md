---
baseline_commit: NO_VCS
---

# Story 2.1: View the Workflow Board

Status: review

## Story

As a paralegal,
I want to see all Documents for my Matters grouped by Status,
so that I know at a glance what's drafted, reviewed, or sent.

## Acceptance Criteria

1. Given I have access to one or more Matters, When I open the workflow board, Then I see Documents grouped into columns: Draft, Reviewed, Needs Revision, Waiting on Client Signature, Filed/Sent. [Source: epics.md#Story-2.1]
2. Given I don't have access to a Matter, When I view the board, Then none of that Matter's Documents are shown. [Source: epics.md#Story-2.1]

## Tasks / Subtasks

- [x] Task 1: `WorkflowBoard` application service (AC: #1, #2)
  - [x] New file `application/WorkflowBoard.ts` (parallel to `DocumentViewer.ts` — read-only application service, one file per bounded concern).
  - [x] `Board = Record<DocumentStatus, Document[]>` type, keyed by the five `DocumentStatus` values in column order (`DRAFT`, `REVIEWED`, `NEEDS_REVISION`, `WAITING_ON_CLIENT_SIGNATURE`, `FILED_SENT`).
  - [x] `WorkflowBoard.getBoard(): Promise<Board>` — calls `DocumentRepository.findAllForFirm()` (new method, Task 2), groups the results into the five columns by `status`. Every column key is always present, even empty (`[]`), so a caller never has to guard against a missing key.
  - [x] Within each column, sort by `statusChangedAt` ascending (the Document that has sat longest in its current Status appears first) — this is the one ordering signal already available (`Document.statusChangedAt`, AD-7, present since Story 1.3) and satisfies EXPERIENCE.md's "never alphabetically, never by Matter" floor. **Not the full "urgency + aging" sort EXPERIENCE.md describes** — that needs `Deadline` (Story 3.1, not yet built) to weigh urgency. Document this explicitly as an interim ordering, not a completed AC — Story 3.1/3.2 will need to revisit this sort once Deadline exists.

- [x] Task 2: Repository extension + API route (AC: #1, #2)
  - [x] Add `findAllForFirm(): Promise<Document[]>` to `DocumentRepository` (`application/DocumentDetection.ts`) and `PrismaDocumentRepository` (`adapters/db/documentRepository.ts`) — `client.document.findMany({})`; the firmId filter is injected automatically by `firmScopeExtension` (no explicit `where` needed, same as any other scoped `findMany` call). This is the method that makes AC #2 hold: a repository instance is always constructed bound to one `firmId` (AD-1), so a cross-Firm Document can never appear in the result — there is no "access to a Matter" concept beyond Firm membership anywhere else in this codebase (`GET /api/matters/:id`, `GET /api/documents/:id` both use the same firmId-is-the-access-boundary interpretation; Docket has no per-Matter staff ACL, only the future Client-scoped `ClientAccess` grant in Epic 5), so don't invent a finer-grained check here.
  - [x] `GET /api/board` (new route file `app/api/board/route.ts`) — staff roles only (Paralegal, Attorney of Record, Office Manager; Client excluded — same reasoning as every prior staff-only route, EXPERIENCE.md's Client Matter View is a separate, distinct surface in Epic 5, not this endpoint). Returns the `Board` object directly as JSON.

- [x] Task 3: Tests (AC: #1, #2)
  - [x] Unit: `WorkflowBoard.getBoard` against a fake `DocumentRepository` — groups Documents into all five status columns (including columns with zero Documents); sorts within a column by `statusChangedAt` ascending.
  - [x] Integration (PGlite-backed): `GET /api/board` end-to-end — Documents from the calling Firm appear in the correct column; a Document belonging to a different Firm never appears (AC #2, proven through the real firmId-scoped query, not just asserted); 401 with no session; 403 for a Client role.

## Dev Notes

- **This is the first read-only, whole-Firm listing endpoint** — every prior GET route (`/api/matters/:id`, `/api/documents/:id`) fetches a single record by id. `findAllForFirm()` is a new repository shape (no `where` beyond the auto-injected `firmId`), but uses the same `firmScopedClient`/`firmScopeExtension` machinery as everything else — no new AD-1 enforcement code needed, the allow-list already covers `findMany`.
- **"Access to a Matter" = Firm membership, nothing finer** — don't build a per-Matter staff assignment/ACL system that doesn't exist anywhere else in this codebase. `primaryAttorneyId`/`attorneyOfRecordId` are ownership fields, not access-control gates (any staff role in the Firm can already view any Matter/Document per Stories 1.1/1.4's existing role checks). The real "you can't see this" boundary in this story is the same one every prior story used: `firmId`.
- **No new schema this story.** `Document.status` and `Document.statusChangedAt` already exist (Story 1.3's migration); this story only reads them.
- **Sorting is intentionally partial** — see Task 1. Don't try to fabricate an "urgency" signal from data that doesn't exist yet (`Deadline` isn't added until Story 3.1). Get the grouping and the Firm-scoping right; leave the richer sort for when the data exists.
- **Reuses:** the firmId-scoped `DocumentRepository` pattern (Stories 1.3–1.5), the staff-only `ALLOWED_ROLES` route pattern (Stories 1.1/1.4), `tests/helpers/testDb.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/ARCHITECTURE-SPINE.md — AD-1 (firm scoping), AD-7 (`statusChangedAt` as the single Aging anchor, referenced here only for sort order — Aging itself is Story 3.2's deliverable)]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Docket-2026-08-05/EXPERIENCE.md — Information Architecture ("Workflow Board... grouped into five Status columns, sorted by urgency + aging within each column — never alphabetically, never by Matter")]
- [Source: _bmad-output/implementation-artifacts/1-1, 1-3, 1-4 — previous stories, patterns cited above]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `npx vitest run tests/unit/workflowBoard.test.ts` before implementation — confirmed RED (module not found)
- `npx vitest run` — 17 files, 116 tests passed
- `npx tsc --noEmit` — clean
- `npx eslint .` — clean
- `npx next build` — succeeded; `/api/board` present in the route list as a dynamic route

### Completion Notes List

- `application/WorkflowBoard.ts` — `getBoard()` groups all of the calling Firm's Documents into the five status columns (always all five keys present, even empty), sorted within each column by `statusChangedAt` ascending. Documented explicitly as an interim sort — full "urgency + aging" ordering needs `Deadline`, which doesn't exist until Story 3.1.
- Added `findAllForFirm()` to the shared `DocumentRepository` interface (`application/DocumentDetection.ts`) and `PrismaDocumentRepository` — a bare `findMany({})`, since `firmScopeExtension` injects the `firmId` filter automatically; no new AD-1 enforcement code needed.
- `GET /api/board` is staff-only, same `ALLOWED_ROLES` pattern as `/api/matters/:id` and `/api/documents/:id`; "access to a Matter" is interpreted as Firm membership only, consistent with every prior route (no per-Matter staff ACL exists anywhere in this codebase).
- Updated existing test fakes (`documentDetection.test.ts`, `documentViewer.test.ts`, `attorneyReassignment.test.ts`) with a `findAllForFirm` mock after the `DocumentRepository` interface changed — same recurring pattern as prior stories.
- Full verification suite green: `tsc --noEmit`, `vitest run` (116/116 across all 17 test files, no regressions), `eslint .`, `next build`.

### File List

- `application/WorkflowBoard.ts` (new)
- `application/DocumentDetection.ts` (modified — added `findAllForFirm` to `DocumentRepository` interface)
- `adapters/db/documentRepository.ts` (modified — added `findAllForFirm`)
- `app/api/board/route.ts` (new)
- `tests/unit/workflowBoard.test.ts` (new)
- `tests/integration/boardRoute.test.ts` (new)
- `tests/unit/documentDetection.test.ts` (modified — added `findAllForFirm` mock)
- `tests/unit/documentViewer.test.ts` (modified — added `findAllForFirm` mock)
- `tests/unit/attorneyReassignment.test.ts` (modified — added `findAllForFirm` mock)

## Change Log

- 2026-08-05: Story 2.1 implemented — `WorkflowBoard` application service, `GET /api/board` route, `DocumentRepository.findAllForFirm`, unit + integration tests. Status set to `review`.
