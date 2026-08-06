---
baseline_commit: NO_VCS
---

# Story 1.2: Connect Google Drive to a Matter

Status: review

## Story

As an Office Manager,
I want to connect my Firm's Google Drive account and link a Matter to a Drive folder,
so that Docket knows where to find that Matter's documents.

## Acceptance Criteria

1. Given I'm authenticated, When I connect a Google Drive account, Then Docket stores the OAuth connection for my Firm — not any file content. [Source: epics.md#Story-1.2]
2. Given a Matter, When I link it to a specific Drive folder, Then that folder becomes the watched source for that Matter's Documents. [Source: epics.md#Story-1.2]
3. Given the Drive connection is later revoked, When existing Documents are viewed, Then their status/deadline history persists, but file links show as inactive. [Source: epics.md#Story-1.2] — **scope note:** `Document` doesn't exist until Story 1.3. This story guarantees the connection's revoked state is persisted and queryable (soft-revoke, never deleted); the Document-level "file links show as inactive" rendering is Story 1.3's to finish once Document exists. Don't skip logging the revoked state now just because the visible payoff lands later.

## Tasks / Subtasks

- [x] Task 1: Prisma schema — `DriveConnection` model + `Matter.driveFolderId` (AC: #1, #2, #3)
  - [x] Add `DriveConnection` model, Firm-scoped: `id` (UUID), `firmId` (unique — one connection per Firm), `accessTokenEncrypted`, `refreshTokenEncrypted` (both `String`, ciphertext — see Task 2's cipher), `expiresAt` (`DateTime` — `DriveConnector.connect` returns this; persist it now so a future token-refresh story has a data source, rather than leaving it silently dropped), `revokedAt` (nullable `DateTime`), `createdAt`, `updatedAt`.
  - [x] Add `driveFolderId` (nullable `String`) to `Matter` — set when a folder is linked; `null` means not yet connected.
  - [x] Migration. `DriveConnection` joins `FIRM_SCOPED_MODELS` in `firmScopeExtension.ts` (Story 1.1 built this specifically to be reused — this is that reuse).
- [x] Task 2: Token encryption at rest (AD-8) (AC: #1)
  - [x] `adapters/crypto/tokenCipher.ts` — AES-256-GCM `encrypt(plaintext: string): string` / `decrypt(ciphertext: string): string`, key from `process.env.TOKEN_ENCRYPTION_KEY` (32-byte, base64). Use Node's built-in `crypto` module — no new dependency for something the standard library already does well.
  - [x] Never log a raw token anywhere — encrypt before any `console.log`/structured-log call touches it, per AD-8's "excluded by name from the structured-logging convention."
- [x] Task 3: `DriveConnector` port + `GoogleDriveApiAdapter` (AD-2) (AC: #1, #2)
  - [x] `ports/DriveConnector.ts` — matches AD-2's named interface exactly: `connect`, `listNewFiles`, `getFileMetadata`, `resolveLink`, `uploadFile`. No invented `verifyFolderAccess` method.
  - [x] `adapters/drive/googleDriveApiAdapter.ts` — implements `connect` (OAuth2 code exchange, using `@googleapis/drive` + `google-auth-library`) for real. Folder-access verification (AC #2) is `getFileMetadata(folderId)`. `listNewFiles`/`resolveLink`/`uploadFile` are real, complete Drive API v3 wrapper calls (not stubs) — not exercised by this story's tests, per plan.
  - [x] Application/domain code depends only on the `DriveConnector` interface, never on `@googleapis/drive` directly (AD-2). (Note: `OAuth2Client` is imported from `googleapis-common`, not the top-level `google-auth-library` package — see Debug Log.)
- [x] Task 4: Application services (AC: #1, #2, #3)
  - [x] `application/DriveOnboarding.ts` — Firm-level: `connectAccount`/`revokeAccount`, find-then-create-or-update pattern (no `.upsert()`, matching `firmScopeExtension`'s allow-list).
  - [x] Extended `application/MatterOnboarding.ts` with `linkDriveFolder` — active-connection check, `getFileMetadata` folder-access verification, `parseDriveFolderReference` handles bare ID / full URL / trailing query string / trailing slash.
- [x] Task 5: API routes (AC: #1, #2)
  - [x] `GET /api/drive/oauth/start` — Office Manager only; redirects to Google's consent URL.
  - [x] `GET /api/drive/oauth/callback` — exchanges `code`, returns `{ connected: true }`. **The flagged session/redirect gap is fixed, not just noted:** `app/api/_lib/oauthState.ts` implements the standard OAuth `state`-param pattern (HMAC-signed, carries `firmId` through the redirect) instead of relying on `resolveSession`'s headers, which genuinely cannot survive a browser-initiated redirect. See Debug Log.
  - [x] `POST /api/matters/:id/drive-folder` — Office Manager only; `{ folder }` body; `VALIDATION_ERROR`/`NOT_FOUND`/`FAILED_PRECONDITION` error codes as specified (412/404/400 status).
  - [x] All routes reuse `resolveSession` (the two Office-Manager-gated ones) or the signed state (the callback).
- [x] Task 6: Tests (AC: #1, #2, #3)
  - [x] Unit: `tokenCipher` round-trip, tampered-ciphertext rejection, malformed-string rejection.
  - [x] Unit: `DriveOnboarding.connectAccount`/`revokeAccount` against fakes (no DB, no real Google calls).
  - [x] Unit: `MatterOnboarding.linkDriveFolder` + `parseDriveFolderReference` — all specified cases plus NOT_FOUND/FAILED_PRECONDITION/VALIDATION_ERROR paths.
  - [x] Integration (PGlite-backed, `googleapis-common`/`@googleapis/drive` mocked via `vi.mock`): encrypted persistence, folder linking, revoke-without-delete, revoke doesn't clear an existing link.
  - [x] Integration/route: all three routes end-to-end, including both OAuth routes (not just the folder-link route).

## Dev Notes

- **This story resolves a real open architecture decision.** ARCHITECTURE-SPINE.md's Deferred section explicitly punted the concrete `DriveConnector` adapter (custom Google API client vs. an MCP-driver-backed one) to "a short implementation-time spike during Story 1.2." `[ASSUMPTION]` This story resolves it: **official `@googleapis/drive` + `google-auth-library`** (Google's own Node SDKs), not an MCP driver. Reasoning: MCP (Model Context Protocol) is designed for LLM-agent tool use, not standard backend service-to-service OAuth — using it here would be a genuinely unusual choice with no real precedent, more moving parts (running an MCP client/server) for zero functional benefit over a standard, well-documented OAuth2 flow that `google-auth-library` already handles correctly (including refresh-token rotation). Verify this reasoning still holds before implementing; it's a real commitment, not a formality. `@googleapis/drive` was `20.2.0` and `google-auth-library` was `11.0.0` as of this story's authoring (Aug 2026, web-verified) — confirm current versions before installing, the same discipline Story 1.1 used for its Stack table.
- **No real Google OAuth credentials exist in this environment.** There is no Google Cloud project, Client ID/Secret, or way to complete a live browser OAuth consent flow here. Build and test the code for real (Task 6's integration tests mock `google-auth-library`/`@googleapis/drive` — the same pattern Story 1.1 used for PGlite standing in for "no live Postgres"), but do not expect to smoke-test a real end-to-end OAuth handshake in this environment. Flag that gap in Completion Notes the way Story 1.1 flagged its own untestable-in-this-environment items, rather than silently skipping it.
- **AC #3's "existing Documents... file links show as inactive"** can't be fully realized yet — `Document` is Story 1.3's model. Scope this story to the `DriveConnection`/`Matter` half (revoked state persists, never hard-deleted) and hand the Document-rendering half to Story 1.3 explicitly — see the AC's scope note above. Don't quietly drop the requirement; make sure whoever builds Story 1.3 can find this note.
- **Reuses Story 1.1's infrastructure directly:** `firmScopeExtension.ts`'s `FIRM_SCOPED_MODELS` allow-list (add `DriveConnection` to it — this is exactly the reuse Story 1.1's review flagged as needing to happen "when the next firm-scoped entity is added"), `resolveSession` (no new auth mechanism), the `{ error: { code, message } }` envelope, the PGlite-backed integration-test pattern, and the `globalThis`-cached Prisma client.
- **UX (EXPERIENCE.md):** Matter creation (Story 1.1) and Drive-folder connection (this story) are meant to feel like **one combined onboarding moment** in the eventual UI, even though they're separate API calls — `MatterOnboarding.linkDriveFolder` should be callable immediately after `createMatter` in the same request flow a future UI story wires up. Still Office-Manager-only, matching Story 1.1's role gate.
- **Secrets discipline (AD-8):** OAuth tokens are encrypted before the Prisma write and excluded from structured logs. This is enforced by code review last time, not by a lint rule yet — be deliberate about it, the same way Story 1.1 had to be deliberate about `firmId` scoping before AD-1 had a shared enforcement point. Store the AES-256-GCM IV and auth tag alongside the ciphertext in one string (e.g. `base64(iv):base64(authTag):base64(ciphertext)`) so `decrypt` is self-contained — don't split them across separate columns.
- **`adapters/crypto/` is a new top-level adapter category**, not one of the four named in ARCHITECTURE-SPINE.md's source tree (`drive`, `email`, `auth`, `db`). That's an intentional, small addition for this story (token encryption doesn't fit any of the four), not an oversight — worth a one-line note in Completion Notes so it doesn't look like a missed convention.
- **IDs/dates/error envelope:** same conventions as Story 1.1 (UUIDv4 app-side, ISO-8601 UTC, `{ error: { code, message } }`).

### Previous Story Intelligence (from 1-1-create-a-matter.md)

- **Prisma 7 specifics that still apply:** no `$use` middleware (use `$extends`); `datasource` has no `url` field (lives in `prisma.config.ts`); `PrismaClient` requires an explicit driver adapter; `provider = "prisma-client"` with an `output` path in the generator block. Migration SQL must be generated offline via `prisma migrate diff --from-empty --to-schema` (not `--to-schema-datamodel`, which doesn't exist in this version) since there's still no live Postgres in this environment — apply the new migration to a fresh PGlite instance in tests the same way `firmScopeExtension.test.ts` does.
- **Turbopack import gotcha:** use extensionless relative imports (`from "./prisma"`, not `from "./prisma.js"`) — the `.js`-extension-for-`.ts`-file convention resolves fine under `tsc`/Vitest/`tsx` but fails to resolve under `next build`'s Turbopack bundler.
- **`firmScopeExtension` is a strict allow-list**, not a blanket filter — `DriveConnection` must be explicitly added to `FIRM_SCOPED_MODELS`, or it will pass through completely unscoped (the extension's fallback for unregistered models is "no scoping applied," by design, not an error).
- **Review discipline that held up well last time:** an independent fresh-context code review caught a real bug (a firm-reassignment bypass via `updateMany`'s `data.firmId`) that inline self-review missed. Expect `bmad-code-review` after this story too — code that would embarrass you in front of a fresh reviewer (silently-swallowed errors, untested route handlers, missing role checks) is worth catching before that pass, not after.
- **Route-handler tests matter, not just service/extension-level tests.** Story 1.1 initially only tested `MatterOnboarding` and `firmScopeExtension`, and code review flagged that the actual HTTP routes enforcing the ACs were untested. Task 6 here includes a route-level test from the start.

### Project Structure Notes

```
docket/
  app/api/drive/oauth/start/route.ts      # GET, redirects to Google consent
  app/api/drive/oauth/callback/route.ts   # GET, exchanges code, stores connection
  app/api/matters/[id]/drive-folder/route.ts  # POST, links a folder to a Matter
  application/DriveOnboarding.ts          # new — Firm-level connect/revoke
  application/MatterOnboarding.ts         # extended — + linkDriveFolder
  ports/DriveConnector.ts                 # new — the named architecture port
  adapters/drive/googleDriveApiAdapter.ts # new — implements DriveConnector
  adapters/crypto/tokenCipher.ts          # new — AES-256-GCM encrypt/decrypt
  adapters/db/firmScopeExtension.ts       # extended — FIRM_SCOPED_MODELS += DriveConnection
  prisma/schema.prisma                    # extended — DriveConnection model, Matter.driveFolderId
```

No conflicts with existing code — `MatterOnboarding.ts` and `firmScopeExtension.ts` are extended, not rewritten; everything else is new.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/ARCHITECTURE-SPINE.md — AD-2 (DriveConnector port), AD-8 (secret encryption), Design Paradigm, Deferred ("Concrete DriveConnector adapter... short implementation-time spike during Story 1.2")]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Docket-2026-08-05/EXPERIENCE.md — Information Architecture ("Matter + Drive Onboarding" combined step), Roles & Permissions]
- [Source: _bmad-output/planning-artifacts/prds/prd-Docket-2026-08-04/prd.md — FR-1, addendum.md "Drive Integration — Mechanism"]
- [Source: _bmad-output/implementation-artifacts/1-1-create-a-matter.md — previous story, patterns and gotchas above]

## Open Questions (not blockers, flagged for the backlog)

1. The MCP-driver-vs-custom-API decision is resolved here as an `[ASSUMPTION]` (custom API), not confirmed by a human. Worth an explicit nod from Felipe given it overrides the brainstorm's original framing.
2. No story yet builds real Google Cloud OAuth credentials/project setup — purely an operational/deployment task, not a code task, but someone needs to actually create the OAuth Client ID before this ever works outside tests.
3. `TOKEN_ENCRYPTION_KEY` provisioning (where the encryption key itself comes from/is stored in each environment) isn't specified by any AD — assumed to be an env var for now, same treatment as `DATABASE_URL`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **@googleapis/drive's OAuth2Client type is not the same class as the top-level `google-auth-library` package's**, even at matching major versions — `@googleapis/drive` depends on its own nested `google-auth-library` (via `googleapis-common`), and TypeScript treats the two `OAuth2Client` classes as structurally incompatible (a private `redirectUri` field triggers a hard type error passing one to `drive({auth})`). Fixed by importing `OAuth2Client` from `googleapis-common` directly (added as an explicit dependency) instead of the top-level `google-auth-library` package — that's the exact class `@googleapis/drive`'s own `auth` export uses internally. Consequence: the top-level `google-auth-library` package ended up unused and was removed (`npm uninstall`) rather than left as dead weight.
- **`firmScopeExtension`'s strict allow-list has no `upsert`.** The story's own Task 4 already flagged this, but worth confirming it held: `DriveOnboarding.connectAccount` uses `findFirst` then `create`/`updateMany`, never `.upsert()`.
- **The session/OAuth-redirect gap flagged in the story (Task 5) was fixed, not left open.** OAuth's own `state` parameter is the standard mechanism for exactly this problem (carrying app context through a third-party redirect) — `app/api/_lib/oauthState.ts` HMAC-signs `{firmId}` into `state` at `/oauth/start` (after the Office-Manager check) and verifies it at `/oauth/callback`, which trusts the signature rather than needing `resolveSession`'s headers to survive the redirect (they can't).
- **Prisma migration generated by hand, not `prisma migrate diff`.** `--from-migrations` mode requires a shadow database connection even offline — unavailable in this environment (same root cause as Story 1.1's `--from-empty` workaround, one step further). Hand-wrote `20260805100000_drive_connection/migration.sql` matching Prisma's own generated-SQL conventions (verified by successfully applying it via PGlite in every integration test — if the SQL were wrong, every test in this story would fail at `beforeEach`, not just the ones exercising the new columns). Also had to create `prisma/migrations/migration_lock.toml` by hand — Story 1.1's first migration was generated via `--from-empty`, which doesn't produce one, and `prisma migrate diff --from-migrations` refuses to run without it.
- **Extracted a shared `tests/helpers/testDb.ts`** that applies every migration file in the directory (sorted), not just the first one. Story 1.1's two integration test files only applied `20260805000000_init` — adding this story's second migration broke both of them (`the column "driveFolderId" does not exist`) until fixed. Centralizing migration loading means the next story's migration can't silently go untested by earlier stories' tests the same way again.

### Completion Notes List

- All 6 tasks and their subtasks completed, matching AC #1 and #2 fully. AC #3 is scoped per the story's own note: `DriveConnection.revokedAt` persists correctly (tested), the Document-level "file links show as inactive" rendering is explicitly Story 1.3's to finish.
- 65 tests passing (36 new for this story: 4 tokenCipher, 6 DriveOnboarding, 11 linkDriveFolder/parseDriveFolderReference, 5 driveConnection integration, 11 driveRoutes integration — plus Story 1.1's 29, all still green after the schema change). `tsc --noEmit`, `eslint .`, and `next build` all pass cleanly.
- **New dependencies:** `@googleapis/drive` (21.0.0), `googleapis-common` (8.0.3, for the `OAuth2Client` type-compat reason above). `google-auth-library` was installed then removed once unused (see Debug Log) — never shipped in a state where it was dead weight.
- **Known gap, not fixed here (out of this story's scope, same category as Story 1.1's PGlite-vs-real-Postgres gap):** no real Google Cloud OAuth Client ID/Secret exist in this environment, so the actual OAuth consent screen and token exchange were never exercised against real Google servers — only against mocked `googleapis-common`/`@googleapis/drive`. The mocks are shaped to match the real SDKs' documented response shapes, but a manual smoke test against a real Google Cloud project is recommended once one exists.
- `listNewFiles`, `resolveLink`, and `uploadFile` on `GoogleDriveApiAdapter` are real, complete implementations (not stubs) but have zero test coverage from this story — that's intentional per the story's own plan (Stories 1.3, 1.4, and 6.1 respectively own testing them when they're first called), but flagging so it's not mistaken for accidentally-untested code.
- `TOKEN_ENCRYPTION_KEY` and `OAUTH_STATE_SECRET` are two separate secrets (both 32-byte base64, generated the same way) — kept distinct on purpose so rotating one doesn't invalidate the other's trust boundary. Both added to `.env`/`.env.example`, neither has a real provisioning story yet (same category as Story 1.1's `DATABASE_URL` — assumed env-var for now).

### File List

**Schema / migrations:**
- `prisma/schema.prisma` (modified — `Matter.driveFolderId`, `DriveConnection` model, `Firm.driveConnection` relation)
- `prisma/migrations/20260805100000_drive_connection/migration.sql`
- `prisma/migrations/migration_lock.toml`

**Domain / ports / application / adapters:**
- `domain/DriveConnection.ts`
- `domain/Matter.ts` (modified — `driveFolderId` field)
- `ports/DriveConnector.ts`
- `application/DriveOnboarding.ts`
- `application/MatterOnboarding.ts` (modified — `linkDriveFolder`, `parseDriveFolderReference`, `DriveFolderLinkError`)
- `adapters/crypto/tokenCipher.ts`
- `adapters/drive/googleDriveApiAdapter.ts`
- `adapters/db/driveConnectionRepository.ts`
- `adapters/db/matterRepository.ts` (modified — `setDriveFolder`)
- `adapters/db/firmScopeExtension.ts` (modified — `DriveConnection` added to `FIRM_SCOPED_MODELS`)

**API (driving adapter):**
- `app/api/drive/oauth/start/route.ts`
- `app/api/drive/oauth/callback/route.ts`
- `app/api/matters/[id]/drive-folder/route.ts`
- `app/api/_lib/oauthState.ts`

**Config:**
- `package.json` / `package-lock.json` (modified — `@googleapis/drive`, `googleapis-common`)
- `.env` / `.env.example` (modified — `TOKEN_ENCRYPTION_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `OAUTH_STATE_SECRET`)

**Tests:**
- `tests/helpers/testDb.ts` (new shared helper)
- `tests/unit/tokenCipher.test.ts`
- `tests/unit/driveOnboarding.test.ts`
- `tests/unit/matterOnboarding.test.ts` (modified — `linkDriveFolder`/`parseDriveFolderReference` tests added)
- `tests/integration/driveConnection.test.ts`
- `tests/integration/driveRoutes.test.ts`
- `tests/integration/firmScopeExtension.test.ts` (modified — uses shared `testDb` helper)
- `tests/integration/mattersRoute.test.ts` (modified — uses shared `testDb` helper)

## Change Log

- 2026-08-05 — Initial implementation. `DriveConnection` schema + migration, AES-256-GCM token encryption (AD-8), `DriveConnector` port + `GoogleDriveApiAdapter` (resolving the architecture's deferred MCP-vs-custom-API decision in favor of the official Google SDKs), `DriveOnboarding` + extended `MatterOnboarding.linkDriveFolder`, three new API routes including a real fix (signed OAuth `state` param) for the session/redirect gap the story itself flagged, and 36 new tests (65 total, all passing). Extracted a shared `tests/helpers/testDb.ts` after Story 1.1's tests broke against the new migration. Status → review.
