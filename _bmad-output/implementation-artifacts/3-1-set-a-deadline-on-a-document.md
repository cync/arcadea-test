---
baseline_commit: NO_VCS
---

# Story 3.1: Set a Deadline on a Document

Status: review

## Story

As the Attorney of Record,
I want to set a deadline on a Document,
so that the firm knows when it's due.

## Acceptance Criteria

1. Given I'm the Attorney of Record for a Document, When I set or edit a Deadline date, Then it's saved and shown on the Document's card. [Source: epics.md#Story-3.1]

## Tasks / Subtasks

- [x] Task 1: `Document.deadline` domain + schema (AC: #1)
  - [x] Add `deadline: Date | null` to `domain/Document.ts`.
  - [x] Add `deadline DateTime?` to `model Document` in `prisma/schema.prisma` — nullable, no default (most Documents will never have one).
  - [x] New migration `prisma/migrations/<timestamp>_deadline/migration.sql` (hand-written, no shadow DB, same as every prior migration) — `ALTER TABLE "documents" ADD COLUMN "deadline" TIMESTAMP(3)`.
  - [x] Run `npx prisma generate` after the schema change.

- [x] Task 2: `DeadlineManagement` application service (AC: #1)
  - [x] New file `application/DeadlineManagement.ts` (parallel to `AttorneyReassignment.ts` — one file per bounded application concern).
  - [x] `DeadlineError` class with `code: "NOT_FOUND" | "FORBIDDEN"` (same pattern as every other application-service error class).
  - [x] `DeadlineManagement.setDeadline(input: { documentId: string; actorId: string; deadline: Date }): Promise<Document>`: loads the Document via `DocumentRepository.findById` — throws `DeadlineError(NOT_FOUND)` if missing/cross-Firm. Permission check is **document-instance-scoped, not role-scoped** (same reasoning as `AttorneyReassignment`'s FORBIDDEN check, Story 1.5): allowed iff `document.attorneyOfRecordId === input.actorId` — EXPERIENCE.md's Roles & Permissions table names this specifically as "Set/edit Deadline on **their own** Documents," and explicitly `[ASSUMPTION]`s that Office Manager does *not* get this control ("FR-6 names the Attorney of Record specifically and nothing else grants that control") — a looser check (e.g. "any staff member," or "anyone with role `ATTORNEY_OF_RECORD`" regardless of which Document) would be wrong on both counts. Anyone else → `DeadlineError(FORBIDDEN)`. On success, calls `DocumentRepository.setDeadline` (Task 3) and returns the updated Document.
  - [x] No date-range/future-date validation — the AC only requires the date is saved; nothing in epics.md, PRD, or EXPERIENCE.md constrains what dates are acceptable (a past deadline may legitimately represent a missed one worth recording). Don't invent a constraint that isn't asked for.

- [x] Task 3: Repository extension + API route (AC: #1)
  - [x] Add `setDeadline(documentId: string, deadline: Date): Promise<Document>` to `DocumentRepository` (`application/DocumentDetection.ts`) and `PrismaDocumentRepository` (`adapters/db/documentRepository.ts`) — `updateMany`-then-`findFirst`, same shape as `setAttorneyOfRecord`/`updateStatus`.
  - [x] `POST /api/documents/:id/deadline` (new route file `app/api/documents/[id]/deadline/route.ts`) — body `{ deadline: string }` (ISO-8601, parsed to a `Date`; reject with 400 `VALIDATION_ERROR` if missing or not a parseable date — `new Date(input)` producing `NaN` via `isNaN(date.getTime())`). **No static `ALLOWED_ROLES` gate** — same reasoning and same shape as `POST /api/documents/:id/attorney` (Story 1.5): `resolveSession` still requires a valid session to authenticate, but the FORBIDDEN-vs-not decision is delegated entirely to `DeadlineManagement.setDeadline`'s instance-level check (Task 2). Map `DeadlineError.code` to HTTP status: `NOT_FOUND → 404`, `FORBIDDEN → 403`.

- [x] Task 4: Tests (AC: #1)
  - [x] Unit: `DeadlineManagement.setDeadline` against fakes — the Document's current Attorney of Record can set/edit its Deadline; a different staff member (Paralegal, Office Manager, or a *different* Attorney of Record who doesn't own this Document) is rejected with `FORBIDDEN`; an unknown Document throws `NOT_FOUND`; editing an already-set Deadline overwrites it (the "or edit" half of the AC).
  - [x] Integration (PGlite-backed): `POST /api/documents/:id/deadline` end-to-end — 200 + persisted `deadline` for the owning Attorney of Record; a second call with a new date overwrites the first (edit path); 403 for a non-owning staff member including an Office Manager; 404 for a cross-Firm Document id; 400 for a missing/unparseable `deadline`; 401 with no session.

## Dev Notes

- **Permission is document-instance-scoped, matching Story 1.5's `AttorneyReassignment`, not Story 2.2/2.3's route-level `ALLOWED_ROLES` array.** This is the second story (after reassignment) where "am I *this Document's* Attorney of Record" can't be answered without loading the Document first — don't try to force it into a static role-array check.
- **Office Manager is explicitly excluded**, per EXPERIENCE.md's own `[ASSUMPTION]` note — this is the one place in the codebase so far where Office Manager, despite generally being the most-privileged staff role, does *not* inherit a capability. Don't default to "Office Manager can do everything staff can."
- **No schema constraint tying `deadline` to `attorneyOfRecordId`'s role** — nothing in this codebase enforces that a `User` assigned as `attorneyOfRecordId` actually has `role: "ATTORNEY_OF_RECORD"` (the same is already true of `Matter.primaryAttorneyId`, unchanged since Story 1.1/1.3). The permission check is purely "are you the id in `attorneyOfRecordId`," not "does your role say Attorney of Record" — consistent with how `AttorneyReassignment` already treats ownership.
- **No new role-gate route pattern needed** — reuses `POST /api/documents/:id/attorney`'s no-`ALLOWED_ROLES`, service-owns-FORBIDDEN shape verbatim.
- **Reuses:** the firmId-scoped-404 pattern, the `updateMany`-then-`findFirst` repository-write shape, `tests/helpers/testDb.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.1]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Docket-2026-08-05/EXPERIENCE.md — Roles & Permissions ("Attorney of Record... Set/edit Deadline on their own Documents (FR-6)"; `[ASSUMPTION]` Office Manager cannot set/edit Deadline)]
- [Source: _bmad-output/implementation-artifacts/1-5 — `AttorneyReassignment`, the instance-scoped-permission pattern this story reuses]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `npx vitest run tests/unit/deadlineManagement.test.ts` before implementation — confirmed RED (module not found)
- `npx vitest run` — 21 files, 146 tests passed
- `npx tsc --noEmit` — clean
- `npx eslint .` — clean
- `npx next build` — succeeded; `/api/documents/[id]/deadline` present in the route list as a dynamic route

### Completion Notes List

- Added `Document.deadline` (nullable `DateTime`, no default) — new migration `20260809000000_deadline`; ran `npx prisma generate`.
- `application/DeadlineManagement.ts` — permission is document-instance-scoped (`document.attorneyOfRecordId === actorId`), same pattern as `AttorneyReassignment` (Story 1.5), not a static role array. Office Manager is deliberately excluded per EXPERIENCE.md's own `[ASSUMPTION]` note — verified with a dedicated unit and integration test rather than just asserted in prose.
- No date-range/future-date validation added — not required by the AC or any planning artifact.
- `POST /api/documents/:id/deadline` has no static `ALLOWED_ROLES` gate, mirroring `POST /api/documents/:id/attorney`'s shape — session-only at the route, FORBIDDEN decided entirely by the service.
- Updated `makeDoc()` test-fixture defaults across all five existing unit test files with `deadline: null`, and added `setDeadline` mocks to the shared `DocumentRepository` fakes — same recurring pattern as prior stories.
- Full verification suite green: `tsc --noEmit`, `vitest run` (146/146 across all 21 test files, no regressions), `eslint .`, `next build`.

### File List

- `domain/Document.ts` (modified — added `deadline`)
- `prisma/schema.prisma` (modified — added `Document.deadline`)
- `prisma/migrations/20260809000000_deadline/migration.sql` (new)
- `generated/prisma/*` (regenerated via `npx prisma generate`)
- `application/DeadlineManagement.ts` (new)
- `application/DocumentDetection.ts` (modified — added `setDeadline` to `DocumentRepository` interface)
- `adapters/db/documentRepository.ts` (modified — added `setDeadline`)
- `app/api/documents/[id]/deadline/route.ts` (new)
- `tests/unit/deadlineManagement.test.ts` (new)
- `tests/integration/deadlineRoute.test.ts` (new)
- `tests/unit/attorneyReassignment.test.ts`, `tests/unit/documentDetection.test.ts`, `tests/unit/documentViewer.test.ts`, `tests/unit/statusTransition.test.ts`, `tests/unit/workflowBoard.test.ts` (modified — `deadline: null` added to `makeDoc()` defaults, `setDeadline` mock added)

## Change Log

- 2026-08-05: Story 3.1 implemented — `Document.deadline`, `DeadlineManagement` application service, `POST /api/documents/:id/deadline` route, unit + integration tests. Status set to `review`.
