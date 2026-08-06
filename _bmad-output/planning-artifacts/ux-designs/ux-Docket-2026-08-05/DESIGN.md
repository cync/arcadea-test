---
status: final
created: 2026-08-05
updated: 2026-08-05
name: Docket
description: Internal document-workflow tracker for one law firm (~12 people). Airtable-inspired spreadsheet-database aesthetic, translated into a restrained, trustworthy palette where color is spent on status/aging signal, not decoration — the same visual card serves staff and clients.
colors:
  surface-base: '#F7F7F5'
  surface-raised: '#FFFFFF'
  surface-sunken: '#EDEDE9'
  border-grid: '#DEDDD7'
  border-strong: '#C7C6BE'
  ink-primary: '#1F2124'
  ink-secondary: '#5B5D63'
  ink-disabled: '#9B9C9F'
  primary: '#2D6CDF'
  primary-hover: '#2559B8'
  primary-tint: '#E8EFFC'
  status-draft-bg: '#EDEDE9'
  status-draft-fg: '#5B5D63'
  status-reviewed-bg: '#DFF3EC'
  status-reviewed-fg: '#12805F'
  status-needs-revision-bg: '#FCEDD9'
  status-needs-revision-fg: '#B4650A'
  status-waiting-signature-bg: '#EEE6FB'
  status-waiting-signature-fg: '#6B3FBF'
  status-filed-sent-bg: '#DCF3DE'
  status-filed-sent-fg: '#1E8A34'
  aging-rail-start: '#D9A441'
  aging-rail-end: '#9C4A32'
  blocked-badge-bg: '#F1EEF9'
  blocked-badge-fg: '#4A3F73'
  error: '#D64545'
typography:
  heading-lg:
    fontFamily: 'Inter'
    fontSize: 22px
    fontWeight: '600'
    lineHeight: '1.3'
  heading-md:
    fontFamily: 'Inter'
    fontSize: 17px
    fontWeight: '600'
    lineHeight: '1.3'
  body:
    fontFamily: 'Inter'
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.5'
  label:
    fontFamily: 'Inter'
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.01em
  caption:
    fontFamily: 'Inter'
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
  data-tabular:
    fontFamily: 'Inter'
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.4'
    note: 'font-variant-numeric: tabular-nums — used for Deadline dates and Aging day-counts so figures align in board columns.'
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  '7': 48px
  gutter: 16px
  column-gap: 24px
components:
  document-card:
    background: '{colors.surface-raised}'
    border: '{colors.border-grid}'
    radius: '{rounded.md}'
    padding: '{spacing.4}'
  status-pill:
    radius: '{rounded.full}'
    fontFamily: '{typography.label.fontFamily}'
    fontSize: '{typography.label.fontSize}'
    fontWeight: '{typography.label.fontWeight}'
    paddingX: '{spacing.3}'
    paddingY: '{spacing.1}'
  aging-rail:
    width: 4px
    gradientStart: '{colors.aging-rail-start}'
    gradientEnd: '{colors.aging-rail-end}'
    position: 'absolute left edge of board column (or list container on narrow viewports); spans only the contiguous vertical run of at-risk cards'
  blocked-badge:
    background: '{colors.blocked-badge-bg}'
    foreground: '{colors.blocked-badge-fg}'
    radius: '{rounded.full}'
    paddingX: '{spacing.2}'
    fontSize: '{typography.caption.fontSize}'
  owner-chip:
    avatarRadius: '{rounded.full}'
    foreground: '{colors.ink-secondary}'
    fontSize: '{typography.caption.fontSize}'
  button-primary:
    background: '{colors.primary}'
    foreground: '#FFFFFF'
    radius: '{rounded.sm}'
    paddingX: '{spacing.4}'
    paddingY: '{spacing.2}'
  delegated-approval-modal:
    background: '{colors.surface-raised}'
    radius: '{rounded.lg}'
    overlay: 'rgba(31, 33, 36, 0.4)'
---

## Brand & Style

