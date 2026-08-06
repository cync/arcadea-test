---
baseline_commit: NO_VCS
---

# Story 1.5: Reassign a Document's Attorney of Record

Status: review

## Story

As the Attorney of Record or Office Manager,
I want to explicitly reassign a Document's Attorney of Record to another Firm member,
so that ownership can change hands deliberately instead of drifting.

## Acceptance Criteria

1. Given I'm the current Attorney of Record for a Document, or I'm the Office Manager, When I reassign it to another Firm member, Then the Document's Attorney of Record updates, and the change is an explicit, logged action distinct from any other edit. [Source: epics.md#Story-1.5]
2. Given I'm a user without either role for a Document, When I attempt to reassign its Attorney of Record, Then I'm not permitted to do so. [Source: epics.md#Story-1.5]

*(This story closes a gap flagged in the implementation readiness report: FR-15's "reassignment is an explicit action" consequence had no implementing story until UX design reconciliation added it.)*

## Tasks / Subtasks

- [x] Task 1: `AuditEntry` domain + schema (AC: #1) — **first story to need this table; AD-6 binds it, Story 4.2 will reuse it**
  - [x] `domain/AuditEntry.ts` — `{ id, firmId, documentId, matterId, actorId, action, reason: string | null, timestamp }`. `action` is a plain `string` (not a Prisma enum) so future stories (2.3 Reviewed-by, 4.2 Delegated Approval) can add new action values without a schema migration — this story only ever writes `"ATTORNEY_REASSIGNED"`.
  - [x] Add `model AuditEntry` to `prisma/schema.prisma`: `id`, `firmId`, `documentId`, `matterId`, `actorId`, `action String`, `reason String?`, `timestamp DateTime @default(now())`. No `updatedAt` — AD-6 requires insert-only, no update/delete path. Add `@@index([firmId])` (AD-1 pattern) and `@@index([documentId])` (AD-6 adversarial-review Finding 2: a cross-cutting audit view needs to query by document later).
  - [x] New migration `prisma/migrations/<timestamp>_audit_entry/migration.sql`, hand-written (no shadow DB available, same as every prior migration) — `CREATE TABLE audit_entries (...)` with FKs to `documents`/`matters`/`firms`, matching the existing migrations' style exactly (see `20260806000000_document_and_user/migration.sql`).
  - [x] Add `"AuditEntry"` to `FIRM_SCOPED_MODELS` in `adapters/db/firmScopeExtension.ts` — it's Firm-owned data (AD-1) like everything else. Only `create` (this story) is exercised; `findMany` is already allow-listed generically so a later history view (Story 4.2) needs no extension change.
  - [x] `tests/helpers/testDb.ts` requires no change — it already applies every migration directory in sorted order (Story 1.2/1.3 lesson).

- [x] Task 2: `AttorneyReassignment` application service (AC: #1, #2)
  - [x] New file `application/AttorneyReassignment.ts` (parallel to `DocumentViewer.ts`/`DocumentDetection.ts` — one file per bounded application concern, not folded into an existing service).
  - [x] `AuditEntryRepository` interface: `create(input: { firmId, documentId, matterId, actorId, action, reason }): Promise<AuditEntry>`.
  - [x] `ReassignmentError` class with `code: "NOT_FOUND" | "VALIDATION_ERROR" | "FORBIDDEN"` (same pattern as `DriveFolderLinkError` in `MatterOnboarding.ts`).
  - [x] `AttorneyReassignment.reassign(input: { documentId, firmId, actorId, actorRole, newAttorneyId, reason? }): Promise<Document>`:
    1. Load the Document via `DocumentRepository.findById` (existing, firmId-scoped `findFirst`) — throw `ReassignmentError(NOT_FOUND)` if missing/cross-Firm (mirrors every other story's cross-Firm-404 pattern).
    2. Permission check — **AC #2's core logic**: allowed iff `document.attorneyOfRecordId === input.actorId` (the *current* Attorney of Record, regardless of their `role` string) OR `input.actorRole === "OFFICE_MANAGER"`. Anyone else (including a *different* Attorney of Record who isn't this Document's owner) → `ReassignmentError(FORBIDDEN)`. Do not use a static role allow-list here — the permission is document-instance-scoped, not role-scoped, which is why this can't reuse the `ALLOWED_ROLES` array pattern from Stories 1.1/1.4.
    3. Validate `newAttorneyId` resolves to a `User` in the calling Firm via `UserRepository.findById` (same validation `MatterOnboarding.setPrimaryAttorney` already does) → `ReassignmentError(VALIDATION_ERROR)` if not found or cross-Firm. No role restriction on the target (epics AC says "another Firm member," not "another Attorney of Record" — don't invent a stricter rule than what's specified).
    4. Call `DocumentRepository.setAttorneyOfRecord(documentId, newAttorneyId)` to update the Document, then `AuditEntryRepository.create(...)` with `action: "ATTORNEY_REASSIGNED"` — **this is the "explicit, logged action distinct from any other edit" AC #1 requires**. These are two separate repository calls (not a single Prisma transaction) — acceptable here because, unlike AD-3's `StatusTransition`/`AuditEntry` pairing (which composes across Epic 2/4 call sites and therefore needs one atomic boundary), this is a single, self-contained service with no other caller; note this as a documented scope decision in Completion Notes, not silently.
    5. Return the updated `Document`.

- [x] Task 3: Repository extension + API route (AC: #1, #2)
  - [x] Add `setAttorneyOfRecord(documentId, attorneyId): Promise<Document>` to `DocumentRepository` (`application/DocumentDetection.ts`) and `PrismaDocumentRepository` (`adapters/db/documentRepository.ts`) — `updateMany` then `findFirst`, exact same shape as `PrismaMatterRepository.setPrimaryAttorney` (`adapters/db/matterRepository.ts:53-61`).
  - [x] New `adapters/db/auditEntryRepository.ts` — `PrismaAuditEntryRepository implements AuditEntryRepository`, constructed with bound `firmId` (same constructor pattern as every other Prisma*Repository), single `create()` method using `firmScopedClient(this.firmId).auditEntry.create(...)`. Assert `input.firmId === this.firmId` like `PrismaMatterRepository.create`/`PrismaDocumentRepository.create` already do — don't skip that guard just because this is a new file.
  - [x] `POST /api/documents/:id/attorney` (new route file `app/api/documents/[id]/attorney/route.ts`, sibling to the existing `app/api/documents/[id]/route.ts`) — body `{ attorneyId: string, reason?: string }`. No static role gate at the route level (unlike every prior route) — `resolveSession` still requires *some* valid session/role to authenticate, but the FORBIDDEN-vs-not decision is delegated entirely to `AttorneyReassignment.reassign`'s instance-level check (Task 2, step 2). Map `ReassignmentError.code` to HTTP status: `NOT_FOUND → 404`, `FORBIDDEN → 403`, `VALIDATION_ERROR → 400` (same `errorResponse(status, code, message)` pattern every other route uses).

- [x] Task 4: Tests (AC: #1, #2)
  - [x] Unit: `AttorneyReassignment.reassign` against fakes — current Attorney of Record can reassign; Office Manager can reassign a Document they don't own; a third-party staff role (Paralegal, or a *different* Attorney of Record who isn't this Document's owner) is rejected with `FORBIDDEN`; an unknown Document throws `NOT_FOUND`; a `newAttorneyId` from another Firm (or nonexistent) throws `VALIDATION_ERROR`; a successful reassignment calls both `documents.setAttorneyOfRecord` and `auditEntries.create` with the expected arguments (this is the test that actually proves AC #1's "logged action" clause, not just the Document mutation).
  - [x] Integration (PGlite-backed): `POST /api/documents/:id/attorney` end-to-end — 200 + updated `attorneyOfRecordId` for the current attorney and for an Office Manager; a real `AuditEntry` row is persisted and queryable afterward (`testClient.auditEntry.findFirst`) with correct `documentId`/`matterId`/`actorId`/`action`; 403 for a non-owning staff role; 404 for a cross-Firm Document id; 400 for a missing/invalid `attorneyId`; 401 with no session.

## Dev Notes

- **This is the first story to touch `AuditEntry`.** AD-6 (ARCHITECTURE-SPINE.md) binds Story 1.5 by name and requires `documentId`/`matterId` as **required, not optional** fields (an adversarial architecture review specifically flagged this — the field list in AD-6's prose originally omitted them, and a later fix added them explicitly because Story 4.2's cross-document audit queries need them). Don't underscope the migration to just `actor`/`timestamp`/`action`/`reason`.
- **Permission logic is document-instance-scoped, not role-scoped** — this is the one thing in the story that doesn't fit the `ALLOWED_ROLES: Role[]` array pattern used in every prior route (`app/api/matters/[id]/route.ts`, `app/api/documents/[id]/route.ts`). Don't try to force it into that shape; the check genuinely needs the loaded `Document` to know who the *current* attorney is.
- **`AuditEntry` rows are insert-only by design (AD-6)** — no `update`/`delete` code path, ever. Don't add one "for completeness."
- **Reuses:** `DocumentRepository.findById` (Story 1.4), the firmId-scoped-404 pattern (Story 1.1), `UserRepository.findById` cross-Firm validation (Story 1.3's `MatterOnboarding.setPrimaryAttorney`), `tests/helpers/testDb.ts` (Story 1.2), the `Prisma*Repository` bound-firmId-with-mismatch-guard pattern (Stories 1.1/1.3).
- **Schema change this story** — unlike Story 1.4, this one does need a new migration (`AuditEntry` table). Follow the exact hand-written migration style of the three existing migration files; there is still no shadow DB / live Postgres in this environment, so `prisma migrate dev` cannot be used to generate it.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.5]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/ARCHITECTURE-SPINE.md — AD-1 (firm scoping), AD-6 (AuditEntry shape, Story 1.5 named directly)]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/reviews/review-adversarial.md — Finding 2 (documentId/matterId must be required on AuditEntry, indexed for cross-story querying)]
- [Source: _bmad-output/implementation-artifacts/1-1, 1-3, 1-4 — previous stories, patterns cited above]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `npx vitest run tests/unit/attorneyReassignment.test.ts` before implementation — confirmed RED (module not found)
- `npx vitest run` — 15 files, 109 tests passed
- `npx tsc --noEmit` — clean
- `npx eslint .` — clean
- `npx next build` — succeeded; `/api/documents/[id]/attorney` present in the route list as a dynamic route

### Completion Notes List

- Added `AuditEntry` — first entity to implement AD-6. `domain/AuditEntry.ts`, `model AuditEntry` in `prisma/schema.prisma` (fields: `id`, `firmId`, `documentId`, `matterId`, `actorId`, `action` (plain `string`, not an enum, so later stories can add action values without a migration), `reason` (nullable), `timestamp`), hand-written migration `20260807000000_audit_entry`, and `"AuditEntry"` added to `FIRM_SCOPED_MODELS` in `firmScopeExtension.ts`. Ran `npx prisma generate` to regenerate the client.
- `application/AttorneyReassignment.ts` — permission check is document-instance-scoped (current `attorneyOfRecordId === actorId`, or `actorRole === "OFFICE_MANAGER"`), not a static role allow-list, per the story's explicit note that this can't reuse the `ALLOWED_ROLES` pattern from prior routes. `newAttorneyId` validated against `UserRepository` with no additional role restriction on the target, matching the AC's "another Firm member" wording.
- The Document mutation (`setAttorneyOfRecord`) and the `AuditEntry` insert are two separate repository calls, not one Prisma transaction — a deliberate, documented scope decision (this is a single self-contained service with no other caller, unlike AD-3's `StatusTransition`, which composes across Epic 2/4 call sites and therefore needs one atomic boundary).
- `POST /api/documents/:id/attorney` has no static role gate; `resolveSession` still requires a valid session, but FORBIDDEN-vs-not is delegated entirely to `AttorneyReassignment.reassign`'s instance-level check.
- Added `setAttorneyOfRecord` to `DocumentRepository` (interface + `PrismaDocumentRepository`), mirroring `PrismaMatterRepository.setPrimaryAttorney`'s `updateMany`-then-`findFirst` shape.
- Updated existing test fakes (`documentDetection.test.ts`, `documentViewer.test.ts`) with a `setAttorneyOfRecord` mock after the `DocumentRepository` interface changed — same recurring pattern as prior stories.
- Full verification suite green: `tsc --noEmit`, `vitest run` (109/109 across all 15 test files, no regressions), `eslint .`, `next build`.

### File List

- `domain/AuditEntry.ts` (new)
- `prisma/schema.prisma` (modified — added `AuditEntry` model + back-relations on `Firm`/`User`/`Matter`/`Document`)
- `prisma/migrations/20260807000000_audit_entry/migration.sql` (new)
- `generated/prisma/*` (regenerated via `npx prisma generate`)
- `adapters/db/firmScopeExtension.ts` (modified — added `"AuditEntry"` to `FIRM_SCOPED_MODELS`)
- `application/DocumentDetection.ts` (modified — added `setAttorneyOfRecord` to `DocumentRepository` interface)
- `adapters/db/documentRepository.ts` (modified — added `setAttorneyOfRecord`)
- `application/AttorneyReassignment.ts` (new)
- `adapters/db/auditEntryRepository.ts` (new)
- `app/api/documents/[id]/attorney/route.ts` (new)
- `tests/unit/attorneyReassignment.test.ts` (new)
- `tests/unit/documentDetection.test.ts` (modified — added `setAttorneyOfRecord` mock)
- `tests/unit/documentViewer.test.ts` (modified — added `setAttorneyOfRecord` mock)
- `tests/integration/attorneyReassignmentRoute.test.ts` (new)

## Change Log

- 2026-08-05: Story 1.5 implemented — `AuditEntry` entity (first implementation of AD-6), `AttorneyReassignment` application service, `POST /api/documents/:id/attorney` route, unit + integration tests. Status set to `review`.
