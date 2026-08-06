---
baseline_commit: NO_VCS
---

# Story 1.3: Auto-Detect New Documents from Drive

Status: review

## Story

As a paralegal,
I want a new file added to a Matter's Drive folder to automatically appear in Docket,
so that I don't have to manually add every document.

## Acceptance Criteria

1. Given a Matter's Drive folder is connected, When a new file appears in that folder, Then a Document record is created in Docket at "Draft" status within a defined polling interval, and the Document is assigned exactly one Attorney of Record at creation. [Source: epics.md#Story-1.3]
2. Given a Document already has an assigned Attorney of Record, When another user edits or moves the Document, Then the Attorney of Record does not change — reassignment is a separate, explicit action. [Source: epics.md#Story-1.3]
3. Given a file is placed outside the Matter's designated Drive folder, When Docket scans for new documents, Then that file is not detected or reconciled. [Source: epics.md#Story-1.3]

## Tasks / Subtasks

- [x] Task 0: Minimal `User` model + `Matter.primaryAttorneyId` (retroactive gap, blocks AC #1) (AC: #1)
  - [x] Real gap, addressed directly, not worked around.
  - [x] Added a minimal `User` model, Firm-scoped, matching `app/api/_lib/session.ts`'s `Role` (moved `Role`'s canonical definition to `domain/User.ts` — domain must not depend on the API layer, so `session.ts` now re-exports it instead of owning it).
  - [x] Added `primaryAttorneyId` (nullable FK to `User`) to `Matter`; `MatterOnboarding.setPrimaryAttorney({matterId, firmId, attorneyId})` validates the attorney belongs to the Firm.
  - [x] `User` joins `FIRM_SCOPED_MODELS`.
  - [x] Migration. `prisma/seed.ts` now also seeds one `User` (`ATTORNEY_OF_RECORD`).
- [x] Task 1: `Document` model (AC: #1, #2, #3)
  - [x] Added `Document` model, Firm-scoped, with the full 5-value status enum, `attorneyOfRecordId` required and write-once, `statusChangedAt` (AD-7 Aging anchor) defaulted at creation.
  - [x] `Document` joins `FIRM_SCOPED_MODELS`.
  - [x] Migration.
- [x] Task 2: Resolved the deferred polling-mechanism decision (AC: #1, #3)
  - [x] Polling (not webhooks), 5-minute interval — both `[ASSUMPTION]`, reasoning in Dev Notes.
  - [x] No real scheduler wired up in this environment — callable service (Task 3) + manual-trigger route (Task 4) built instead; flagged in Completion Notes.
- [x] Task 3: `DocumentDetection` application service (AC: #1, #2, #3)
  - [x] `application/DocumentDetection.ts` — `scanMatter(matter, accessToken)`: documented skip reasons (`no-drive-folder`/`no-primary-attorney`, not a silent no-op), `since`-cursor via `findLatestForMatter`, defensive de-dupe by `driveFileId`, creates at `DRAFT` owned by the Matter's `primaryAttorneyId`.
  - [x] The Firm-by-Firm/Matter-by-Matter orchestration (`scanAllConnectedMatters`) lives in `jobs/scanDocuments.ts`, not inside `DocumentDetection` itself — `DocumentDetection` stays firm-scoped (constructed with one firm-bound repository, same pattern as every other application service); a service that looped across Firms internally couldn't hold a single scoped repository. The job module constructs a fresh scoped `DocumentDetection` per target instead.
  - [x] AC #3 holds by construction (`listNewFiles` only ever called with the Matter's own `driveFolderId`) — verified directly by a test asserting the exact call arguments, not just absence of a bug.
  - [x] AC #2 needs no new code, per plan — verified by a test that documents the invariant.
- [x] Task 4: API route + repository (AC: #1)
  - [x] `adapters/db/documentRepository.ts` — `PrismaDocumentRepository`, same per-request-firmId-bound pattern as prior repositories.
  - [x] `POST /api/jobs/scan-documents` — no auth gate, flagged as a real security gap in Completion Notes (not shipped as if it were fine).
  - [x] One more piece the plan didn't fully anticipate: `scanAllConnectedMatters`'s Firm-enumeration step is inherently cross-Firm (it has to find out which Firms exist before any Firm-scoped work can start) — added `systemClient()` to `adapters/db/prisma.ts`, documented as the one legitimate exception to "always go through `firmScopedClient`," used only for `adapters/db/scanTargetsRepository.ts`'s Firm-level enumeration, never for querying a `FIRM_SCOPED_MODELS` entity directly.
- [x] Task 5: Tests (AC: #1, #2, #3)
  - [x] Unit: `DocumentDetection.scanMatter` — all specified cases plus the AC #3 call-argument assertion and a multi-file-in-one-scan case.
  - [x] Unit: `MatterOnboarding.setPrimaryAttorney` — all specified cases.
  - [x] Integration (PGlite-backed, Drive faked): scan creates a correctly-scoped/owned `Document`; re-scan doesn't duplicate; `listScanTargets`/`scanAllConnectedMatters` covered directly (Firm enumeration, revoked-connection exclusion, no-folder exclusion).
  - [x] Integration/route: `POST /api/jobs/scan-documents` end-to-end, including the empty-results case.

## Dev Notes

- **This story adds real new scope beyond its literal AC text** (`User`, `Matter.primaryAttorneyId`) because the AC is unsatisfiable without them — not because they're nice-to-haves. Both are called out explicitly in Task 0 rather than folded in quietly.
- **`User` is a directory, not an auth system.** No password, no login, no session issuance — `app/api/_lib/session.ts`'s header-based stopgap still isn't validated against it. That gap (Story 1.1's Open Question) is still open; this story only gives the *data* a real Attorney of Record can point to.
- **Reuses established patterns directly:** `firmScopeExtension`'s allow-list (add `User` and `Document`, following the same reasoning as Story 1.2 adding `DriveConnection`), the per-request-firmId-bound repository pattern, `tests/helpers/testDb.ts` for PGlite migrations (this story adds a third migration file — the helper already applies every migration in the directory, so nothing extra to wire there), and the `DriveConnector` port from Story 1.2 (`listNewFiles`, implemented then, has zero test coverage until now — this is that coverage).
- **AD-7's `statusChangedAt` field** (the Aging anchor, per ARCHITECTURE-SPINE.md) is written here for the first time — every `Document` gets one at creation. Epic 3 (Aging/Stale Alert) reads it; nothing before Epic 2 ever updates it after creation, which is correct — a `Document` sitting untouched since its detection *is* aging, correctly, from the moment it's found.
- **Status enum:** include all five values (`DRAFT`, `REVIEWED`, `NEEDS_REVISION`, `WAITING_ON_CLIENT_SIGNATURE`, `FILED_SENT`) now even though only `DRAFT` is reachable until Epic 2 builds the transition service (AD-3) — avoids a schema migration later just to add enum values Epic 2 will need on day one.
- **Two `[ASSUMPTION]` tags in Task 2 are real commitments, not filler**, resolving ARCHITECTURE-SPINE.md's own Deferred item for this exact story: polling (not webhooks) at a 5-minute interval. Flag both for confirmation the way Story 1.2 flagged its MCP-vs-custom-API resolution.
- **Task 4's unauthenticated route is a known, deliberately-flagged gap**, not an oversight — don't let it read as "this is fine" in Completion Notes.
- **IDs/dates/error envelope/testing patterns:** identical conventions to Stories 1.1–1.2.

### Previous Story Intelligence (from 1-1 and 1-2)

- `firmScopeExtension`'s allow-list rejects `findUnique`/`update`/`delete`/`upsert` — use `findFirst`/`updateMany`/`create` throughout, as established.
- Extensionless relative imports only (`from "./prisma"`) — the `.js`-extension convention breaks under Turbopack even though `tsc`/Vitest/`tsx` tolerate it.
- Prisma migrations still can't be generated via `prisma migrate diff` against a live/shadow DB in this environment — hand-write `migration.sql` matching Prisma's generated-SQL conventions, verified by the PGlite integration tests actually running against it.
- `tests/helpers/testDb.ts` applies every migration file automatically — just add the new migration directory, no test file needs manual updating this time (unlike Story 1.2, which broke Story 1.1's tests before this helper existed).
- Story 1.2 resolved one architecture Deferred item (Drive adapter choice) with reasoning in Dev Notes and a flag for human confirmation; this story does the same for the polling-mechanism Deferred item. Consistent pattern — keep using it when a story hits another one.

### Project Structure Notes

```
docket/
  application/DocumentDetection.ts        # new
  application/MatterOnboarding.ts         # extended — setPrimaryAttorney
  adapters/db/documentRepository.ts       # new
  adapters/db/firmScopeExtension.ts       # extended — FIRM_SCOPED_MODELS += User, Document
  domain/Document.ts                      # new
  domain/User.ts                          # new
  app/api/jobs/scan-documents/route.ts    # new
  prisma/schema.prisma                    # extended — User, Document models, Matter.primaryAttorneyId
  prisma/seed.ts                          # extended — seed one User
```

No conflicts — `MatterOnboarding.ts` and `firmScopeExtension.ts` are extended again, following the same pattern Story 1.2 used to extend Story 1.1's files.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/ARCHITECTURE-SPINE.md — AD-2 (DriveConnector), AD-3/AD-7 (statusChangedAt, single Aging anchor), Deferred ("New-document detection mechanism and polling cadence for FR-2")]
- [Source: _bmad-output/planning-artifacts/prds/prd-Docket-2026-08-04/prd.md — FR-2, FR-15, Glossary (Document, Status)]
- [Source: _bmad-output/implementation-artifacts/1-1-create-a-matter.md, 1-2-connect-google-drive-to-a-matter.md — previous stories, patterns above]

## Open Questions (not blockers, flagged for the backlog)

1. Polling interval (5 minutes, `[ASSUMPTION]`) and mechanism (polling, not webhooks) — real product/ops decisions made here by necessity, worth explicit confirmation.
2. `POST /api/jobs/scan-documents` has no auth gate — flagged as a real gap needing a follow-up (shared-secret header, or a real scheduler that never exposes an HTTP trigger at all).
3. `User` is a directory only — the Story 1.1 "no real authentication" gap is now touched by two stories (session headers AND, now, Attorney-of-Record assignment) without being resolved. Worth prioritizing before Epic 5 (Client Access) as previously flagged.
4. Should `Matter.primaryAttorneyId` have been required at Matter creation (Story 1.1) rather than optional-then-set-later? Left optional here to avoid retroactively changing Story 1.1's shipped API; worth a product call on whether Matter creation should require it going forward.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **`Role`'s canonical home moved from `app/api/_lib/session.ts` to `domain/User.ts`.** `User.role` needed the same type `Session.role` already used; importing it the naive direction (`domain/User.ts` importing from `app/api/_lib/session.ts`) would have made the domain layer depend on the API layer, which the architecture's hexagonal paradigm forbids. Moved the type to domain, `session.ts` now re-exports it — no call site changed.
- **`systemClient()` added to `adapters/db/prisma.ts`.** The job's Firm-enumeration step is inherently cross-Firm (there's no firmId to scope by until you know which Firms have connections) — documented as the one deliberate exception to "always go through `firmScopedClient`," restricted to `Firm` and its relations navigated from a specific Firm row.
- **Prisma migration hand-written again** (`prisma migrate diff --from-migrations` still needs a shadow DB connection this environment doesn't have) — verified by every PGlite integration test actually applying it successfully.
- **`tests/helpers/testDb.ts` paid for itself this time** — applies every migration directory automatically, so this story's third migration file needed zero test-file updates (unlike Story 1.2, which broke Story 1.1's tests before that helper existed).

### Completion Notes List

- All 6 tasks (0–5) completed. AC #1–#3 all satisfied and tested, including AC #3 by construction (verified with a call-argument assertion, not just absence of a counterexample).
- 85 tests passing (20 new for this story). `tsc --noEmit`, `eslint .`, and `next build` all pass cleanly.
- **Real scope beyond the literal AC text, addressed directly (Task 0):** `User` model and `Matter.primaryAttorneyId` — AC #1's "assigned exactly one Attorney of Record" was unsatisfiable without a real entity to assign. This is the second story in a row to hit Story 1.1's "no real authentication" gap from a different angle (1.1 hit it for API sessions, this one for who Documents get owned by) — still open, now touched twice, worth prioritizing per the Story 1.1/1.2 Open Questions before Epic 5.
- **Known gap, not fixed here:** `POST /api/jobs/scan-documents` has no auth gate. Deliberately flagged, not silently shipped — needs a shared-secret header or a real scheduler that never exposes an HTTP trigger before this goes near production.
- **Known gap, not fixed here (environment limitation, same category as Stories 1.1/1.2):** no real Google Drive folder or files exist to poll against — `listNewFiles`'s real implementation (written in Story 1.2) has still never run against actual Drive data, only the mocked SDK. The detection *logic* is fully tested against the mock's documented response shape.
- Two `[ASSUMPTION]` tags (polling over webhooks, 5-minute interval) resolve ARCHITECTURE-SPINE.md's own Deferred item for this story — same treatment as Story 1.2's Drive-adapter-choice resolution.

### File List

**Schema / migrations:**
- `prisma/schema.prisma` (modified — `User` model, `Document` model, `DocumentStatus` enum, `Matter.primaryAttorneyId`)
- `prisma/migrations/20260806000000_document_and_user/migration.sql`
- `prisma/seed.ts` (modified — seeds one `User`)

**Domain / application / adapters:**
- `domain/User.ts` (new — also now canonical home of `Role`)
- `domain/Document.ts` (new)
- `domain/Matter.ts` (modified — `primaryAttorneyId`)
- `application/DocumentDetection.ts` (new)
- `application/MatterOnboarding.ts` (modified — `setPrimaryAttorney`, `UserRepository`)
- `adapters/db/documentRepository.ts` (new)
- `adapters/db/userRepository.ts` (new)
- `adapters/db/scanTargetsRepository.ts` (new)
- `adapters/db/matterRepository.ts` (modified — `setPrimaryAttorney`)
- `adapters/db/firmScopeExtension.ts` (modified — `User`, `Document` added to `FIRM_SCOPED_MODELS`)
- `adapters/db/prisma.ts` (modified — `systemClient()`)
- `app/api/_lib/session.ts` (modified — `Role` re-exported from `domain/User.ts`)

**Jobs / API (driving adapters):**
- `jobs/scanDocuments.ts` (new)
- `app/api/jobs/scan-documents/route.ts` (new)

**Tests:**
- `tests/unit/documentDetection.test.ts`
- `tests/unit/matterOnboarding.test.ts` (modified — `setPrimaryAttorney` tests, `makeMatter`/`makeRepo` helpers extended)
- `tests/integration/documentDetection.test.ts`
- `tests/integration/scanDocumentsRoute.test.ts`

## Change Log

- 2026-08-06 — Initial implementation. `User` (Firm-member directory) and `Document` schema + migration, `DocumentDetection` application service resolving ARCHITECTURE-SPINE.md's deferred polling-mechanism decision (polling, 5-minute interval), `jobs/scanDocuments.ts` job orchestration with a new `systemClient()` exception for legitimate cross-Firm enumeration, a manually-triggerable `POST /api/jobs/scan-documents` route (flagged as needing an auth gate before production), and 20 new tests (85 total, all passing). Status → review.