Docket's brief is a direct contradiction on its face: build on Airtable's spreadsheet-database hybrid — vibrant, friendly, demystifying complex data — for an audience whose whole professional identity runs on being boring in the right way. The memlog resolves this the same way it resolved "Aging Rail" over "risk thread": pick the reading that a law firm trusts. So Docket does not import Airtable's vibrancy as brand decoration. It imports Airtable's *structural* honesty — a visible grid, a neutral working surface, color that is never ambient but is always attached to a specific, named piece of state — and spends the entire color budget on the three signals that matter: Status, the Aging Rail, and the Blocked badge. Everything else in the interface is quiet on purpose.

The result reads closer to a well-run case-management ledger than a consumer SaaS dashboard: warm-neutral paper-toned surfaces, hairline grid borders (a literal nod to the spreadsheet lineage), restrained sans-serif type, and a small, deliberate vocabulary of status pill colors doing the "demystify the data" work Airtable's palette does — just turned down from vibrant to composed. Docket is a single pane of glass; the visual system's job is to make that glass disappear except where something needs attention.

One more posture shapes every decision below: staff and clients see the *same* card. There is no stripped-down client theme, no muted "external view" palette. If Owner, Aging, and Blocked are worth showing a paralegal, they're worth showing the client whose matter it is — trust, in this product, is partly a visual promise of no separate story being told to each audience.

## Colors

The palette has two layers: a nearly-silent neutral base (the "grid"), and a small, non-negotiable set of functional colors that only ever mean one thing each.

**Neutral base** — `surface-base` (`#F7F7F5`) is the board canvas: warm off-white, not stark white, so the interface doesn't read clinical. `surface-raised` (`#FFFFFF`) is every card and panel sitting on that canvas. `surface-sunken` (`#EDEDE9`) marks board-column headers and other recessed structural chrome. `border-grid` (`#DEDDD7`) is the hairline that separates cards, columns, and table rows — a direct, deliberate echo of a spreadsheet's cell grid. `border-strong` (`#C7C6BE`) is reserved for column headers and dividers that need to read as structural, not incidental. `ink-primary` / `ink-secondary` / `ink-disabled` step down from body text through metadata (Owner names, timestamps) to disabled/placeholder text.

**Primary (`#2D6CDF` / hover `#2559B8` / tint `#E8EFFC`)** — Docket Blue. Used only for primary actions (buttons, links, focus rings) and the active/selected state of UI chrome. It never appears on a Status pill, the Aging Rail, or the Blocked badge — mixing "this is clickable" blue with "this is state" color would undercut the whole point of a controlled palette.

**Status pills** — five colors, one per Status value, each chosen so it can be identified by hue alone at a glance across a crowded board:
- **Draft** — gray (`#EDEDE9` / `#5B5D63`). Deliberately the least saturated: a Draft hasn't earned attention yet.
- **Reviewed** — teal-green (`#DFF3EC` / `#12805F`). Reads as "moving in the right direction."
- **Needs Revision** — amber-orange (`#FCEDD9` / `#B4650A`). Reads as "needs a human," distinct from the Aging Rail's ochre-rust (see below) so the two signals are never confused for one another.
- **Waiting on Client Signature** — violet (`#EEE6FB` / `#6B3FBF`). The one status where the firm is blocked on someone outside the firm — violet is the only hue in the system associated with "external dependency."
- **Filed/Sent** — green (`#DCF3DE` / `#1E8A34`). Done.

**Aging Rail (`#D9A441` → `#9C4A32`)** `[ASSUMPTION]` — a two-stop gradient, ochre to rust, chosen to evoke a paper document physically yellowing and then browning with age rather than a generic "warning" red. It is deliberately *not* the same hue as the Needs Revision pill: Aging is a time-based signal (how long has this sat untouched), Status is a state-based signal (why is it stuck), and per the memlog they're "two distinct, complementary signals on the same card" — they must never look like the same signal. The rail is a background gradient band, never a literal drawn connector between cards (ruled out specifically to avoid SVG-recompute-on-reflow cost, per the memlog), and it is applied *only* to the contiguous run of at-risk cards in a column — a single healthy card breaks the rail into separate segments; healthy cards themselves carry zero extra color. On narrow viewports the rail does not degrade to a badge — it keeps running down the side of the stacked single-column list, same gradient, same meaning, just reflowed vertically.

