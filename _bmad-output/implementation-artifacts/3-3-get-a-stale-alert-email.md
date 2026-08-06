---
baseline_commit: NO_VCS
---

# Story 3.3: Get a Stale Alert Email

Status: review

## Story

As the Attorney of Record or Office Manager,
I want an email when a Document has been untouched for more than 3 days,
so that I find out before the deadline is missed.

## Acceptance Criteria

1. Given a Document's Aging exceeds 3 days, When the daily stale check runs, Then an email alert is sent to the Attorney of Record and the Office Manager. [Source: epics.md#Story-3.3]
2. Given a Document has already triggered a stale alert, When it remains stale the following day, Then a duplicate alert is not sent for the same threshold crossing. [Source: epics.md#Story-3.3]
3. Given the stale check, When it runs, Then it executes reliably on schedule regardless of whether any user has opened the app that day. [Source: epics.md#Story-3.3]

## Tasks / Subtasks

- [x] Task 1: Resolve the Deferred `EmailNotifier` adapter choice (AC: #1) — **`[ASSUMPTION]`, same treatment as Story 1.2's Drive-mechanism decision**
  - [x] `ARCHITECTURE-SPINE.md`'s Deferred list names this explicitly: "Concrete `EmailNotifier` adapter — no transactional email provider named for the Stale Alert (FR-8). Needed before Epic 3." This story is that "before Epic 3" moment — resolve it now, don't leave it unresolved.
  - [x] **Choice: Resend, called via native `fetch` (no new npm dependency).** Reasoning: Resend pairs naturally with the Vercel deploy target the spine already assumes (Deployment & environments section); its HTTP API is simple enough to call directly with `fetch`, so no SDK package needs adding — avoiding the dev-story workflow's "new dependency requires user approval" HALT for an architectural pick this story is meant to resolve outright, the same way Story 1.2 resolved Drive without requiring a mid-story pause. Tag this choice `[ASSUMPTION]` in the adapter file's own doc comment, mirroring `GoogleDriveApiAdapter`'s and Story 1.3's polling-cadence precedent.
  - [x] `ports/EmailNotifier.ts` — new port, named in `ARCHITECTURE-SPINE.md`'s Structural Seed (`ports/DriveConnector, EmailNotifier, AuthProvider`). `StaleAlertEmail = { to: string[]; documentId: string; documentName: string; agingDays: number }`; `EmailNotifier.sendStaleAlert(email: StaleAlertEmail): Promise<void>`.
  - [x] `adapters/email/resendEmailAdapter.ts` — `ResendEmailAdapter implements EmailNotifier`, POSTs to `https://api.resend.com/emails` via `fetch`, reading `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` from env (throws if either is missing — same fail-loudly posture as `tokenCipher.ts` requiring `TOKEN_ENCRYPTION_KEY`). No real Resend account/API key exists in this environment (same limitation as every other external credential in this project) — this adapter is never exercised against the real network in tests, only ever via a mocked `global.fetch` (same treatment `GoogleDriveApiAdapter` gets from mocked `@googleapis/drive`).

- [x] Task 2: `Document.staleAlertSentAt` + extend `StatusTransition` to reset it (AC: #2)
  - [x] Add `staleAlertSentAt: Date | null` to `domain/Document.ts`; `staleAlertSentAt DateTime?` to `model Document` in `prisma/schema.prisma`. New migration `prisma/migrations/<timestamp>_stale_alert/migration.sql` (hand-written, no shadow DB) — `ALTER TABLE "documents" ADD COLUMN "staleAlertSentAt" TIMESTAMP(3)`. Run `npx prisma generate`.
  - [x] **This is AC #2's actual mechanism**: a `null` value means "no alert sent for the *current* stale period"; a non-null value means "already alerted, don't resend." **Read `application/StatusTransition.ts` in full before touching it** (third story to extend this file, after 2.3) — extend `DocumentRepository.updateStatus`'s `data` object (`adapters/db/documentRepository.ts`) to unconditionally include `staleAlertSentAt: null` alongside `status`/`statusChangedAt` on every call, same atomic `updateMany`, no separate write. Any Status change starts a fresh Aging period (AD-7), so it must also start a fresh "not yet alerted" period — otherwise a Document that goes stale, gets moved, and later goes stale again in a *different* status would never re-alert.

- [x] Task 3: `StaleCheck` application service (AC: #1, #2)
  - [x] New file `application/StaleCheck.ts` — the exact name `ARCHITECTURE-SPINE.md`'s directory sketch already commits to (`application/ StatusTransition, DelegatedApproval, MatterOnboarding, StaleCheck`), same as Story 2.2 claiming `StatusTransition`'s pre-committed name.
  - [x] Add `findByRole(role: Role): Promise<User[]>` to `UserRepository` (canonical home `application/MatterOnboarding.ts`, same cross-file-interface-reuse precedent already used for `AuditEntryRepository`) and `PrismaUserRepository` (`adapters/db/userRepository.ts`) — `client.user.findMany({ where: { role } })`, firm-scoped by the repository's bound `firmId` like every other method there.
  - [x] Add `markStaleAlertSent(documentId: string, sentAt: Date): Promise<void>` to `DocumentRepository` and `PrismaDocumentRepository` — a plain `updateMany` (no `findFirst` needed after, the job doesn't use the return value).
  - [x] `StaleCheck` constructed per-Firm (same per-request-scoped-repository pattern as every other application service): `constructor(documents: DocumentRepository, users: UserRepository, emailNotifier: EmailNotifier)`.
  - [x] `StaleCheck.run(now: Date = new Date()): Promise<{ alertsSent: number }>`: loads `documents.findAllForFirm()` (Story 2.1's existing method — no new query shape needed), computes `computeAging(document.statusChangedAt, now)` for each (the exact shared function from `domain/Aging.ts`, Story 3.2 — **do not reimplement the day-math here**), and skips any Document where `!aging.isStale || document.staleAlertSentAt !== null`. For each stale-and-not-yet-alerted Document: look up the Attorney of Record (`users.findById(document.attorneyOfRecordId)`) and all Office Managers (`users.findByRole("OFFICE_MANAGER")`), collect their `email`s into a de-duplicated recipient list (skip sending if the list ends up empty — e.g. a Firm with no Office Manager on record yet), call `emailNotifier.sendStaleAlert(...)`, then `documents.markStaleAlertSent(document.id, now)`. Return the count of alerts actually sent.

- [x] Task 4: Job orchestration + API route (AC: #1, #2, #3)
  - [x] New `jobs/staleCheck.ts`, mirroring `jobs/scanDocuments.ts`'s exact shape: `runStaleCheckForAllFirms(): Promise<{ firmId: string; alertsSent: number }[]>` — enumerates every Firm via `systemClient()` (a plain `client.firm.findMany({ select: { id: true } })`, simpler than `listScanTargets` since this job needs no Drive-connection filter — every Firm is a target, not just Drive-connected ones), constructs a per-Firm `PrismaDocumentRepository`/`PrismaUserRepository`/`ResendEmailAdapter`, and runs `StaleCheck.run()` for each.
  - [x] `POST /api/jobs/stale-check` (new route file `app/api/jobs/stale-check/route.ts`) — **no auth gate**, same `[ASSUMPTION]`-flagged security-gap treatment as `POST /api/jobs/scan-documents` (Story 1.3): a manually-triggerable stand-in for a real scheduler, explicitly not shipped as if it were fine. This is AC #3's "regardless of whether any user has opened the app" — the route takes no session/user input at all, matching the AC's own framing.

- [x] Task 5: Tests (AC: #1, #2, #3)
  - [x] Unit: `StaleCheck.run` against fakes — a Document past the 3-day threshold with `staleAlertSentAt: null` triggers `emailNotifier.sendStaleAlert` with both the Attorney of Record's and every Office Manager's email, then calls `markStaleAlertSent`; a Document at or under the threshold (reuse `domain/Aging.ts`'s own `>`-boundary reasoning, don't re-litigate it here) triggers nothing; a Document already carrying a non-null `staleAlertSentAt` is skipped even though still stale (AC #2, the actual de-dupe case); a Firm with no Office Manager on record still alerts the Attorney of Record alone (or skips only if *no* recipients exist at all — assert the boundary explicitly); recipient emails are de-duplicated.
  - [x] Unit: `ResendEmailAdapter.sendStaleAlert` against a mocked `global.fetch` — posts to the expected URL with `Authorization`/`Content-Type` headers and the expected `to`/`from`/body shape; throws if `RESEND_API_KEY`/`EMAIL_FROM_ADDRESS` are missing; throws if the mocked `fetch` response is not `ok`.
  - [x] Integration (PGlite-backed, `fetch` mocked): `POST /api/jobs/stale-check` end-to-end — a stale Document across two different Firms each produce one alert (proves the system-level per-Firm enumeration, mirroring `scanDocumentsRoute.test.ts`'s two-result shape); running the route twice in a row for the same still-stale Document sends only one email total (AC #2, exercised through the real route + real DB state, not just the unit-level fake); a fresh (non-stale) Document produces no email; the route requires no session/headers at all (AC #3).

## Dev Notes

- **This story resolves a genuinely Deferred architectural item**, not an invented one — `ARCHITECTURE-SPINE.md`'s own Deferred list names "Concrete `EmailNotifier` adapter... Needed before Epic 3." Story 1.2 (Drive mechanism) and Story 1.3 (polling cadence) already established the pattern for resolving a Deferred item mid-backlog with an explicit `[ASSUMPTION]` tag and reasoning, rather than leaving it open. Follow that same pattern here — don't leave `EmailNotifier` unimplemented "because it was Deferred."
- **No new npm dependency** — `fetch` is a Node/Next.js runtime built-in; Resend's HTTP API doesn't require its SDK. This sidesteps the dev-story workflow's HALT-on-new-dependency rule while still landing on a real, named, testable choice.
- **AD-7 discipline**: `computeAging` is imported from `domain/Aging.ts` (Story 3.2), never reimplemented. This is literally the scenario AD-7 was written to prevent — "the live board's Aging Rail and the emailed Stale Alert disagreeing about what counts as stale, because each computed 'days since last change' independently."
- **De-dupe is a `Document` field, not a fourth `AuditEntry` action type.** AD-6 binds exactly three named actions (Delegated Approval, Reviewed-by, reassignment) — none of which this story produces. "Has an alert already been sent for the current stale period" is system bookkeeping, not an audited human action; overloading `AuditEntry` for it would stretch AD-6 past what it actually names. A dedicated, `StatusTransition`-reset field mirrors exactly how AD-7 already treats `statusChangedAt` itself.
- **This is the third story to extend `StatusTransition`/`updateStatus`** (after 2.2 introduced it, 2.3 added `reviewedByUserId`). Read the current file before touching it — every non-`REVIEWED`, every `REVIEWED` code path from Stories 2.2/2.3 must still work exactly as before; this story only adds one more field to the same existing `updateMany` call.
- **System-level cross-Firm enumeration is a known, established pattern** (`systemClient()`, `listScanTargets` from Story 1.3) — reuse it, don't invent a second cross-Firm query shape.
- **No auth gate on the job route is a known, already-flagged security gap** (Story 1.3's `POST /api/jobs/scan-documents` set this precedent) — this story doesn't fix that gap, it inherits the same explicitly-documented posture, not a new unflagged one.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/ARCHITECTURE-SPINE.md — Deferred ("Concrete EmailNotifier adapter... Needed before Epic 3", "Exact scheduled-job mechanism"), AD-6 (three named audit actions only), AD-7 (single Aging function, statusChangedAt as sole anchor)]
- [Source: _bmad-output/implementation-artifacts/1-2 — the Drive-mechanism `[ASSUMPTION]`-resolution precedent this story follows]
- [Source: _bmad-output/implementation-artifacts/1-3 — `jobs/scanDocuments.ts`, `listScanTargets`, the no-auth-gate job-route precedent]
- [Source: _bmad-output/implementation-artifacts/3-2 — `domain/Aging.ts`, the shared computation this story must reuse]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `npx vitest run tests/unit/staleCheck.test.ts` before implementation — confirmed RED (module not found)
- `npx vitest run` — 25 files, 168 tests passed
- `npx tsc --noEmit` — clean
- `npx eslint .` — clean
- `npx next build` — succeeded; `/api/jobs/stale-check` present in the route list as a dynamic route

### Completion Notes List

- Resolved the `[ASSUMPTION]`-tagged Deferred item: `ResendEmailAdapter` implements `EmailNotifier` via native `fetch` against Resend's HTTP API — no new npm dependency, avoiding the dev-story workflow's new-dependency HALT while still landing on a real, named, testable choice (same treatment as Story 1.2's Drive-mechanism resolution).
- Added `Document.staleAlertSentAt`; extended `PrismaDocumentRepository.updateStatus` (third story to touch this method, after 2.2/2.3) to unconditionally reset it to `null` on every status transition, so a Document that goes stale, moves, and goes stale again in a different status re-alerts correctly.
- `application/StaleCheck.ts` reuses `domain/Aging.ts`'s `computeAging` unchanged (AD-7 discipline — no reimplemented day-math) and skips any Document with a non-null `staleAlertSentAt` (AC #2's de-dupe). Recipients are the Attorney of Record plus every Office Manager in the Firm, de-duplicated by email; a Document with zero resolvable recipients is skipped entirely (no alert, no `markStaleAlertSent` call, so it's retried on the next run rather than silently marked done).
- Added `UserRepository.findByRole` (canonical home `MatterOnboarding.ts`, following the same cross-file interface-reuse precedent as `AuditEntryRepository`).
- `jobs/staleCheck.ts`/`POST /api/jobs/stale-check` mirror Story 1.3's `scanDocuments.ts`/`scan-documents` route shape exactly, including the same explicitly-flagged no-auth-gate security-gap comment — every Firm is a target (no Drive-connection filter needed, unlike the scan job).
- Updated `makeDoc()` test-fixture defaults across all six existing unit test files with `staleAlertSentAt: null`, added `markStaleAlertSent` mocks to `DocumentRepository` fakes, and added `findByRole` mocks to `UserRepository` fakes — same recurring pattern as prior stories.
- Full verification suite green: `tsc --noEmit`, `vitest run` (168/168 across all 25 test files, no regressions), `eslint .`, `next build`.

### File List

- `ports/EmailNotifier.ts` (new)
- `adapters/email/resendEmailAdapter.ts` (new)
- `domain/Document.ts` (modified — added `staleAlertSentAt`)
- `prisma/schema.prisma` (modified — added `Document.staleAlertSentAt`)
- `prisma/migrations/20260810000000_stale_alert/migration.sql` (new)
- `generated/prisma/*` (regenerated via `npx prisma generate`)
- `adapters/db/documentRepository.ts` (modified — `updateStatus` resets `staleAlertSentAt`; added `markStaleAlertSent`)
- `application/DocumentDetection.ts` (modified — added `markStaleAlertSent` to `DocumentRepository` interface)
- `application/MatterOnboarding.ts` (modified — added `findByRole` to `UserRepository` interface)
- `adapters/db/userRepository.ts` (modified — added `findByRole`)
- `application/StaleCheck.ts` (new)
- `jobs/staleCheck.ts` (new)
- `app/api/jobs/stale-check/route.ts` (new)
- `tests/unit/resendEmailAdapter.test.ts` (new)
- `tests/unit/staleCheck.test.ts` (new)
- `tests/integration/staleCheckRoute.test.ts` (new)
- `tests/unit/attorneyReassignment.test.ts`, `tests/unit/documentDetection.test.ts`, `tests/unit/documentViewer.test.ts`, `tests/unit/statusTransition.test.ts`, `tests/unit/workflowBoard.test.ts`, `tests/unit/deadlineManagement.test.ts`, `tests/unit/matterOnboarding.test.ts` (modified — `staleAlertSentAt: null`/`markStaleAlertSent`/`findByRole` fixture additions)

## Change Log

- 2026-08-05: Story 3.3 implemented — `EmailNotifier` port + `ResendEmailAdapter` (`[ASSUMPTION]`), `Document.staleAlertSentAt`, `StaleCheck` application service, `jobs/staleCheck.ts`, `POST /api/jobs/stale-check` route, unit + integration tests. Status set to `review`. Epic 3 is now fully implemented (Stories 3.1–3.3 all at `review`).
