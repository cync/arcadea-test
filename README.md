# Docket

🎥 **[Screen recording with explanations](https://drive.google.com/file/d/1L8tN35CfRRWLX9daRVohR4E1n0onDuTA/view?usp=drive_link)**

**Docket** is an internal, multi-tenant document-workflow tracker built for a single independent law firm (~12 people). It sits on top of the Google Drive a firm already uses — it never stores file content itself — and makes the state of every in-flight document visible to everyone who needs it, even when the attorney of record is unreachable.

**Live demo (UI concept):** **[arcadea-test.lovable.app](https://arcadea-test.lovable.app/)**

> The demo above is an illustrative UI prototype. This repository contains the actual product design and backend implementation (architecture, domain logic, API, and test suite) that the product is built on.

## The problem

Independent law firms run case documents through email, shared drives, and paper. Finding the *current* version of anything becomes its own task, and when the attorney of record is unreachable, nobody else can tell whether a filing is drafted, reviewed, or already sent. Deadlines slip silently.

## What Docket does

- **Document intake from Google Drive** — new files dropped in a Matter's Drive folder are auto-detected and tracked; Docket references the live file, never a copy of its content.
- **Workflow board** — every Document moves through `Draft → Reviewed → Needs Revision → Waiting on Client Signature → Filed/Sent` via explicit user action, never inferred from file activity.
- **Reviewer attribution** — moving a Document to Reviewed requires the reviewer to confirm themselves; the board shows who reviewed it.
- **Deadlines & Aging** — the Attorney of Record sets a per-Document deadline; the board visualizes how long a Document has sat untouched.
- **Stale alerts** — an automated email fires once a Document has been untouched for more than 3 days, sent to the Attorney of Record and the Office Manager, without duplicating on repeat runs.
- **Delegated approval** — the Office Manager can move a Document to Filed/Sent on the attorney's behalf when they're unreachable, recorded distinctly from a standard transition, with a full audit trail (actor, timestamp, target).
- **Fixed ownership** — every Document has exactly one Attorney of Record, reassignable only through an explicit, logged action.
- **Firm-scoped multi-tenancy** — every Matter, Document, and user belongs to exactly one Firm; no query can cross that boundary, enforced at the data-access layer, not just the UI.
- **Client access** *(planned)* — a read-only, RBAC-scoped login so clients can check a Matter's status without calling the firm.
- **Scanned document logging** *(planned)* — ties a paper original to an accountable, timestamped Docket record.

## Architecture

Docket follows a **hexagonal (ports & adapters)** architecture to keep business rules independent of frameworks and external services:

```
domain/        Core entities and pure logic — no outward dependencies
application/   Use cases (MatterOnboarding, StatusTransition, DelegatedApproval, StaleCheck, ...)
ports/         Interfaces the application layer depends on (DriveConnector, EmailNotifier)
adapters/      Concrete implementations of those ports (Google Drive, Resend, Prisma/Postgres)
app/           Next.js API routes — driving adapters, call into application services only
jobs/          Scheduled job runners (Drive scan, stale-document check)
```

Key architectural decisions — firm-scoped data isolation enforced by a strict Prisma Client Extension, a single `StatusTransition` service as the sole writer of Document status, an insert-only audit trail for reassignment/review/delegated-approval events, and more — are recorded in the [architecture spine](_bmad-output/planning-artifacts/architecture/) with the reasoning behind each one.

### Tech stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript**
- **Prisma ORM 7** over **PostgreSQL**
- **Google Drive API** for document indexing
- **Resend** for transactional stale-alert email
- **Vitest**, with integration tests run against a real embedded Postgres-compatible engine ([PGlite](https://github.com/electric-sql/pglite)) rather than mocks

## Project status

Built end-to-end with the [BMad Method](https://github.com/bmad-code-org/BMAD-METHOD) — brainstorming → PRD → UX design → architecture → epics/stories → implementation, with every decision traceable back to a requirement. Start with the **[PRD](PRD.md)**, then see [`_bmad-output/`](_bmad-output/) for the full paper trail: [architecture](_bmad-output/planning-artifacts/architecture/), [UX design](_bmad-output/planning-artifacts/ux-designs/), [epics & stories](_bmad-output/planning-artifacts/epics.md), and per-story implementation notes.

This is currently a backend/API-first implementation — domain logic, application services, and a fully tested API surface — with document intake, the workflow board, deadlines & aging, stale alerts, and delegated approval implemented and under test. Client access and scanned-document logging are planned next; a dedicated UI layer has not yet been built against this API (see the live demo above for the intended UI direction).

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, TOKEN_ENCRYPTION_KEY, etc.
npx prisma generate
npm run dev            # start the app
npm test                # run the full test suite (unit + PGlite-backed integration tests)
```

## Contact

**Felipe Saraiva**
felipe.saraiva@gmail.com
[felipesaraiva.com](https://felipesaraiva.com)
