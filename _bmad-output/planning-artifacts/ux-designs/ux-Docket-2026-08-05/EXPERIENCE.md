---
status: final
created: 2026-08-05
updated: 2026-08-05
sources:
  - _bmad-output/planning-artifacts/prds/prd-Docket-2026-08-04/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Docket-2026-08-04/addendum.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-05.md
---

# Docket — Experience Spine

> Internal document-workflow tracker for one law firm (~12 people), multi-tenant underneath. Responsive web; a staff Workflow Board and a scoped Client Matter View sharing one Document Card. Paired with `DESIGN.md` (Docket visual identity).

## Foundation

Single-surface responsive web app — no native mobile app in v1 (NFR-4); mobile access is the same responsive web app, not a separate build. No named UI component library — `DESIGN.md`'s token set (colors, typography, rounded, spacing, components) is the full visual contract; this spine specifies the behavior layered on it. `DESIGN.md` is the visual identity reference.

Two RBAC-scoped audiences share one product, not two products: **Staff** (Paralegal, Attorney of Record, Office Manager — differentiated by permission, not by interface) work the Workflow Board; **Client** logs in through the same app, scoped by Client Access (FR-11) to see only their Matter(s). Per the memlog override on FR-12, the Client's Document Card is the *same* component staff use — Owner, Aging Rail, and Blocked badge included, not a stripped-down variant. See the note under Information Architecture.

Multi-tenant underneath (every Matter/Document/user belongs to exactly one Firm, FR-16), but v1 provisions a single Firm through an internal/admin process — there is no self-serve signup surface in this spine.

## Roles & Permissions

Actions are gated by role, not by separate screens — everyone who can see a Document sees the same card and board; what differs is which controls are live. Each row inherits everything the row above can do.

| Role | Can (in addition to the row above) |
|---|---|
| Paralegal (staff, general) | View the board, move Status (drag or Move-to-Status menu), add a Document (Drive-detected arrives on its own; paper-scan logging is manual), open Document Detail |
| Attorney of Record | Set/edit Deadline on their own Documents (FR-6), grant/revoke Client Access (FR-13), view Delegated-Approval audit entries on their Documents (FR-10), reassign Attorney of Record `[ASSUMPTION]` |
| Office Manager | Create a Matter (combined with Drive-folder connection), Delegated Approval (FR-9, Office-Manager-only by definition — no other role has this control regardless of whose Document it is), grant/revoke Client Access (FR-13) |
| Client | View their granted Matter(s) and Documents — Status, Deadline, Owner, Aging Rail, Blocked badge, nothing else. Cannot change Status, add/upload a Document, or see anything outside their grant. No comment/question channel — PRD Open Question 3 is unresolved; this spine treats the client view as strictly non-interactive until answered. |

`[ASSUMPTION]` Office Manager cannot set/edit Deadline — FR-6 names the Attorney of Record specifically and nothing else grants that control.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Workflow Board | Login (staff home) | All Documents across the staff member's accessible Matters, grouped into five Status columns, sorted by urgency + aging within each column — never alphabetically, never by Matter |
| Document Detail | Card click/tap, any surface | Full record for one Document: Drive link + last-modified, Deadline, Reviewed-by, Status history, Delegated-Approval audit entries (Attorney of Record only), Reassign-Owner control |
| Matter + Drive Onboarding | "New Matter" (Office Manager) | One combined step: name the Matter, pick the client, connect/select the Drive folder — Stories 1.1+1.2 fused into a single moment |
| Add Document | "+" on Board or Matter header | Logs a Scanned Document (Story 6.1) or a manual note; Drive-detected Documents never need this — they appear on their own |
| Delegated Approval | Office Manager action on a card/detail | Confirm-with-reason modal; the only way a Document reaches Filed/Sent on the Attorney's behalf |
| Access Management | Document Detail / Matter header (Attorney of Record or Office Manager) | Grant/revoke Client Access to a Matter |
| Client Matter View | Client login | Read-only: the client's granted Matter(s) and each Document's card — **identical card to staff's board**, not a reduced one |

> **Resolved conflict with the PRD, flagged for reconciliation:** FR-12 originally assumed the client view was "Status and Deadline only — no internal reviewer names." This session's memlog overrides that: the client also sees Owner (Attorney of Record), the Aging Rail, and the Blocked badge, on the same Document Card staff use. This is a real product decision, not a UX-only nuance — FR-12 and Story 5.2's acceptance criteria ("no internal reviewer names") should be updated to match. Not this document's job to edit those files, only to surface the gap so it gets reconciled.

No modal stacks more than one level deep — Delegated Approval, Add Document, Matter Onboarding, and Access Management are all single-level dialogs.

## Voice and Tone

