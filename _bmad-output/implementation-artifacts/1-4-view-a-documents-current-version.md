---
baseline_commit: NO_VCS
---

# Story 1.4: View a Document's Current Version

Status: review

## Story

As a user,
I want to open a Document in Docket and see its current version,
so that I always work from the latest file, not a stale copy.

## Acceptance Criteria

1. Given a Document linked to a Drive file, When I open it in Docket, Then I see the file's Drive last-modified timestamp and a link that opens the live file in Drive. [Source: epics.md#Story-1.4]
2. Given Docket never stores file content, When I view any Document, Then no file content is duplicated or cached within Docket. [Source: epics.md#Story-1.4]

## Tasks / Subtasks

- [x] Task 1: `DocumentViewer` application service (AC: #1, #2)
  - [x] `application/DocumentViewer.ts` — `getDocument({documentId, firmId})`: loads the `Document` (404 if not found/not in Firm — existing `findFirst`-based scoping). Loads the Firm's `DriveConnection`; if missing or revoked, returns the Document with `drive: {available: false, reason: "..."}` rather than throwing — a Document's own Status/Deadline history must stay viewable even when Drive access currently isn't (this is Story 1.2's AC #3 territory, now actually exercised). Otherwise calls `DriveConnector.getFileMetadata` (this story is the first to exercise the real implementation Story 1.2 wrote but never tested) and `resolveLink` (same — first real exercise) for the linked `driveFileId`; if either throws (file deleted/moved — PRD Open Question 4), same graceful `{available: false}` fallback, never an error response.
  - [x] AC #2 needs no new code, same reasoning as Story 1.3's AC #2 — the service returns metadata (a timestamp, a URL string) and never touches file bytes; there is no code path that could cache content because nothing ever fetches it.
- [x] Task 2: Repository extension + API route (AC: #1)
  - [x] Add `findById(id): Promise<Document | null>` to `DocumentRepository` (`application/DocumentDetection.ts`) and `PrismaDocumentRepository` — `findFirst`, same firmId-scoped pattern as every other repository's lookup method.
  - [x] `GET /api/documents/:id` — staff roles only (Paralegal, Attorney of Record, Office Manager; Client excluded, same reasoning as `GET /api/matters/:id` in Story 1.1 — Client visibility isn't built until Epic 5), generic 404 for a Document outside the caller's Firm.
- [x] Task 3: Tests (AC: #1, #2)
  - [x] Unit: `DocumentViewer.getDocument` against fakes — returns Drive metadata+link when the connection is active and the Drive calls succeed; falls back to `available: false` (not an error) when there's no connection, a revoked connection, or the Drive calls throw; throws `DocumentNotFoundError` for an unknown Document.
  - [x] Integration (PGlite-backed, Drive SDKs mocked): a Document with an active connection and a real (mocked) file returns `available: true` with the metadata/link the mock provided; a Document whose Firm has no connection returns `available: false` without erroring.
  - [x] Integration/route: `GET /api/documents/:id` end-to-end — 200 with drive info, 404 cross-Firm, 401/403 role gates, `available: false` case still returns 200 (the Document itself was found; only the Drive portion is unavailable).

## Dev Notes

- **This story is the first real exercise of `GoogleDriveApiAdapter.getFileMetadata`/`resolveLink`**, written in Story 1.2 but only ever called there for folder-access verification (`getFileMetadata` on a folder ID) — never on a Document's actual `driveFileId`, and `resolveLink` was untouched entirely. No adapter changes expected, but don't assume it's already proven correct for this call shape.
- **Graceful degradation is the point, not error handling to bolt on later.** EXPERIENCE.md's State Patterns already describe this: a revoked connection or a moved/deleted Drive file both mean "the affordance goes inactive," never "the Document disappears or the API 500s." `DocumentViewer` should read as designed for this from the start.
- **Reuses everything established:** `DriveConnectionRepository` (Story 1.2), `DocumentRepository` (Story 1.3, extended here), the firmId-scoped-404 pattern (Story 1.1), `tests/helpers/testDb.ts` (no new migration this story — no schema change needed, `Document`/`DriveConnection` already have everything this story reads).
- **No schema change this story** — first story in the Epic without one. Worth confirming that's really true before assuming it (checked: `Document.driveFileId` and `DriveConnection` already carry everything needed).

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.4]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/ARCHITECTURE-SPINE.md — AD-2 (DriveConnector.resolveLink named specifically for this story)]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Docket-2026-08-05/EXPERIENCE.md — State Patterns ("Drive connection revoked", "Drive file deleted or moved")]
- [Source: _bmad-output/implementation-artifacts/1-1, 1-2, 1-3 — previous stories, patterns above]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `npx tsc --noEmit` — clean
- `npx vitest run` — 13 files, 95 tests passed
- `npx eslint .` — clean
- `npx next build` — succeeded; `/api/documents/[id]` present in the route list as a dynamic route

### Completion Notes List

- Added `findById` to `DocumentRepository` (`application/DocumentDetection.ts`) and `PrismaDocumentRepository`, following the same `findFirst`-based firmId-scoping pattern as every other repository lookup.
- `DocumentViewer.getDocument` never throws for Drive-unavailability: no connection, a revoked connection, and a Drive call throwing (deleted/moved file) all resolve to `{ available: false, reason }`. It throws `DocumentNotFoundError` only when the `Document` row itself isn't found/not in the caller's Firm — mirrors Story 1.1's cross-Firm-404 pattern.
- `GET /api/documents/:id` restricts to staff roles (Paralegal, Attorney of Record, Office Manager); Client is excluded pending Epic 5, same reasoning as `GET /api/matters/:id`.
- This is the first real exercise of `GoogleDriveApiAdapter.getFileMetadata`/`resolveLink` against an actual Document's `driveFileId` (Story 1.2 only ever called `getFileMetadata` against a folder ID for access verification, and never called `resolveLink` at all) — both worked as written, no adapter changes needed.
- No schema/migration change this story, confirmed `Document.driveFileId` and `DriveConnection` already carried everything needed.
- Full verification suite green: `tsc --noEmit`, `vitest run` (95/95), `eslint .`, `next build`.

### File List

- `application/DocumentDetection.ts` (modified — added `findById` to `DocumentRepository` interface)
- `application/DocumentViewer.ts` (new)
- `adapters/db/documentRepository.ts` (modified — added `findById`)
- `app/api/documents/[id]/route.ts` (new)
- `tests/unit/documentViewer.test.ts` (new)
- `tests/unit/documentDetection.test.ts` (modified — added `findById` mock to `makeRepo()`)
- `tests/integration/documentsRoute.test.ts` (new)

## Change Log

- 2026-08-05: Story 1.4 implemented — `DocumentViewer` application service, `GET /api/documents/:id` route, `DocumentRepository.findById`, unit + integration tests. Status set to `review`.
