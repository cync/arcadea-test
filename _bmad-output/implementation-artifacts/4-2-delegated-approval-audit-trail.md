---
baseline_commit: NO_VCS
---

# Story 4.2: Delegated-Approval Audit Trail

Status: ready-for-dev

## Story

As the Attorney of Record,
I want to see a record of any delegated approval used on my Documents,
so that I know exactly what happened while I was unreachable.

## Acceptance Criteria

1. Given a delegated approval is used, When it's recorded, Then the log captures the actor, timestamp, and the Document/Matter it applied to. [Source: epics.md#Story-4.2]
2. Given I'm the Attorney of Record for a Document, When I view its history, Then I can see any delegated-approval entries logged against it. [Source: epics.md#Story-4.2]

## Tasks / Subtasks

- [ ] Task 1: Confirm AC #1 is already satisfied (AC: #1) — **no new write, just verification**
  - [ ] AC #1 is already fully met by Story 4.1's `StatusTransition` `delegatedApproval` branch: every `DELEGATED_APPROVAL` `AuditEntry` already carries `actorId`, `timestamp` (auto-set `@default(now())`), `documentId`, and `matterId` (AD-6's required fields, not optional — confirmed all four are populated in `tests/unit/statusTransition.test.ts`'s existing delegated-approval test). This story adds no new write path. Do not re-implement or duplicate the `AuditEntry` write here.

- [ ] Task 2: `AuditEntryRepository.findByDocumentAndAction` + `DelegatedApprovalHistory` application service (AC: #2)
  - [ ] Add `findByDocumentAndAction(documentId: string, action: string): Promise<AuditEntry[]>` to `AuditEntryRepository` (canonical home `application/AttorneyReassignment.ts`, same interface every prior audit-writing story has reused — this is its first *read* method, alongside the existing `create`) and `PrismaAuditEntryRepository` (`adapters/db/auditEntryRepository.ts`) — `client.auditEntry.findMany({ where: { documentId, action }, orderBy: { timestamp: "desc" } })`.
  - [ ] New file `application/DelegatedApprovalHistory.ts` — `DelegatedApprovalHistoryError` class with `code: "NOT_FOUND" | "FORBIDDEN"` (same pattern as every other application-service error class).
  - [ ] `DelegatedApprovalHistory.getHistory(input: { documentId: string; actorId: string }): Promise<AuditEntry[]>`: loads the Document via `DocumentRepository.findById` — throws `NOT_FOUND` if missing/cross-Firm. Permission is **document-instance-scoped** (same reasoning as `AttorneyReassignment`/`DeadlineManagement`, Stories 1.5/3.1, not a static role array): allowed iff `document.attorneyOfRecordId === input.actorId` — EXPERIENCE.md's Roles & Permissions table names this specifically as "view Delegated-Approval audit entries on **their** Documents (FR-10)," scoped the same narrow way Deadline is. Office Manager is **not** granted this read, even though they're the one who performs delegated approvals — EXPERIENCE.md's Office Manager row doesn't list it, and the epics AC itself only names the Attorney of Record. On success, calls `auditEntries.findByDocumentAndAction(documentId, "DELEGATED_APPROVAL")` and returns the list — **only delegated-approval entries**, not the Document's full audit history (reassignment/reviewed entries are out of this AC's scope; don't build a general-purpose history endpoint here).

- [ ] Task 3: API route (AC: #2)
  - [ ] Add a `GET` handler to the **existing** `app/api/documents/[id]/delegated-approval/route.ts` (Story 4.1 already created this file for `POST`) — same resource path, GET reads its history, POST performs the action. **Read the existing file in full before adding to it.** No static `ALLOWED_ROLES` gate (same shape as `AttorneyReassignment`/`DeadlineManagement`'s GET-analogue routes) — `resolveSession` requires a valid session, but FORBIDDEN-vs-not is delegated entirely to `DelegatedApprovalHistory.getHistory`'s instance-level check. Returns `{ entries: AuditEntry[] }`. Map `DelegatedApprovalHistoryError.code` to HTTP status: `NOT_FOUND → 404`, `FORBIDDEN → 403`.

- [ ] Task 4: Tests (AC: #1, #2)
  - [ ] Unit: `DelegatedApprovalHistory.getHistory` against fakes — the Document's current Attorney of Record sees its delegated-approval entries (and only entries with `action: "DELEGATED_APPROVAL"`, verified by mocking `findByDocumentAndAction` and asserting it's called with that literal action, not a broader query); a non-owning staff member (including an Office Manager) is rejected with `FORBIDDEN`; an unknown Document throws `NOT_FOUND`.
  - [ ] Integration (PGlite-backed, extend `tests/integration/delegatedApprovalRoute.test.ts` — do not fork a new file): `GET /api/documents/:id/delegated-approval` end-to-end — after a real delegated approval (Story 4.1's `POST`) has run, the owning Attorney of Record's `GET` call returns that entry with the correct `actorId`/`timestamp`/`documentId`/`matterId` (AC #1, proven through the real route); an Office Manager's `GET` call on the same Document returns 403; a cross-Firm Document id returns 404; 401 with no session; a Document with no delegated-approval history yet returns `{ entries: [] }`, not an error.

## Dev Notes

- **This story is almost entirely a read.** The only write-side work (Story 4.1) already satisfies AC #1 in full — resist the urge to add anything to the `AuditEntry` write path. Verify with a test, don't reimplement.
- **Scoped to `DELEGATED_APPROVAL` entries only, not a general audit-history endpoint.** The epics AC is specific ("I can see any delegated-approval entries logged against it"), and EXPERIENCE.md's grant is equally narrow. A general "view all audit history for this Document" endpoint is not this story's job — if a future story needs one, it can add a second `findByDocumentId` (no `action` filter) without touching this one.
- **Same GET+POST-on-one-resource-path shape** as how this codebase already treats `documents/:id` (GET, Story 1.4) vs. its siblings — extending Story 4.1's existing route file with a `GET` export, not inventing a new URL.
- **Permission is instance-scoped, matching Stories 1.5/3.1/4.1's document-ownership pattern**, not Story 4.1's own role-only gate — don't copy `ALLOWED_ROLES: ["OFFICE_MANAGER"]` here; it's the opposite check (the Attorney of Record, not the Office Manager, gets access, and only for Documents they own).
- **Reuses:** `AuditEntryRepository` (Story 1.5, extended here with its first read method), `DocumentRepository.findById`'s firmId-scoped-404 pattern, `tests/helpers/testDb.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/ARCHITECTURE-SPINE.md — AD-6 (AuditEntry's required fields, all already populated by Story 4.1)]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Docket-2026-08-05/EXPERIENCE.md — Roles & Permissions ("Attorney of Record... view Delegated-Approval audit entries on their Documents (FR-10)")]
- [Source: _bmad-output/implementation-artifacts/1-5, 3-1, 4-1 — instance-scoped-permission pattern, `AuditEntryRepository`, the route this story extends]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
