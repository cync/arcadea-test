---
baseline_commit: NO_VCS
---

# Story 2.3: Record Reviewer on "Reviewed" Transition

Status: review

## Story

As an attorney,
I want my name recorded when I mark a Document as Reviewed,
so that everyone can see who actually reviewed it.

## Acceptance Criteria

1. Given a Document in Draft, When a user moves it to "Reviewed", Then they must select/confirm themselves as the reviewer. [Source: epics.md#Story-2.3]
2. Given a Document is at or has passed "Reviewed", When viewed on the board, Then it displays "Reviewed by {name}". [Source: epics.md#Story-2.3]

## Tasks / Subtasks

- [x] Task 1: `Document.reviewedByUserId` domain + schema (AC: #2) — **AD-3 names this field explicitly as an allowed denormalized cache**
  - [x] Add `reviewedByUserId: string | null` to `domain/Document.ts`.
  - [x] Add `reviewedByUserId String?` + `reviewedBy User? @relation("DocumentReviewedBy", fields: [reviewedByUserId], references: [id])` to `model Document` in `prisma/schema.prisma`; add the matching back-relation `documentsReviewed Document[] @relation("DocumentReviewedBy")` on `model User`. Nullable — a never-reviewed Document has no reviewer.
  - [x] New migration `prisma/migrations/<timestamp>_reviewed_by/migration.sql` (hand-written, no shadow DB, same as every prior migration) — `ALTER TABLE "documents" ADD COLUMN "reviewedByUserId" TEXT` + FK to `users` with `ON DELETE SET NULL` (matching `Matter.primaryAttorneyId`'s FK shape, not `RESTRICT` like `attorneyOfRecordId` — a reviewer leaving the directory shouldn't block deleting them, unlike the mandatory Attorney of Record).
  - [x] Run `npx prisma generate` after the schema change.
  - [x] **This is exactly the field AD-3's Rule names by example** ("`Document` may carry denormalized, transition-derived display fields for the board/card (`reviewedByUserId`, `statusChangedAt` per AD-7) — but `StatusTransition` is their only writer"). It is a **mutable, single-writer, current-value-only** cache, not an append-only history — a Document reviewed twice (e.g. Reviewed → Needs Revision → Draft → Reviewed again by someone else) shows only the *latest* reviewer here. Full reviewer history is only ever reconstructable from `AuditEntry` (Task 2) — this is a deliberate, architecture-sanctioned trade-off, not a gap to "fix" by adding history-tracking to `Document` itself.
  - [x] **Do not clear `reviewedByUserId` on a non-`REVIEWED` transition.** AC #2 says "at or has passed Reviewed" — once a Document has been reviewed, the attribution should keep showing even if it later moves to Needs Revision, Waiting on Signature, or Filed/Sent. Only a *new* `REVIEWED` transition overwrites the field (with the new reviewer); every other transition leaves it untouched.

- [x] Task 2: Extend `StatusTransition` for the Reviewed case (AC: #1, #2)
  - [x] **Read `application/StatusTransition.ts` and `app/api/documents/[id]/status/route.ts` in full before touching them** — this task extends Story 2.2's service and route, it does not replace them. Every non-`REVIEWED` transition must keep working exactly as Story 2.2 built it (no `AuditEntry`, no `reviewedByUserId` write).
  - [x] `StatusTransition`'s constructor gains a second dependency: `AuditEntryRepository` (interface already defined in `application/AttorneyReassignment.ts` — import and reuse it, the same cross-file interface-reuse precedent `AttorneyReassignment.ts` itself already set by importing `UserRepository` from `application/MatterOnboarding.ts`; do not redefine a second, parallel `AuditEntryRepository` shape).
  - [x] `StatusTransition.transition`'s input gains `firmId: string` (needed now to write the `AuditEntry`'s `firmId` — Story 2.2 correctly didn't need this since it wrote no audit row) and `actorId: string`, `reviewerId?: string`.
  - [x] Add `"VALIDATION_ERROR"` to `StatusTransitionError`'s `code` union (alongside the existing `"NOT_FOUND"`).
  - [x] Branch on `toStatus === "REVIEWED"` — **this is AC #1's actual enforcement point**: `reviewerId` must equal `actorId` (the confirming user must be the same person making the request — "select/confirm *themselves*," not assign an arbitrary reviewer) — mismatched or missing `reviewerId` throws `StatusTransitionError(VALIDATION_ERROR)`. On success: call `DocumentRepository.updateStatus(documentId, "REVIEWED", reviewerId)` (Task 3's extended signature) and `AuditEntryRepository.create({ firmId, documentId: document.id, matterId: document.matterId, actorId, action: "REVIEWED", reason: null })` — this is AD-6's third and final named action type (after reassignment in Story 1.5), completing AD-6's full binding list. For every other `toStatus`, behavior is byte-for-byte what Story 2.2 already built: `updateStatus(documentId, toStatus)`, no audit row, `reviewerId` ignored.

- [x] Task 3: Repository extension + API route (AC: #1, #2)
  - [x] Extend `DocumentRepository.updateStatus` (`application/DocumentDetection.ts`, `adapters/db/documentRepository.ts`) to accept an optional third parameter: `updateStatus(documentId: string, status: DocumentStatus, reviewedByUserId?: string): Promise<Document>`. When provided, include `reviewedByUserId` in the same `updateMany` `data` object as `status`/`statusChangedAt` — one atomic write, no second call. When omitted (every non-`REVIEWED` call site), behavior is unchanged from Story 2.2.
  - [x] Extend `POST /api/documents/:id/status` (`app/api/documents/[id]/status/route.ts`) to read an optional `reviewerId` from the body. When `status === "REVIEWED"`, require `reviewerId` to be present and a non-empty string at the route (structural validation, 400 `VALIDATION_ERROR` — same body-validation-at-the-route pattern as every prior route); the *semantic* self-match check (`reviewerId === session.userId`) happens in `StatusTransition.transition` (Task 2), not here — same route/service split as `AttorneyReassignment`'s FORBIDDEN check. Pass `firmId: session.firmId`, `actorId: session.userId`, `reviewerId` through to `transition()`. Map the new `VALIDATION_ERROR` code to 400 alongside the existing `NOT_FOUND → 404`.

- [x] Task 4: Tests (AC: #1, #2)
  - [x] Unit (extend `tests/unit/statusTransition.test.ts` — update its `StatusTransition` construction for the new `AuditEntryRepository` dependency and `transition()`'s new required fields, do not fork a second test file): moving to `REVIEWED` with `reviewerId === actorId` succeeds, writes `reviewedByUserId`, and calls `auditEntries.create` with `action: "REVIEWED"`; moving to `REVIEWED` with `reviewerId !== actorId` (or missing) throws `VALIDATION_ERROR` and calls neither `updateStatus` nor `auditEntries.create`; a non-`REVIEWED` transition (already covered by Story 2.2's existing tests) still writes no audit row and ignores `reviewerId` — re-verify this still holds after the extension, don't just assume it.
  - [x] Integration (extend `tests/integration/statusTransitionRoute.test.ts`, PGlite-backed): a Draft→Reviewed move with `reviewerId` equal to the caller's own id returns 200 with `reviewedByUserId` set, and a real `AuditEntry` row is persisted (`action: "REVIEWED"`, correct `documentId`/`matterId`/`actorId`); a Reviewed→Needs Revision→Draft→Reviewed-again-by-someone-else sequence ends with `reviewedByUserId` showing only the *latest* reviewer (AC #2's "at or has passed" — proves the field isn't cleared by the intermediate non-Reviewed moves, and proves the deliberate overwrite-on-re-review behavior from Task 1); a move to Reviewed with `reviewerId` missing or set to a different user's id returns 400; a move to Reviewed with `reviewerId` equal to the caller confirms the AC #1 "confirm yourself" path is genuinely enforced, not just accepted.

## Dev Notes

- **This story extends, not replaces, Story 2.2's `StatusTransition`/`POST /api/documents/:id/status`.** Read both files in full before editing (per Task 2's first bullet) — this is the exact scenario the create-story workflow's "read files being modified" discipline exists for, and Story 2.2's own Dev Notes flagged this as a known, deliberate follow-on rather than a surprise.
- **AD-6 is now fully exercised.** Story 1.5 (reassignment) wrote the first `AuditEntry` action type; this story adds the second (`"REVIEWED"`) — the third and last of AD-6's three named actions (`Delegated Approval`, Epic 4, remains). `AuditEntryRepository` (defined in `AttorneyReassignment.ts`) is reused as-is, no changes needed there.
- **`reviewedByUserId` is a mutable, single-writer, current-value-only cache — this is what the final architecture actually decided**, not what an earlier adversarial review draft *suggested* as a fix (that draft proposed banning any Document-level caching of audited state and forcing a read-time `AuditEntry` query instead). The **final, adopted** `ARCHITECTURE-SPINE.md` AD-3 text explicitly names `reviewedByUserId` as an allowed field with `StatusTransition` as its sole writer — follow the spine as written, not the superseded review draft. Don't try to "fix" this by building history-tracking onto `Document` that the spine doesn't ask for.
- **"Select/confirm themselves as the reviewer" is enforced as `reviewerId === actorId`, checked in the service, not defaulted server-side.** The route requires the client to explicitly submit `reviewerId`; silently defaulting it to the caller's own id without requiring the field would technically satisfy "recorded correctly" but not "must select/confirm" — the AC describes an explicit user action, same reasoning as Story 2.2's AC #2 ("never inferred").
- **No new role gating.** `POST /api/documents/:id/status` already restricts to staff roles (Story 2.2); this story doesn't change who can call it, only what's required in the body for one specific `toStatus` value.
- **Reuses:** `AuditEntryRepository`/`PrismaAuditEntryRepository` (Story 1.5, unchanged), the `updateMany`-then-`findFirst` repository-write shape, `tests/helpers/testDb.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/ARCHITECTURE-SPINE.md — AD-3 (`reviewedByUserId` named explicitly, single-writer rule), AD-6 (three named audit actions, now all three implemented across Stories 1.5/2.3/4.1)]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/reviews/review-adversarial.md — Finding 3 (superseded draft concern re: caching audited state; the final spine's resolution differs from this draft's suggested fix — follow the spine, noted above)]
- [Source: _bmad-output/implementation-artifacts/1-5, 2-2 — previous stories, patterns cited above]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `npx vitest run tests/unit/statusTransition.test.ts` before implementation — confirmed RED (2-arg constructor, no VALIDATION_ERROR code)
- `npx vitest run` — 19 files, 132 tests passed
- `npx tsc --noEmit` — clean
- `npx eslint .` — clean
- `npx next build` — succeeded; route list unchanged from Story 2.2 (this story extends an existing route, adds no new one)

### Completion Notes List

- Added `Document.reviewedByUserId` (nullable, `ON DELETE SET NULL` FK to `User`) — the exact field AD-3 names by example as an allowed denormalized, single-writer cache. New migration `20260808000000_reviewed_by`; ran `npx prisma generate`.
- Extended `application/StatusTransition.ts`: constructor now takes a second `AuditEntryRepository` dependency (imported from `AttorneyReassignment.ts`, reusing the existing interface — same cross-file reuse precedent that file itself set with `UserRepository`); `transition()` gained `firmId`, `actorId`, `reviewerId?`. A move to `REVIEWED` requires `reviewerId === actorId` (else `VALIDATION_ERROR`), then writes `reviewedByUserId` via the extended `updateStatus` and appends an `AuditEntry` with `action: "REVIEWED"` — AD-6's third and final named action type. Every non-`REVIEWED` transition is unchanged from Story 2.2 (verified by re-running and extending its existing tests, not just assuming).
- Deliberately did **not** clear `reviewedByUserId` on a subsequent non-`REVIEWED` transition — confirmed via an integration test that walks Reviewed → Needs Revision → Reviewed-again-by-someone-else and checks the intermediate value is retained, then overwritten only by the next `REVIEWED` transition.
- `POST /api/documents/:id/status` now requires `reviewerId` in the body when `status === "REVIEWED"` (structural check at the route); the semantic self-match check lives in the service, mirroring `AttorneyReassignment`'s route/service split.
- Updated `makeDoc()` test-fixture defaults across all five existing unit test files (`attorneyReassignment`, `documentDetection`, `documentViewer`, `statusTransition`, `workflowBoard`) with `reviewedByUserId: null` after the `Document` domain type changed — same recurring pattern as prior stories.
- Full verification suite green: `tsc --noEmit`, `vitest run` (132/132 across all 19 test files, no regressions), `eslint .`, `next build`.

### File List

- `domain/Document.ts` (modified — added `reviewedByUserId`)
- `prisma/schema.prisma` (modified — added `Document.reviewedByUserId` + `User.documentsReviewed` back-relation)
- `prisma/migrations/20260808000000_reviewed_by/migration.sql` (new)
- `generated/prisma/*` (regenerated via `npx prisma generate`)
- `application/StatusTransition.ts` (modified — added `AuditEntryRepository` dependency, `REVIEWED` branch, `VALIDATION_ERROR` code)
- `application/DocumentDetection.ts` (modified — extended `updateStatus` signature)
- `adapters/db/documentRepository.ts` (modified — extended `updateStatus` implementation)
- `app/api/documents/[id]/status/route.ts` (modified — `reviewerId` body field, `VALIDATION_ERROR` mapping)
- `tests/unit/statusTransition.test.ts` (modified — new constructor arg, new Reviewed-path test cases)
- `tests/integration/statusTransitionRoute.test.ts` (modified — real User fixtures, new Reviewed-path test cases)
- `tests/unit/attorneyReassignment.test.ts`, `tests/unit/documentDetection.test.ts`, `tests/unit/documentViewer.test.ts`, `tests/unit/workflowBoard.test.ts` (modified — `reviewedByUserId: null` added to `makeDoc()` defaults)

## Change Log

- 2026-08-05: Story 2.3 implemented — `Document.reviewedByUserId`, `StatusTransition` extended for the Reviewed case (reviewer self-confirmation + `AuditEntry`), route extended, unit + integration tests. Status set to `review`.
