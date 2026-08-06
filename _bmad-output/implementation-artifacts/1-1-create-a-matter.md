---
baseline_commit: NO_VCS
---

# Story 1.1: Create a Matter

Status: done

## Story

As an Office Manager,
I want to create a new Matter for a case,
so that Docket has a place to track that case's documents.

## Acceptance Criteria

1. Given I'm authenticated to my Firm, When I create a new Matter with a name and client, Then a Matter record is created, scoped to my Firm. [Source: epics.md#Story-1.1]
2. Given a Matter exists under Firm A, When a user authenticated to Firm B attempts to access it by direct ID, Then the request is denied — no cross-Firm exposure. [Source: epics.md#Story-1.1, ARCHITECTURE-SPINE.md#AD-1]

## Tasks / Subtasks

- [x] Task 1: Prisma schema — `Firm` and `Matter` models (AC: #1, #2)
  - [x] Add `Firm` model (`id` UUID, `name`) — minimal, since Firm provisioning itself is out of scope for v1 (ARCHITECTURE-SPINE.md Deferred: "Firm-provisioning process/tool"); this story only needs the table to exist as Matter's FK target.
  - [x] Add `Matter` model: `id` (UUID, app-generated per convention — not Prisma's default `cuid()`), `firmId` (FK → Firm, required), `name`, `client` (plain text at this stage — the actual Client-login relationship is Epic 5's `ClientAccess`, not this field), `createdAt`, `updatedAt`.
  - [x] Migration + a seed script creating exactly one `Firm` row for local dev use (no UI/API creates a Firm in v1). This is about the *product* surface, not test fixtures — integration tests (Task 5) are free to insert additional `Firm` rows directly via Prisma to construct cross-Firm scenarios; that's test setup, not a product feature.
- [x] Task 2: Firm-scoping enforcement shared by all future entities (AC: #2)
  - [x] Implement the `firmId`-scoping Prisma Client Extension per AD-1 (`$extends` with an `$allModels`/`$allOperations` query component that injects/validates the `firmId` filter). **Do not use `$use` middleware** — removed entirely in Prisma 7 (see Dev Notes).
  - [x] Ban `$queryRaw`/`$executeRaw` everywhere outside `adapters/db/` (AD-1's enforceable half) — back this with an ESLint rule or a CI grep check, not developer discipline alone.
  - [x] This is the first story to need this piece — build it to be reused by every later entity (Document, ClientAccess, AuditEntry, ...), not Matter-specific.
- [x] Task 3: Domain model + `MatterOnboarding` application service — `createMatter` (AC: #1)
  - [x] `domain/Matter.ts` — the domain type/entity, distinct from the Prisma-generated persistence type (hexagonal paradigm: domain has no outward dependencies, including on Prisma's generated client types).
  - [x] `application/MatterOnboarding.ts`: `createMatter({ firmId, name, client })` → validates `name` and `client` are non-empty (reasonable max length, e.g. 200 chars), calls the firmId-scoped Matter repository, returns the created Matter.
  - [x] Design this service to be extended by Story 1.2 (Drive-folder connection) as a second step of the *same* onboarding flow — see Dev Notes on the combined-UI requirement. Do not build a Drive-connection stub here; just don't paint this service into a corner.
- [x] Task 4: API route (AC: #1, #2)
  - [x] `POST /api/matters` — resolves session (`userId`, `firmId`, `role`) before calling `MatterOnboarding.createMatter`; **Office Manager role only** (EXPERIENCE.md Roles & Permissions) — a non-Office-Manager caller gets `403` with error code `FORBIDDEN`.
  - [x] `GET /api/matters/:id` — firmId-scoped fetch; a cross-Firm request returns a generic `404` with error code `NOT_FOUND`, never a `403` that would confirm the record exists (EXPERIENCE.md State Patterns: "Cross-Firm access attempt... shows a generic 'not found'").
  - [x] All error responses use the `{ error: { code, message } }` envelope (Consistency Conventions); validation failures use code `VALIDATION_ERROR`.
  - [x] Note: this route accepts the Matter fields only — the "New Matter" *form UI* combining this with Drive-folder connection belongs to whichever of Story 1.1/1.2 picks it up; don't let it fall through the gap between the two.
- [x] Task 5: Tests (AC: #1, #2)
  - [x] Unit: `MatterOnboarding.createMatter` produces a Matter scoped to the calling Firm.
  - [x] Integration: create a Matter as Firm A; a session authenticated to Firm B requesting it by ID gets 404, not the record, not a 403.
  - [x] Verify the Client Extension actually blocks an unscoped query (e.g., a test that attempts to bypass it and expects a failure) — this is the AC #2 enforcement mechanism, not just the happy path.

### Review Findings

- [x] [Review][Patch] `firmScopeExtension`: `updateMany`/`deleteMany` inject `firmId` into `where` but never strip/overwrite `firmId` inside `data` — a scoped client could reassign a row to another Firm via `data.firmId` [adapters/db/firmScopeExtension.ts:34-39] — fixed: `data.firmId` is now overwritten for `updateMany`, covered by a new regression test
- [x] [Review][Patch] `firmScopeExtension`: spreading `args` when Prisma passes `undefined` (e.g. a zero-arg `count()`) throws instead of scoping cleanly [adapters/db/firmScopeExtension.ts:34-39] — fixed: `args ?? {}` before any property access, covered by a new regression test
- [x] [Review][Patch] `resolveSession` trusts client-supplied headers with no environment gate — a full authentication bypass if this stopgap were ever deployed as-is [app/api/_lib/session.ts] — fixed: refuses to resolve when `NODE_ENV === "production"`
- [x] [Review][Patch] `POST /api/matters` crashes with an uncaught 500 on a JSON body of the literal `null` instead of returning 400 [app/api/matters/route.ts:23] — fixed: explicit `null`/non-object check before field access, covered by a new route test
- [x] [Review][Patch] `GET /api/matters/:id` has no role check — any authenticated role, including Client, can fetch any Matter in the Firm (Client grants don't exist until Epic 5) [app/api/matters/[id]/route.ts] — fixed: restricted to staff roles (Paralegal, Attorney of Record, Office Manager), covered by new route tests
- [x] [Review][Patch] `GET /api/matters/:id` calls `PrismaMatterRepository` directly, bypassing the application-service layer (ARCHITECTURE-SPINE.md Design Paradigm: driving adapters "never into adapters or the DB directly") [app/api/matters/[id]/route.ts] — fixed: added `MatterOnboarding.getMatter`, route now calls that
- [x] [Review][Patch] No test exercises the actual HTTP route handlers — AC #2's literal scenario (a Firm-B session requesting a Firm-A Matter by ID → 404) is only verified at the extension/repository layer, not through the route [tests/] — fixed: `tests/integration/mattersRoute.test.ts` added, 11 tests calling the real route handlers against a PGlite-backed DB
- [x] [Review][Patch] Prisma client singleton in `adapters/db/prisma.ts` isn't cached on `globalThis` — a known Next.js dev-mode HMR pitfall that can exhaust DB connections [adapters/db/prisma.ts] — fixed: cached on `globalThis`
- [x] [Review][Patch] `PrismaMatterRepository.create` silently discards `input.firmId` in favor of the constructor-bound `firmId` instead of asserting they match — misleading interface [adapters/db/matterRepository.ts] — fixed: throws on mismatch instead of silently overriding, covered by a new unit test
- [x] [Review][Patch] `tailwindcss`/`@tailwindcss/postcss` installed but nothing wires them up — no UI story needs them yet [package.json] — fixed: removed via `npm uninstall`
- [x] [Review][Patch] `package-lock.json` exists (npm-generated) but wasn't listed in the File List [1-1-create-a-matter.md] — fixed: added to File List
- [x] [Review][Patch] `MatterOnboarding.createMatter` accepts a whitespace-only `firmId` (only checked for falsy, not trimmed) [application/MatterOnboarding.ts] — fixed: `firmId` trimmed before the check, covered by a new unit test
- [x] [Review][Defer] `FIRM_SCOPED_MODELS` is a manually-maintained allow-list with nothing enforcing it stays in sync with the schema as new entities are added — deferred, real but not a Story 1.1 blocker; revisit when the next firm-scoped entity (Document, Story 1.3) is added [adapters/db/firmScopeExtension.ts]
- [x] [Review][Defer] No audit trail (`createdByUserId`) recorded for who created a Matter — deferred, not required by any current AC/AD; worth a product call, not a code defect [adapters/db/matterRepository.ts]
- [x] [Review][Defer] Seed script has a benign check-then-create race condition — deferred, dev-only script, low real-world impact [prisma/seed.ts]
- [x] [Review][Defer] No DB-level length/non-empty constraints on `name`/`client`, only app-layer validation — deferred, defense-in-depth, not required by any AD [prisma/schema.prisma]
- [x] [Review][Defer] No explicit `onDelete` policy on the Firm→Matter relation — deferred, Firm deletion isn't a feature yet [prisma/schema.prisma]
- [x] [Review][Defer] `findUnique`/`update`/`delete`/`upsert` rejection in `firmScopeExtension` is only exercised via `findUnique` in tests — deferred, exercise the rest when a real update/delete path exists [tests/integration/firmScopeExtension.test.ts]

## Dev Notes

- **Paradigm (ARCHITECTURE-SPINE.md):** hexagonal / ports & adapters. This story touches `domain/` (Matter), `application/` (MatterOnboarding — new), `adapters/db/` (Prisma repository + the firmId-scoping extension — new, shared), `app/api/matters` (route). No route handler may write to the repository directly — always through `MatterOnboarding`.
- **AD-1 (Firm-scoped isolation) is the load-bearing rule for this story.** Every Matter row carries `firmId`; every read/write goes through the repository's mandatory filter; raw SQL is banned outside `adapters/db/`. This is what AC #2 actually tests.
- **Prisma 7 breaking change:** middleware (`$use`) was **removed** in Prisma ORM 7 — the replacement is Client Extensions (`$extends`) with query components. If you reach for `$use` from older training data or docs, it will not exist in this version. [Source: web verification, Aug 2026 — Prisma docs "Client extensions: query component"]
- **Roles:** Only Office Manager may create a Matter (EXPERIENCE.md Roles & Permissions table — Office Manager inherits Attorney of Record's and Paralegal's abilities and adds Matter creation, Delegated Approval, and Client Access grant/revoke on top).
- **UX note — do not build a dead-end screen:** EXPERIENCE.md specifies Matter creation and Drive-folder connection (Story 1.2) as **one combined onboarding moment** in the UI, even though they're two sequenced backend calls. This story implements only the Matter-creation backend/API — build `MatterOnboarding` and the route so Story 1.2 can extend the same flow, not as a standalone "Matter created" screen that gets awkwardly retrofitted.
- **IDs:** UUIDv4, generated application-side, not a DB default. **Dates:** ISO-8601 UTC.
- **No previous story exists** — this is Epic 1's first story; no prior dev-notes/git history to inherit (project has no git repository yet either).

### Project Structure Notes

```
docket/
  app/api/matters/route.ts        # POST (create)
  app/api/matters/[id]/route.ts   # GET (firmId-scoped fetch)
  application/MatterOnboarding.ts
  domain/Matter.ts
  adapters/db/matterRepository.ts
  adapters/db/firmScopeExtension.ts   # shared AD-1 enforcement, reused by every later entity
  prisma/schema.prisma             # Firm, Matter models
  prisma/seed.ts                   # single Firm row for dev/test
```

No conflicts or variances — this is the first story in the codebase, nothing existing to reconcile against.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Docket-2026-08-05/ARCHITECTURE-SPINE.md — AD-1, AD-2 (Design Paradigm), Consistency Conventions, Stack, Structural Seed]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Docket-2026-08-05/EXPERIENCE.md — Foundation, Roles & Permissions, Information Architecture ("Matter + Drive Onboarding"), State Patterns ("Cross-Firm access attempt")]
- [Source: _bmad-output/planning-artifacts/prds/prd-Docket-2026-08-04/prd.md — FR-16, NFR-2, Glossary (Matter, Firm)]

## Open Question (not a blocker for this story, flagged for the backlog)

No epic or story in the current backlog implements login/authentication, yet every story's acceptance criteria presuppose "I'm authenticated." `ARCHITECTURE-SPINE.md` names an `AuthProvider` port with the concrete adapter Deferred, but there's no story that builds even a minimal session mechanism. To unblock this story's tests, seed a test session (`userId`, `firmId`, `role`) directly rather than building auth here — but recommend running `bmad-correct-course` or adding an explicit login story before Epic 5 (Client Access) makes the gap unavoidable.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- **Prisma 7 config shape (discovered via execution, not assumed):** `datasource { url = env(...) }` is no longer valid in `schema.prisma` — errors with `P1012`. Connection config now lives in a required `prisma.config.ts` at the project root (`datasource: { url: env("DATABASE_URL") }`), and `PrismaClient` must be constructed with an explicit driver adapter (`@prisma/adapter-pg` for Postgres) — there is no adapter-less constructor path anymore. Generator block also changed: `provider = "prisma-client"` with a required `output` path (the old default `prisma-client-js` in-place generation is gone). [Source: prisma.io upgrade guide, web-verified Aug 2026]
- **Prisma CLI flag rename:** `prisma migrate diff --to-schema-datamodel` was removed in favor of `--to-schema`. Used `migrate diff --from-empty --to-schema` to generate the initial migration SQL offline, since no live Postgres instance is available in this environment — verified the generated SQL by inspection rather than by running it against a real server.
- **No live PostgreSQL available in this environment** (no Docker, no local `psql`/`pg_ctl`). Used `@electric-sql/pglite` + `pglite-prisma-adapter` (both web-verified compatible with Prisma's driver-adapter interface) to run genuine integration tests against an embedded, Postgres-wire-compatible engine, applying the real generated migration SQL before each test. This exercises the actual `firmScopeExtension` and real Prisma queries, not a mock — the closest available proxy for "the real database" without one being present.
- **Turbopack module resolution:** relative imports using the explicit `.js` extension pattern (`from "./prisma.js"` pointing at `prisma.ts`) failed to resolve under `next build`'s Turbopack bundler, even though `tsc`, Vitest, and `tsx` all handle that convention fine. Fixed by using extensionless relative imports throughout (`from "./prisma"`), which all four tooling contexts (Next.js, tsc, Vitest, tsx) resolve consistently.
- `firmScopeExtension` design note (not a bug, a deliberate scope decision): rather than attempting to transparently patch every Prisma operation (including `findUnique`/`update`/`delete`/`upsert` by bare unique key, which can't safely accept an extra `where.firmId` filter), the extension is a strict allow-list — `findMany`/`findFirst`/`count`/`aggregate`/`groupBy`/`updateMany`/`deleteMany` get `firmId` merged into `where`; `create` gets it merged into `data`; everything else throws. This makes "no repository method may accept an unscoped mode" (AD-1) true by construction rather than by convention. `PrismaMatterRepository.findById` uses `findFirst`, not `findUnique`, accordingly.

### Completion Notes List

- All 5 tasks and their subtasks completed. This was Epic 1's first story, so it also stood up the project from nothing: `package.json`, TypeScript, Next.js 16 App Router, Prisma 7 (with the driver-adapter model above), ESLint 9 flat config, and Vitest — all versions matching `ARCHITECTURE-SPINE.md`'s Stack table where one was pinned, and verified against the web where the story's own Dev Notes flagged a risk (Prisma, TypeScript).
- 14 tests written and passing: 8 unit tests for `MatterOnboarding` validation/trimming behavior (mocked repository, no DB), 6 integration tests for `firmScopeExtension` against a real embedded Postgres engine (PGlite) — covering AC #2 directly (cross-Firm `findFirst` returns `null`), the create-time override guarantee (extension wins even if a caller passes a different `firmId`), the strict allow-list rejection of `findUnique`, and that non-scoped models (`Firm` itself) are correctly left untouched.
- `npx tsc --noEmit`, `npx eslint .`, and `npx next build` all pass cleanly. Manually confirmed the raw-SQL ESLint ban actually fires (tested against a throwaway file outside `adapters/db/`, then removed it) rather than trusting an untested rule.
- **Known gap, not fixed here (out of this story's scope):** session/auth is a temporary header-based stopgap (`app/api/_lib/session.ts`, `x-dev-user-id`/`x-dev-firm-id`/`x-dev-role` headers) — see the story's own "Open Question" section, written before implementation began. This is necessary to make the API routes testable/demoable at all, since no story in the backlog builds real authentication yet.
- **Known gap, not fixed here:** could not manually smoke-test `POST`/`GET /api/matters` against a running `next dev` server with a real network request, because no live PostgreSQL instance exists in this environment (only the embedded PGlite used for automated tests). The route logic itself (session → role check → validation → repository → firmId scoping) is exercised by the automated tests and by `next build`'s type/compile checks, but not by an end-to-end HTTP smoke test against `@prisma/adapter-pg`. Recommend a manual smoke test once a real `DATABASE_URL` is available.
- `npm audit` reports 3 high-severity transitive vulnerabilities (via `next`'s bundled `postcss`/`sharp`) fixable only by moving to `next@16.3.0`, currently a preview release outside `ARCHITECTURE-SPINE.md`'s pinned `16.2.x`. Left as-is rather than silently jumping to a preview build; flagging for a deliberate call later.

### File List

**Project scaffolding:**
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `next.config.ts`
- `prisma.config.ts`
- `eslint.config.mjs`
- `vitest.config.ts`
- `.env.example`
- `.env` (gitignored; local placeholder connection string only)
- `.gitignore`

**Database:**
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `prisma/migrations/20260805000000_init/migration.sql`

**Domain / application / adapters (hexagonal layers):**
- `domain/Matter.ts`
- `application/MatterOnboarding.ts`
- `adapters/db/prisma.ts`
- `adapters/db/firmScopeExtension.ts`
- `adapters/db/matterRepository.ts`

**API (driving adapter):**
- `app/api/_lib/session.ts`
- `app/api/_lib/errors.ts`
- `app/api/matters/route.ts`
- `app/api/matters/[id]/route.ts`

**Tests:**
- `tests/unit/matterOnboarding.test.ts`
- `tests/unit/matterRepository.test.ts`
- `tests/integration/firmScopeExtension.test.ts`
- `tests/integration/mattersRoute.test.ts`

## Change Log

- 2026-08-05 — Initial implementation. Scaffolded the Docket project (Next.js 16 / TypeScript 6 / Prisma 7 / ESLint 9 / Vitest) and implemented Story 1.1 end-to-end: `Firm`/`Matter` schema and migration, the AD-1 firmId-scoping Prisma Client Extension (with a strict operation allow-list), `MatterOnboarding.createMatter`, `POST /api/matters` and `GET /api/matters/:id`, and 14 passing tests (8 unit, 6 integration against an embedded Postgres engine). Status → review.
- 2026-08-05 — Addressed code review findings: 12 patches applied (a real firm-reassignment bypass in `updateMany`, an undefined-args crash, an auth-bypass missing an environment gate, a null-body crash, a missing role check on GET, an architecture-paradigm violation on GET, missing route-level tests for AC #2, a Prisma dev-mode HMR connection leak, a misleading discarded-input bug, an unused dependency, a File List gap, and a whitespace-validation gap). Added `tests/integration/mattersRoute.test.ts` (11 tests against real route handlers) and 3 more regression tests. Test count: 14 → 29, all passing. 6 items deferred to `deferred-work.md` (none blocking). Status → done.
