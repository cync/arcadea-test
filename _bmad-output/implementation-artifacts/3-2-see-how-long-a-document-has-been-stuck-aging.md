---
baseline_commit: NO_VCS
---

# Story 3.2: See How Long a Document Has Been Stuck (Aging)

Status: review

## Story

As a paralegal,
I want to see how long a Document has sat in its current Status,
so that I can spot ones at risk of slipping.

## Acceptance Criteria

1. Given a Document hasn't changed Status recently, When I view the board, Then its Aging (time in current Status) is visually indicated. [Source: epics.md#Story-3.2]
2. Given a Document has been untouched for more than 3 days, When I view the board, Then it's visually distinguished from recently-updated Documents. [Source: epics.md#Story-3.2]

## Tasks / Subtasks

- [x] Task 1: `Aging` domain function (AC: #1, #2) — **the single, shared computation AD-7 requires**
  - [x] New file `domain/Aging.ts` — pure function, no outward dependencies (this is domain-layer code, same tier as `domain/Document.ts`). Export `STALE_THRESHOLD_DAYS = 3` (FR-7/FR-8's threshold, also the exact number Story 3.3's Stale Alert will use — defining it once here, not duplicating the literal `3` in two places later).
  - [x] `computeAging(statusChangedAt: Date, now: Date = new Date()): { days: number; isStale: boolean }` — `days` is the whole number of days elapsed (`Math.floor((now - statusChangedAt) / 86_400_000)`); `isStale` is `days > STALE_THRESHOLD_DAYS` (AC #2's "more than 3 days," not "3 or more").
  - [x] **This is the one domain function AD-7 names directly**: "`Aging = now - statusChangedAt` is one domain function; both the board render and the scheduled Stale Alert job call it — neither recomputes Aging independently." Story 3.3 (Stale Alert) will import and call this exact function later — don't let this story's implementation make that awkward (e.g. don't inline the day-math directly into `WorkflowBoard` instead of a standalone importable function).

- [x] Task 2: Extend `WorkflowBoard` to attach Aging per Document (AC: #1, #2)
  - [x] **Read `application/WorkflowBoard.ts` in full before touching it** — this task extends Story 2.1's service, it does not replace it. The existing grouping-by-status and sort-by-`statusChangedAt` behavior must keep working unchanged.
  - [x] Add `BoardDocument = Document & { aging: { days: number; isStale: boolean } }` and change `Board = Record<DocumentStatus, BoardDocument[]>` (was `Document[]`).
  - [x] `WorkflowBoard.getBoard(now: Date = new Date())` — accepts an optional `now` (defaults to the real clock; the same dependency-injection-for-testability pattern already used elsewhere, e.g. `driveConnectorFactory`), calls `computeAging(document.statusChangedAt, now)` for every Document and attaches the result as `aging` before grouping/sorting (sort order itself is unchanged — still `statusChangedAt` ascending, Story 2.1's existing behavior, now just alongside the newly-attached `aging` field).
  - [x] AC #1 ("visually indicated") and AC #2 ("visually distinguished") are UI concerns this codebase has no UI layer for yet (every story so far is API-only, per Story 2.1's own Dev Notes) — this story's job is to make the *data* the AC depends on (`aging.days`, `aging.isStale`) available on every board Document; there is no view/template to update.

- [x] Task 3: Tests (AC: #1, #2)
  - [x] Unit (`domain/Aging.ts`, new test file `tests/unit/aging.test.ts`): a Document changed status 1 day ago has `aging.days === 1`, `isStale === false`; exactly 3 days ago is still `isStale === false` (AC #2 says "more than 3 days," not "3 or more" — a boundary test that would silently flip if `>` were written as `>=`); 4+ days ago is `isStale === true`; a Document changed status moments ago has `aging.days === 0`.
  - [x] Unit (extend `tests/unit/workflowBoard.test.ts`, do not fork a new file): `getBoard()` attaches the correct `aging.days`/`isStale` to each Document using an injected `now`; existing grouping/sort tests from Story 2.1 still pass unmodified in spirit (re-verify, don't just assume).
  - [x] Integration (extend `tests/integration/boardRoute.test.ts`, PGlite-backed): `GET /api/board` response includes `aging` on every Document; a Document whose `statusChangedAt` is 5 days in the past shows `isStale: true`; one changed today shows `isStale: false`.

## Dev Notes

- **This story and Story 3.3 (Stale Alert) share one domain function — build it to be shared from the start**, per AD-7's explicit text. `domain/Aging.ts` is that shared point; Story 3.3 will `import { computeAging, STALE_THRESHOLD_DAYS } from "../domain/Aging"` unchanged.
- **This story extends `WorkflowBoard`/`GET /api/board`, it does not add a new endpoint.** Read Story 2.1's implementation in full before touching it (Task 2's first bullet) — the same "read files being modified" discipline every extension story in this backlog has followed (Story 2.3 → `StatusTransition`, this story → `WorkflowBoard`).
- **No new schema, no new migration.** `Document.statusChangedAt` already exists (Story 1.3) and is exactly AD-7's named Aging anchor — this story only reads it, through the new domain function, never recomputes it a different way.
- **`>` not `>=` at the 3-day boundary** — the epics AC says "more than 3 days," which is a real, testable distinction from "3 days or more." Get this boundary condition right; it's the one place a one-character mistake silently changes behavior.
- **No Document Detail (single-document) exposure this story** — the AC is scoped to "When I view the board," not `GET /api/documents/:id`. Don't extend `DocumentViewer` too; that's out of this story's stated scope.
- **Reuses:** `Document.statusChangedAt` (Story 1.3/2.2), `WorkflowBoard`'s existing grouping/sort (Story 2.1), the optional-clock-injection pattern already used for `driveConnectorFactory` elsewhere in this codebase.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/ARCHITECTURE-SPINE.md — AD-7 (single Aging domain function, shared by the board render and the Stale Alert job; `statusChangedAt` as the sole anchor)]
- [Source: _bmad-output/implementation-artifacts/2-1 — `WorkflowBoard`, the service this story extends]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `npx vitest run tests/unit/aging.test.ts` before implementation — confirmed RED (module not found)
- `npx vitest run` — 22 files, 153 tests passed
- `npx tsc --noEmit` — clean
- `npx eslint .` — clean
- `npx next build` — succeeded; route list unchanged (this story extends `GET /api/board`, adds no new route)

### Completion Notes List

- `domain/Aging.ts` — the one shared `computeAging` function AD-7 names directly, with `STALE_THRESHOLD_DAYS = 3` exported for Story 3.3 to reuse unchanged. Explicit boundary test confirms `isStale` uses `>`, not `>=`, at exactly 3 days (epics AC says "more than 3 days").
- Extended `application/WorkflowBoard.ts`: `getBoard()` now takes an optional `now` (defaults to the real clock, same DI-for-testability pattern as `driveConnectorFactory`) and attaches `aging: { days, isStale }` to every Document before grouping/sorting. Story 2.1's existing grouping and `statusChangedAt`-ascending sort are unchanged — re-verified via the existing tests, which still pass.
- No UI work — confirmed this codebase has no UI layer yet (every story so far is API-only); the story's scope is making `aging` data available on the board response, not rendering it.
- No schema change — `Document.statusChangedAt` already existed (Story 1.3).
- Full verification suite green: `tsc --noEmit`, `vitest run` (153/153 across all 22 test files, no regressions), `eslint .`, `next build`.

### File List

- `domain/Aging.ts` (new)
- `application/WorkflowBoard.ts` (modified — `BoardDocument`/`Board` types now include `aging`, `getBoard` accepts optional `now`)
- `tests/unit/aging.test.ts` (new)
- `tests/unit/workflowBoard.test.ts` (modified — added aging-attachment test)
- `tests/integration/boardRoute.test.ts` (modified — added aging/isStale integration test)

## Change Log

- 2026-08-05: Story 3.2 implemented — `domain/Aging.ts` (`computeAging`, `STALE_THRESHOLD_DAYS`), `WorkflowBoard` extended to attach Aging per Document, unit + integration tests. Status set to `review`.
