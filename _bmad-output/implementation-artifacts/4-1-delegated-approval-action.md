---
baseline_commit: NO_VCS
---

# Story 4.1: Delegated Approval Action

Status: review

## Story

As the Office Manager,
I want to move a Document to Filed/Sent on behalf of the Attorney of Record,
so that a deadline isn't missed when the attorney is unreachable.

## Acceptance Criteria

1. Given I have the Office Manager role, When I use the delegated-approval action on a Document, Then it moves to Filed/Sent. [Source: epics.md#Story-4.1]
2. Given the delegated-approval action is used, When the board displays the transition, Then it's shown distinctly from a standard attorney-initiated transition. [Source: epics.md#Story-4.1]

## Tasks / Subtasks

- [x] Task 1: Extend `StatusTransition` with the Delegated Approval case (AC: #1, #2) — **AD-3's own worked example: "`DelegatedApproval` (Epic 4) calls `StatusTransition` internally rather than mutating `Document` independently, passing its actor/reason through to the same transaction"**
  - [x] **Read `application/StatusTransition.ts` in full before touching it** — fourth story to extend this file (after 2.2 introduced it, 2.3 added the `REVIEWED` branch, 3.3 added the `staleAlertSentAt` reset via `updateStatus`). Every existing branch (plain transition, `REVIEWED`) must keep working unchanged.
  - [x] `transition()`'s input gains an optional `delegatedApproval?: { reason?: string }`. When present (and `toStatus !== "REVIEWED"` — the two never co-occur, since only `DelegatedApproval`'s own service ever sets this flag and it never targets `REVIEWED`): call `DocumentRepository.updateStatus(documentId, toStatus)` (unchanged, plain path — a delegated approval does **not** touch `reviewedByUserId`) and append an `AuditEntry` with `action: "DELEGATED_APPROVAL"`, `reason: delegatedApproval.reason ?? null` — AD-6's second-to-last named action type (Reviewed-by and reassignment already built; only Reviewed-by's sibling, this one, and none else are AD-6's three). Do not write any new Document field for this — see Task 1's note on AC #2 below.
  - [x] **AC #2 ("shown distinctly") is answered entirely by the `AuditEntry.action` value, not a new `Document` field.** AD-3's Rule is explicit that only `reviewedByUserId` and `statusChangedAt` are sanctioned denormalized cache fields — "any other code path... goes through `AuditEntry` — never a second cache." A `Document.delegatedByUserId`-style field would repeat the exact drift AD-6 exists to prevent (see Story 2.3's Dev Notes on Finding 3). The distinguishing signal a future board/audit view would read is simply: does this Document's most recent `AuditEntry` (or the one matching its current `statusChangedAt`) have `action === "DELEGATED_APPROVAL"`? That's a read-time `AuditEntry` query, not a write this story needs to build (Story 4.2 owns the "view its history" AC).

- [x] Task 2: `DelegatedApproval` application service (AC: #1)
  - [x] New file `application/DelegatedApproval.ts` — the exact name `ARCHITECTURE-SPINE.md`'s directory sketch already commits to (`application/ StatusTransition, DelegatedApproval, MatterOnboarding, StaleCheck`), same precedent as Story 2.2 claiming `StatusTransition` and Story 3.3 claiming `StaleCheck`.
  - [x] `DelegatedApproval` is constructed with a `StatusTransition` instance (composition, not a second `DocumentRepository`/`AuditEntryRepository` pair) — this is the literal shape AD-3 describes ("calls `StatusTransition` internally").
  - [x] `DelegatedApproval.approve(input: { documentId: string; firmId: string; actorId: string; reason?: string }): Promise<Document>` — calls `statusTransition.transition({ documentId, firmId, toStatus: "FILED_SENT", actorId, delegatedApproval: { reason } })`. `toStatus` is hard-coded to `"FILED_SENT"`, never caller-supplied — this is what makes AC #1 ("it moves to Filed/Sent") hold by construction, not by a runtime check. No new error class: `StatusTransitionError(NOT_FOUND)` propagates through unchanged, since this service adds no validation of its own beyond what `StatusTransition.transition` already does.

- [x] Task 3: API route (AC: #1, #2)
  - [x] `POST /api/documents/:id/delegated-approval` (new route file `app/api/documents/[id]/delegated-approval/route.ts`) — body `{ reason?: string }` (optional; validate it's a string when present, same pattern as `reason` elsewhere). **Static role gate this time, not instance-scoped** — `ALLOWED_ROLES: Role[] = ["OFFICE_MANAGER"]`, matching EXPERIENCE.md's explicit framing ("Delegated Approval (FR-9, Office-Manager-only by definition — no other role has this control **regardless of whose Document it is**)"). This is the opposite shape from `AttorneyReassignment`/`DeadlineManagement`'s document-instance-scoped checks (Stories 1.5/3.1) — don't copy that pattern here; a static `ALLOWED_ROLES` array is correct because eligibility genuinely doesn't depend on which Document or who its Attorney of Record is. Map `StatusTransitionError.code` to HTTP status the same way `POST /api/documents/:id/status` already does (`NOT_FOUND → 404`).

- [x] Task 4: Tests (AC: #1, #2)
  - [x] Unit (extend `tests/unit/statusTransition.test.ts`, do not fork a new file): a `delegatedApproval`-flagged transition to `FILED_SENT` calls `updateStatus` with no `reviewedByUserId` argument and calls `auditEntries.create` with `action: "DELEGATED_APPROVAL"` and the given `reason`; an unknown Document still throws `NOT_FOUND` through the delegated path too.
  - [x] Unit: `DelegatedApproval.approve` against a fake/mock `StatusTransition` (or a real one backed by fakes) — calls `transition` with `toStatus: "FILED_SENT"` regardless of the Document's current status; propagates `StatusTransitionError`.
  - [x] Integration (PGlite-backed): `POST /api/documents/:id/delegated-approval` end-to-end — 200 + `status: "FILED_SENT"` for an Office Manager acting on a Document owned by a *different* Attorney of Record (proves AC #1's "regardless of whose Document it is"); a real `AuditEntry` row is persisted with `action: "DELEGATED_APPROVAL"` and the given `reason` (AC #2's underlying data); 403 for every non-Office-Manager role including the Document's own Attorney of Record; 404 for a cross-Firm Document id; 401 with no session.

## Dev Notes

- **This story is the fourth extension of `StatusTransition`, not a new parallel write path.** AD-3's entire point is that Delegated Approval, Reviewed-by, and ordinary drags all fall through the same single service — resist the temptation to have `DelegatedApproval` call `DocumentRepository.updateStatus` directly "since it's simpler"; that would be the exact AD-3 violation the spine calls out by name (a second, non-atomic transaction risk the adversarial review flagged in Finding 5).
- **Role-scoped, not instance-scoped — the opposite of Stories 1.5/3.1.** Don't reuse the `document.attorneyOfRecordId === actorId` ownership-check pattern here; EXPERIENCE.md is explicit that Office Manager's Delegated Approval applies "regardless of whose Document it is."
- **No new `Document` field.** AD-3 only sanctions `reviewedByUserId`/`statusChangedAt` as denormalized caches; "shown distinctly" is answered by `AuditEntry.action`, read at query time — Story 4.2 builds the actual read/view of that history.
- **AD-6 is now two-of-three actions old, one to go** — `"ATTORNEY_REASSIGNED"` (1.5), `"REVIEWED"` (2.3), and now `"DELEGATED_APPROVAL"` complete AD-6's full named list; no further action types are expected from the current backlog.
- **Reuses:** `AuditEntryRepository` (Story 1.5, unchanged), `StatusTransitionError`'s existing `NOT_FOUND` code, the static `ALLOWED_ROLES` route pattern (Stories 2.2/2.3), `tests/helpers/testDb.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/ARCHITECTURE-SPINE.md — AD-3 (DelegatedApproval calls StatusTransition internally), AD-6 (three named audit actions, third one built here)]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Docket-2026-08-05/EXPERIENCE.md — Roles & Permissions ("Office Manager... Delegated Approval (FR-9, Office-Manager-only by definition — no other role has this control regardless of whose Document it is)")]
- [Source: _bmad-output/implementation-artifacts/2-2, 2-3, 3-3 — `StatusTransition`'s prior extensions, patterns cited above]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `npx vitest run tests/unit/statusTransition.test.ts` (new delegated-approval case) before implementation — confirmed RED
- `npx vitest run tests/unit/delegatedApproval.test.ts` before implementation — confirmed RED (module not found)
- `npx vitest run` — 27 files, 179 tests passed
- `npx tsc --noEmit` — clean
- `npx eslint .` — clean
- `npx next build` — succeeded; `/api/documents/[id]/delegated-approval` present in the route list as a dynamic route

### Completion Notes List

- Extended `application/StatusTransition.ts` (fourth extension, after 2.2/2.3/3.3) with a `delegatedApproval?: { reason?: string }` branch: writes no `reviewedByUserId`, appends an `AuditEntry` with `action: "DELEGATED_APPROVAL"`. Every existing branch (plain transition, `REVIEWED`) re-verified unchanged via the existing test suite.
- `application/DelegatedApproval.ts` composes `StatusTransition` rather than writing to `DocumentRepository`/`AuditEntryRepository` directly, per AD-3's literal description. `toStatus` is hard-coded to `"FILED_SENT"` — AC #1 holds by construction, not a runtime check.
- No new `Document` field added for AC #2 ("shown distinctly") — confirmed AD-3 only sanctions `reviewedByUserId`/`statusChangedAt` as denormalized caches; the distinguishing signal is `AuditEntry.action`, readable at query time (Story 4.2's concern).
- `POST /api/documents/:id/delegated-approval` uses a static `ALLOWED_ROLES: ["OFFICE_MANAGER"]` gate (not the document-instance-scoped ownership check from Stories 1.5/3.1) — verified with a test where the Office Manager acts on a Document owned by a different Attorney of Record, and a separate test confirming that Attorney of Record itself gets 403.
- Route accepts a fully-optional body (no `reason` required) — read raw text first and default to `{}` when empty, rather than letting `request.json()` throw on an empty body the way every prior route (which always required at least one field) did.
- AD-6's three named audit actions are now all implemented: `"ATTORNEY_REASSIGNED"` (1.5), `"REVIEWED"` (2.3), `"DELEGATED_APPROVAL"` (this story).
- Full verification suite green: `tsc --noEmit`, `vitest run` (179/179 across all 27 test files, no regressions), `eslint .`, `next build`.

### File List

- `application/StatusTransition.ts` (modified — added `delegatedApproval` branch)
- `application/DelegatedApproval.ts` (new)
- `app/api/documents/[id]/delegated-approval/route.ts` (new)
- `tests/unit/statusTransition.test.ts` (modified — added delegated-approval test cases)
- `tests/unit/delegatedApproval.test.ts` (new)
- `tests/integration/delegatedApprovalRoute.test.ts` (new)

## Change Log

- 2026-08-05: Story 4.1 implemented — `StatusTransition` extended for Delegated Approval, `DelegatedApproval` application service, `POST /api/documents/:id/delegated-approval` route, unit + integration tests. Status set to `review`. AD-6's audit-action list is now fully implemented across Stories 1.5/2.3/4.1.
