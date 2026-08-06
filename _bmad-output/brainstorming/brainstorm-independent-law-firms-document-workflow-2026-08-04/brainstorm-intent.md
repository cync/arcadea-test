---
source: brainstorming session (2026-08-04) — independent law firms document workflow
status: ready for PRD input
---

# Brainstorm Intent: Document Workflow for Independent Law Firms

## Problem Statement

Independent law firms lack a proper document management (GED) system due to small team size and limited budget. Case documents are scattered across email, shared drives, and paper, making it its own task just to find the current version. When the attorney is out of office (e.g., in court), there is no visibility into filing status — silently missed deadlines and wrong-version filings result in **financial loss to the business**.

## Target User / Personas

- **Main attorney** — the fixed, single accountable owner of each document regardless of who last touched it. Sets deadlines manually, per case.
- **Paralegal** — touches the document day-to-day; typically first to feel the pain when a version goes missing or a deadline slips.
- **Office manager** — backup approver; needs a delegated approval action to approve/send when the attorney is unreachable.
- **Client** — external party who needs visibility into filing status, scoped by RBAC to only what they're permitted to see.

## Core Job To Be Done

When a case document moves from draft to filed/sent, the firm wants **one place** showing current version, approval status, and deadline — so nothing is missed and the wrong version is never sent.

("Wrong version sent" = an outdated draft filed to court, or an unsigned copy filed to court.)

## Central Insight

The product's real job is **degrading gracefully when the primary document owner (the attorney) goes dark**. Two features are the same insight seen from two angles:
- Aging visualization + stale-item alert → surfaces the risk before it becomes silent.
- Delegated approval (office manager) → provides a path forward when the owner is unreachable.

Combined with **cloud-drive indexing instead of file storage**, this also solves the budget/trust barrier: no migration, no separate document portal, works with what the firm already uses.

## Root Cause

- Independent firms have smaller teams and lower budgets than what proper GED/document management systems require.
- Email-based follow-up fails because people don't reliably follow up — deadlines get silently lost as a result, not because of malice or incompetence.

## MVP Scope — IN

- Status + deadline tracking as the single source of truth per document.
- App does **not** store files — it indexes/organizes files living in a connected cloud drive account (e.g. Google Drive), possibly via an MCP driver rather than a custom-built integration.
- Collaborative, Kanban-style frontend where users manually move items and update status (no automatic inference).
- RBAC for client access, scoped to what each client is permitted to see.
- Aging visualization for each workflow item, with an email alert when an item is untouched for more than 3 days.
- Delegated approval action for the office manager to approve/send when the attorney is unreachable.
- Paper-document scan tracking: flagged as "scanned document" with timestamp + who scanned it.
- Document enters the system from creation, not only once a deadline is assigned.
- Responsive/mobile-capable web app so the attorney can check/update from the courthouse.
- Status granularity beyond a simple binary: states like "reviewed" (by whom), "needs revision," "waiting on client signature."
- Version tracking: only the last saved version matters — not every save/redline pass.

## MVP Scope — OUT (explicit non-goals)

- Sign-off checklists.
- Court filing rules/compliance logic.
- The "one place" is deliberately narrowed to **status + deadline only** — it is not a full case-management or compliance system.