Microcopy. Brand voice and visual restraint live in `DESIGN.md.Brand & Style` — "boring is trustworthy." `[ASSUMPTION]` extends that posture into copy: plain, declarative, never performative. This is a workplace tool for attorneys and their clients, some of whom are anxious about a live case — copy never manufactures urgency or cheer.

| Do | Don't |
|---|---|
| "Deadline set for Friday." | "You're all set! 🎉" |
| "3 days without a change." | "Uh oh, this one's getting stale!" |
| "Reason required before this fires." | "Are you REALLY sure?" |
| "Filed/Sent — March 4." | "Successfully filed! Great work team." |
| Same sentence to staff and client. | A softer/friendlier register for clients — Docket doesn't perform reassurance, it shows the fact. |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Document Card | Board, Client Matter View | Click/tap anywhere opens Document Detail. Identical anatomy and data for staff and client per the FR-12 override above. Drag to another Status column is the primary status-change gesture on desktop (staff only; see Interaction Primitives for the keyboard/touch alternative). `{components.document-card}` |
| Aging Rail | Board (behind card stack) | Computed, not authored — renders only behind the contiguous run of cards whose Aging exceeds the 3-day threshold (FR-7). A single healthy card breaks it into a new segment. Not a click target. `{components.aging-rail}` |
| Blocked badge | Document Card | Computed, true only when Status == Waiting on Client Signature; disappears immediately on any other Status, including Needs Revision (`{colors.status-needs-revision-fg}`) — stuck for a different reason, never counted as Blocked. No manual "mark blocked" control exists anywhere in the product. `{components.blocked-badge}` |
| Status Pill | Document Card | Display only — never itself a click target for changing Status (that's the card drag or the Move-to-Status menu, so the pill's small hit area never becomes the accessibility bottleneck). `{components.status-pill}` |
| Owner Chip | Document Card | Displays the Attorney of Record. Never editable from the card — ownership reassignment lives in Document Detail. `{components.owner-chip}` |
| Reviewed-by control | Document Detail, on transition to Reviewed | Moving a Document to Reviewed opens an inline confirm: the acting user selects/confirms themselves as reviewer (FR-5) before the transition completes. Cannot be skipped. |
| Delegated Approval control | Document Detail, Office Manager only | Button opens `{components.delegated-approval-modal}`. Never a single click on the card — see State Patterns and Interaction Primitives. |
| Add Document control | Board "+", Matter header | One entry point for both manual Document notes and paper-scan logging (Story 6.1 folded in, per memlog). Scan file field is optional at log time — "Attach later" is a valid submit. |
| Matter + Drive Onboarding control | "New Matter" | One form, two backend calls in sequence (create Matter, then connect/select Drive folder) presented as a single step with a single submit — the user never sees an intermediate "Matter created, now connect Drive" screen. |
| Reassign Attorney of Record | Document Detail | `[ASSUMPTION]` Explicit action (never a side effect of another edit), gated to Attorney of Record / Office Manager, requires picking a new owner from Firm members — FR-15 promises this is "an explicit action" though no story currently implements the UI; specified here so the behavior isn't silently dropped. |
| Access Management control | Document Detail / Matter header | Grant: pick a client, select Matter scope. Revoke: takes effect on the client's next request — see State Patterns. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold board load | Workflow Board | `[ASSUMPTION]` Skeleton cards per column matching expected column layout. Resolves as data arrives per column, not all-or-nothing. |
| Empty column | Workflow Board | `[ASSUMPTION]` "Nothing in {Status}." No illustration — a quiet, factual line consistent with Voice and Tone. |
| Empty board (new Matter, no Documents yet) | Workflow Board | `[ASSUMPTION]` "No Documents yet. Add one, or wait for Drive to sync." Points at the Add Document control. |
| Scan logged without file attached | Document Card, Detail | Card renders normally — Status/Aging/Owner all apply per FR-14. Detail shows "No scan file attached — add one" in place of the Drive link, non-blocking. |
| Drive connection revoked | Document Card, Detail | Status/Deadline/Aging history persists and stays interactive (per FR-1's consequence); the Drive-link affordance shows inactive/greyed with "Drive link unavailable" rather than disappearing. |
| Drive file deleted or moved out of watched folder | Document Card, Detail | `[ASSUMPTION]` PRD Open Question 4 is unresolved; this spine's default until answered: the Document record persists unchanged, the Drive-link affordance shows "File not found in Drive" as an inactive state, Status/Aging continue to apply. Never silently deletes the Document record. |
| Filed/Sent attempted without a recorded Reviewed step | Workflow Board (drag), Move-to-Status menu | Per PRD §2.3 UJ-1's own assumption: warns, does not hard-block. `[ASSUMPTION]` treatment: inline confirm — "This Document was never marked Reviewed. Move it to Filed/Sent anyway?" — Continue completes the move, Cancel returns the card. |
| Any other Status-to-Status move | Workflow Board | `[ASSUMPTION]` No enforced linear order — any Status may move to any other Status via explicit action, consistent with the PRD's "small firm, trusts its own people" posture already established for the Reviewed-step warning above. |
| Delegated Approval reason left blank | Delegated Approval modal | Confirm button stays disabled (not a submit-then-error round trip); the reason field's error state uses `{colors.error}` only after a submit attempt. |
| Stale alert threshold crossed | Board (no in-app banner) | Per FR-8/NFR-1: email only, no in-app notification — the board's own Aging Rail is the in-app signal, the email is the out-of-band one. |
| Client views a Matter they're not granted | Client Matter View | Not listed, not shown as a "no access" screen — hidden entirely. Consistent with FR-11's "never see a Matter... not been explicitly granted." |
| Cross-Firm access attempt (any role, direct ID) | Any | Denied at the data layer (FR-16/NFR-2); UI shows a generic "not found," never a "you don't have permission" message that would confirm the record exists. |
| Access revoked mid-session (client) | Client Matter View | `[ASSUMPTION]` Reflected on the client's next navigation/refresh — no forced live-kick of an open session; "immediately loses the ability to view" means the next request, not a push-interrupt. |

## Interaction Primitives

- **Drag card to another Status column** — primary desktop status-change gesture (staff only). Card lifts with the drag-feedback shadow specified in `DESIGN.md.Elevation & Depth`.
- **Move-to-Status menu** — keyboard and touch alternative to drag, opened from the card's kebab or from Document Detail's Status control. Same transitions, same Reviewed-confirm, same warn-not-block rule apply regardless of which path is used.
- **Click/tap card** — opens Document Detail. Never opens a status menu directly; click-to-open and click-to-change-status are deliberately separate controls so they never collide on the same gesture.
- **Delegated Approval** — never a single click. Button → modal → reason required → Confirm enabled only once the reason is non-empty. `[ASSUMPTION]` No undo after confirm; it's an audited action, not a toggle.
- **Add Document** — one "+" affordance branches to "Log a paper scan" inline within the same modal, no separate screen, per the memlog's Story 6.1 decision.
- `[ASSUMPTION]` **Hover** (desktop, pointer input) reveals a card's kebab (Move-to-Status, etc.) without requiring a click first; touch input shows the kebab always-visible on the card — no hover-only affordance on touch.
- **Banned:** single-click Delegated Approval, drag-and-drop with no keyboard/touch equivalent, any in-app "streak" or gamified re-engagement pattern (Docket tracks case documents, not habits), a reduced-field client card (superseded — see the FR-12 override above).

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md`.

- WCAG 2.2 AA across the full responsive web surface, staff and client alike — the client is not a lesser-supported audience.
- Drag-and-drop status changes have a full keyboard/touch equivalent (the Move-to-Status menu) — nothing in Docket requires drag to operate.
- Aging is never color-only: every card carries the numeric day-count in `{typography.data-tabular}` alongside the Aging Rail, satisfying "don't rely on color alone" independent of the rail's gradient.
- Status is never color-only: the Status Pill always carries its text label (`{typography.label}`), never a bare color swatch.
- Blocked is never color-only: the badge always carries its caption text, never a bare icon.
- Delegated Approval modal traps focus; the reason field is `aria-required`; a blocked-submit attempt announces the requirement via `aria-live`, not a silently-disabled button alone.
- Screen reader announces board context on navigation: "{Status} column, {N} Documents" per column; Document Detail announces "{Matter} — {Document}, {Status}."
- Tap targets ≥ 24px (WCAG 2.2 minimum) on desktop pointer input, ≥ 44px on touch/narrow viewports.
- Focus traversal follows reading order: Status columns left-to-right, cards top-to-bottom within a column; on the collapsed mobile list, the same top-to-bottom order the Aging Rail itself reflows into.
- Reduced motion: skip the drag-lift shadow transition and any modal-open animation; state changes apply immediately.

## Responsive & Platform

| Breakpoint | Behavior |
|---|---|
| Desktop (at/above the board's tablet breakpoint) | Status columns run horizontally with `{spacing.column-gap}` between them; drag-and-drop between columns is available. |
| `[ASSUMPTION]` Below the board's tablet breakpoint | Columns collapse into a single, vertically Status-sectioned list per `DESIGN.md.Layout & Spacing`. Drag is not offered at this width (no reliable drag target across sections) — the Move-to-Status menu becomes the only status-change path, not a secondary one. |
| Aging Rail at any width | Persists and reflows to the left edge of the stacked list per the memlog's explicit rule — never degrades to a badge. |

Docket is responsive web only (NFR-4) — no native app, no platform-specific gesture set beyond standard browser touch/pointer handling.

## Inspiration & Anti-patterns

- **Lifted from Kanban tools generally (Trello, Linear):** drag-card-between-columns as the primary status-change gesture — familiar enough that staff need no training, since the point is that a paralegal's transition should be as fast as the thought "this is reviewed now."
- **Lifted from Airtable's tag/chip pattern (via `DESIGN.md`):** the Status Pill and Blocked badge read as small, labeled, non-interactive facts about a row — Docket borrows the *legibility* of that pattern, not the surrounding vibrant product.
- **Rejected — a reduced "client theme" of the card:** the PRD's original FR-12 framing (client sees Status + Deadline only). This session's memlog explicitly overrode it — see the Information Architecture note above. Kept here as a rejected direction, not a live option, so a future implementer doesn't reintroduce it by default.
- **Rejected — single-click Delegated Approval:** an office manager acting on an unreachable attorney's behalf is exactly the moment that should not feel as light as dragging a card — the memlog's confirm-plus-reason requirement is deliberate friction, not an oversight to streamline later.
- **Rejected — hard-blocking Filed/Sent without a Reviewed step:** consistent with the PRD's own "small firm, trusts its own people" framing (§2.3) — Docket warns, never gatekeeps a transition its own users are accountable for.
- **Rejected — separate onboarding screens for Matter creation and Drive connection:** would strand a new Matter on an empty, unconnected board between steps; the memlog fuses them into one moment even though the backend still sequences two calls.

## Key Flows

### UJ-1. Mara moves a filing from draft to sent.

1. Mara opens Docket; the Workflow Board loads sorted by urgency + aging, not alphabetically — the motion due Friday is already near the top of Draft because of its Deadline pressure.
2. She finds the matter's card (Owner chip shows her attorney, no Aging Rail yet — it's fresh) and attaches the finished file already saved to the Matter's Drive folder — Drive auto-detected it, no manual Add Document step needed.
3. She drags the card from Draft to Reviewed. The Reviewed-by confirm fires inline: she selects the attorney as reviewer (FR-5) — the card now shows "Reviewed by {attorney}" in `{typography.caption}`.
4. Once the attorney confirms verbally, she drags it again, Reviewed → Filed/Sent.
5. **Climax:** the card lands in the Filed/Sent column immediately, its Status Pill now `{colors.status-filed-sent-fg}` — no one has to ask her or email to check; the attorney sees the same card update on his phone from the courthouse.

Failure: she tries to drag straight to Filed/Sent without a recorded Reviewed step — the warn-not-block confirm fires ("Move it to Filed/Sent anyway?"); she can proceed or cancel, per the PRD's own assumption.

### UJ-2. The office manager sends a filing the attorney can't reach.

1. Denise gets a Stale Alert email — Aging exceeded 3 days on a filing due tomorrow. She clicks through, authenticated straight to Document Detail.
2. The card behind it already carries the Aging Rail (`{colors.aging-rail-start}` → `{colors.aging-rail-end}`) — visual confirmation this is the one the email meant.
3. She sees it's sitting at Reviewed, confirms with the paralegal by phone that it's ready, and opens the Delegated Approval control.
4. `{components.delegated-approval-modal}` opens over the darkened overlay. She types a reason ("Attorney in trial, confirmed ready with paralegal, deadline tomorrow"). Confirm stays disabled until that field is non-empty.
5. **Climax:** she hits Confirm. The Document moves to Filed/Sent, marked distinctly as a delegated action, not silently as the attorney's own — the deadline is met without anyone pulling the attorney out of trial.

Resolution: after court, the attorney opens Document Detail and sees the delegated-approval entry in the audit trail — actor (Denise), timestamp, and reason — exactly what happened while he was unreachable.

### UJ-3. A client checks their matter without calling.

1. The client logs in through Client Access, scoped to their one Matter — the Client Matter View shows just that Matter, no board chrome, no other clients' data reachable even by guessing a URL (FR-16).
2. They see the one Document relevant to them: the **same Document Card** staff see — Owner chip (their attorney's name), Status Pill (`{colors.status-filed-sent-fg}` — Filed/Sent), Deadline date, no Aging Rail (it's resolved and healthy), no Blocked badge (Status isn't Waiting on Client Signature).
3. **Climax:** they get the answer — filed, and when — without a phone call or a "let me check and get back to you" email. Seeing the Owner's name alongside it, per this session's FR-12 override, is itself part of the reassurance: they know exactly who at the firm is accountable for their filing, not just its status.

Resolution: they close the app; no firm time spent on a status-check call. If the Document were instead sitting at Waiting on Client Signature, the same view would show the Blocked badge (`{colors.blocked-badge-bg}` / `{colors.blocked-badge-fg}`) — telling the client, without a call, that the firm is waiting on *them*.