**Blocked badge (`#F1EEF9` / `#4A3F73`)** `[ASSUMPTION]` — a muted, desaturated cousin of the Waiting-on-Client-Signature violet (same family, lower saturation), reinforcing that Blocked is *computed from* that status without being visually identical to the pill. It is deliberately not alarm-colored (no red) — a client waiting to sign is not an emergency, it's a fact, and the "boring is trustworthy" posture extends to how urgently a badge visually shouts.

**Error (`#D64545`)** `[ASSUMPTION]` — reserved for form validation only (e.g., a Delegated Approval submitted without a reason). Never used for Status, Aging, or Blocked — those already own red-adjacent hues in this system (rust, orange) and error needed a hue clearly outside that cluster to stay legible as "you did something wrong," not "this document is at risk."

Avoid: any additional chromatic color introduced for decoration, marketing-style gradients on chrome (the only gradient in the system is the Aging Rail, and it is functional, not decorative), and reusing Status/Aging/Blocked hues for anything outside their one meaning.

## Typography

`[ASSUMPTION]` Inter, system-wide, across every role below — chosen for legibility at the small sizes a dense board demands and for its wide, free availability (no licensing friction for a 12-person internal tool). There is no display/hero role; Docket has no marketing surface to speak in a bigger voice, and a workflow tool that gave itself one would be overclaiming.

- **`heading-lg`** (22px/600) — page-level titles (e.g., the Matter board header).
- **`heading-md`** (17px/600) — column headers, a Document card's Matter name.
- **`body`** (15px/400) — default UI text: form fields, dialog copy, list rows.
- **`label`** (13px/500, +0.01em tracking) — form labels and Status pill text. The slight tracking on pill text is the one place the type system nods at Airtable's tag/chip typography.
- **`caption`** (12px/400) — metadata: Owner names, Reviewed-by attribution, timestamps, Blocked badge text.
- **`data-tabular`** (13px/500, tabular lining figures) `[ASSUMPTION]` — Deadline dates and Aging day-counts specifically. Tabular numerals mean a column of "3d", "12d", "1d" figures down a board actually lines up, the one direct typographic inheritance from the "spreadsheet" half of the brief.

## Layout & Spacing

Scale: 4 / 8 / 12 / 16 / 24 / 32 / 48px, plus two named tokens — `gutter` (16px, the space between cards stacked in a board column) and `column-gap` (24px, the space between board columns). The scale stays small and dense on purpose: a workflow board's job is to let someone scan a dozen-plus cards at once, and generous editorial-style whitespace would work against that.

The Workflow Board is the primary layout: columns per Status, cards stacked within. On desktop, columns run horizontally with `column-gap` between them. Below the board's tablet breakpoint, columns collapse into a single stacked list (still Status-grouped, now vertically sectioned) — and the Aging Rail persists through this collapse per the memlog's explicit mobile rule: it runs down the left side of the single-column list, not reduced to a badge.

Card internal padding is `spacing.4` (16px) on all sides — enough to keep Status pill, Owner chip, Deadline, and Blocked badge from crowding, not so much that fewer cards fit on screen.

## Elevation & Depth

Docket stays flat at rest — this is a working surface, not a stack of physical objects, and the memlog's "boring not casual" posture argues against skeuomorphic depth cues generally. Two exceptions, both functional: a card lifts with a subtle shadow while being dragged on the board (drag feedback needs *some* depth cue to read as "this is now floating, not committed"), and the Delegated Approval confirmation modal sits above a `rgba(31, 33, 36, 0.4)` overlay, per the `delegated-approval-modal` component token — the one place in the product where a deliberate interruption (confirm-with-reason, not a single frictionless click) is the entire point, and depth reinforces that this step can't be skimmed past.

## Shapes

`rounded.full` (9999px) is reserved for pill-shaped elements only: Status pills, the Blocked badge, and Owner-chip avatars — the one direct visual quote of Airtable's tag/chip language, kept exclusive to state-carrying elements so a full-radius shape always means "this is a small piece of labeled data," never "this is a button." `rounded.md` (8px) is the default for cards and panels. `rounded.sm` (4px) applies to inputs and buttons — tighter, so interactive controls read distinct from the pills sitting on the cards above them. `rounded.lg` (12px) is reserved for the Delegated Approval modal and any other dialog-level surface.

## Components

**Document Card** — the single card component shared, unmodified, by the staff board and the client view (per the memlog override on FR-12: Owner, Aging, and Blocked are visible in both places, not just internally). Anatomy, top to bottom: Matter/document name (`heading-md`), Owner chip (avatar + name, `caption`), Status pill (`label`, colored per the Status table above), Deadline (`data-tabular`), and — only when Status equals Waiting on Client Signature — the Blocked badge in the card's top-right corner, positioned so it never overlaps or visually merges with the Status pill. `background: {colors.surface-raised}`, `border: {colors.border-grid}`, `radius: {rounded.md}`, `padding: {spacing.4}`.

**Aging Rail** — a board-level element, not a per-card one. Rendered as a `{components.aging-rail.width}` (4px) gradient band (`{colors.aging-rail-start}` → `{colors.aging-rail-end}`) fixed to the left edge of a board column or, on narrow viewports, the left edge of the stacked card list. It spans only the contiguous vertical run of at-risk cards — interrupted by any healthy card, which breaks it into a new segment starting after that card. It never renders as a line connecting individual card centers.

**Status Pill** — `radius: {rounded.full}`, `label` typography, `paddingX: {spacing.3}` / `paddingY: {spacing.1}`. Background/foreground pair drawn from the relevant `status-*-bg` / `status-*-fg` tokens. Exactly one per card, always.

**Blocked Badge** — `radius: {rounded.full}`, `background: {colors.blocked-badge-bg}`, `foreground: {colors.blocked-badge-fg}`, `caption` typography. Purely computed — there is no Blocked field to set; it renders if and only if Status == Waiting on Client Signature, and disappears the moment Status changes, including to Needs Revision (which is stuck for a different reason and does not count as Blocked).

**Owner Chip** — small circular avatar (`{rounded.full}`) plus name in `caption`/`{colors.ink-secondary}`. Shows the Attorney of Record on staff and client cards alike.

**Delegated Approval control** — a button that opens the `delegated-approval-modal`, never a single-click action on the card itself. The modal requires a reason field (feeds the audit-trail entry per FR-10) before the confirm button becomes active — the deliberate friction is the feature, per the memlog.

**Workflow Board Column** — header on `{colors.surface-sunken}`, `{colors.border-strong}` bottom border, Status name in `heading-md`. Cards stack below with `{spacing.gutter}` between them; the Aging Rail (if present) sits behind that stack, not inside any individual card's own border.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Spend color only on Status, Aging Rail, and Blocked — three signals, three jobs | Add a fourth "decorative" brand color, or use Status/Aging hues for chrome |
| Show the identical Document Card (Owner, Aging, Blocked included) to staff and clients | Build a stripped-down or muted "client theme" of the card |
| Render the Blocked badge only when Status == Waiting on Client Signature | Show Blocked for Needs Revision, or add a separate Blocked data field |
| Keep the Aging Rail a background gradient band behind clustered at-risk cards | Draw an explicit connecting line/SVG path between stale cards |
| Let the Aging Rail reflow vertically on mobile, same gradient, same meaning | Collapse the Aging Rail into a plain badge on narrow viewports |
| Require a reason + confirm step before Delegated Approval fires | Make Delegated Approval a single frictionless click |
| Reserve `rounded.full` for pills/badges/avatars only | Use full rounding on buttons or cards |
| Keep the base surface neutral and quiet (warm off-white, hairline grid) | Import Airtable's palette vibrancy as ambient brand color |
