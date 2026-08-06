# Adversarial Review — ARCHITECTURE-SPINE.md (Docket, 2026-08-05)

**Method:** For each of the 15 stories across the 6 epics, I asked: "if two different developers each build to the *letter* of every AD that binds them, and neither reads the other's code, can what they produce fail to compose?" Every finding below is a pair that independently satisfies AD-1 through AD-7 and the Consistency Conventions table, yet collides at a shared boundary — a field, a table, a service signature, or a derivation rule. Findings are ordered by severity.

**Verdict:** The spine is directionally sound (the port boundary for Drive is the right call, firm-scoping-by-construction is the right call), but it is a spine for the *happy path* of each epic in isolation. It under-specifies exactly the connective tissue a multi-developer build needs: the shape of `AuditEntry`, the field that anchors "time in current status," which fields `StatusTransition` may touch as a side-channel, and whether AD-2's port monopoly on Drive actually covers Epic 6. Six holes found, three of them severe enough to cause silent data-integrity or security-adjacent divergence rather than a mere compile error. None are fixed by "write more tests" — they need new or tightened ADs before Epic 1 and Epic 3 (or Epic 2 and Epic 4, or Epic 1 and Epic 6) are handed to different developers.

---

## Finding 1 (Critical) — "Time in current status" has no canonical field, and AD-6 makes it *undiscoverable* from the audit log

**Pair:** Epic 2 developer building `StatusTransition` (Stories 2.2, 2.3) vs. Epic 3 developer building the Aging domain function / `StaleCheck` (Stories 3.2, 3.3).

**What each side does, to the letter:**
- AD-3's rule is: *"every Status change ... calls the single StatusTransition application service. No code path writes `Document.status` directly."* Note the scope: it names `status`, nothing else. An Epic 2 developer implementing Story 2.2 ("Move a Document Between Statuses") can satisfy this completely by writing `UPDATE document SET status = $1 WHERE id = $2` inside `StatusTransition`. Nothing in AD-3, AD-6, or the Consistency Conventions table obliges them to also stamp a "status changed at" timestamp — that requirement lives nowhere in the spine.
- AD-7's rule is: *"both the board render and the scheduled Stale Alert job call the same domain function for Aging."* That's a rule about the *consumer* side (one function, two callers) — it says nothing about what that function reads from.
- AD-6 requires an `AuditEntry` row **only** for three named actions: Delegated Approval, Reviewed-by, and reassignment. An ordinary drag from Draft → Needs Revision, or Needs Revision → Draft, or Waiting-on-Signature → Filed/Sent via the *non*-delegated path (Story 2.2's own example) produces **no audit row at all** under AD-6's letter.

**The collision:** the Epic 3 developer writing the Aging function needs a reliable "entered current status at" timestamp. There are exactly two places to get it: (a) a dedicated `Document` field that `StatusTransition` maintains on every transition, or (b) the most recent relevant `AuditEntry`. Option (b) is a dead end by construction — AD-6 doesn't log the majority of status transitions, so `AuditEntry` under-counts and Aging computed from it would be *wrong* (silently longer than reality, or worse, `null` for a document that's changed status three times but never triggered a Reviewed/Delegated/Reassignment event). Option (a) requires a field that AD-3 never told the Epic 2 developer to write. Two concrete failure shapes:

1. Epic 2 ships `StatusTransition` writing only `status` (fully AD-3-compliant). Epic 3's Aging function, finding no reliable timestamp, falls back to `Document.createdAt` or to scanning `AuditEntry` — Aging is now measuring "time since document was created" or "time since last *logged* action," not "time in current status" as FR-7/FR-8 require. Story 3.3's stale-alert AC ("Aging exceeds 3 days ... email sent") now fires on the wrong signal.
2. Epic 3, needing the field, adds it via their own migration (e.g. `Document.enteredStatusAt`) without coordinating with Epic 2. Now there are two owners of one piece of Document lifecycle state: Epic 2's `StatusTransition` (which doesn't know the field exists and never writes it) and Epic 3's migration (which expects something else to write it). The column exists, is always `NULL` or stale, and Aging is broken for every document that has ever changed status.

Either way, the two builds are each individually AD-compliant and structurally incompatible.

**Fix:** AD-3's rule needs an explicit clause: *"`StatusTransition` is also the sole writer of the Aging-anchor timestamp (name it, e.g. `Document.statusEnteredAt`) — every transition updates it in the same write as `status`, whether or not that transition also produces an `AuditEntry`."* AD-7 should then say the Aging function's single required input is that named field, not "recompute from history."

---

## Finding 2 (Critical) — AD-6's own field list omits what its own bound FR requires, and two epics will fill the gap differently

**Pair:** Epic 1 developer building reassignment audit (Story 1.5) vs. Epic 4 developer building the delegated-approval audit trail (Story 4.2).

AD-6 binds FR-10, and FR-10 reads: *"Every use of the delegated-approval action is logged with actor, timestamp, and **the Document/Matter it applied to**."* But AD-6's Rule sentence only lists: *"actor, timestamp, action type, optional reason."* There is no `documentId`/`matterId` in the rule's own field list — the spine binds an FR and then doesn't satisfy it in the very next sentence.

- The Story 4.2 developer needs to answer "show me delegated-approval entries for Document X" (AC: *"I can see any delegated-approval entries logged against it"*) and "the Document/Matter it applied to" per FR-10 — so they will, reasonably, add `documentId` (and plausibly `matterId`, since FR-10 names both) as first-class columns on `AuditEntry`, indexed for lookup by document.
- The Story 1.5 developer (reassignment, same `AuditEntry` table under AD-6) is working from the Rule's literal field list — `(actor, timestamp, action type, optional reason)` — and has no textual requirement to populate a `matterId` at all; `documentId` might get stuffed into "reason" as a free-text aside, or omitted because "the transaction already scopes it" (true for the write, useless for later querying).

Both are AD-6-compliant readings of the same sentence. If they land in the same migration/table, one of two things happens: (a) the Epic 4 developer's `documentId`/`matterId` columns end up `NULL` on reassignment rows because the Story 1.5 code path never populates them, silently breaking any cross-cutting audit view (e.g. "show all audit events for this Matter," needed the moment Epic 4's per-document history view is generalized) — or (b) each story ends up owning a *different* migration for what should be one shared table, because neither developer's task description told them the other exists.

**Fix:** AD-6's rule needs the missing fields spelled out explicitly — `(actor, timestamp, action type, documentId, matterId, optional reason)` — matching what FR-10 already requires. Don't leave "the Document/Matter it applied to" implicit.

---

## Finding 3 (High) — AD-6 exists to prevent exactly the failure mode a compliant `StatusTransition` can reintroduce

**Pair:** Epic 2 developer building the board's "Reviewed by {name}" display (Story 2.3) vs. anyone later building an audit/history view from `AuditEntry` (Story 4.2's "view its history" AC, which explicitly expects a reconstructable history).

AD-6's own stated rationale is: *"Prevents: an audit trail reconstructed after the fact from mutable Document fields, which is unreliable once a record can be edited again."* Good goal. But AD-6's *rule* only constrains three specific actions (Delegated Approval, Reviewed-by, reassignment) to append an insert-only `AuditEntry`. It does **not** forbid also caching the result on `Document` — and AD-3's "no code path writes `Document.status` directly" only protects the `status` field by name.

Story 2.3's AC — *"it displays 'Reviewed by {name}'"* — is a hot-path board read. The obvious, fully spine-compliant implementation is for the Epic 2 developer to add `Document.reviewedByUserId` (denormalized, mutable) alongside the `AuditEntry` insert inside `StatusTransition`, purely as a read optimization; nothing in AD-3/AD-6 forbids it. Now walk a Document through Reviewed → Needs Revision → Draft → Reviewed again with a *different* reviewer. `Document.reviewedByUserId` is overwritten (that's what mutable fields do) and now shows only the latest name. Meanwhile the Story 4.2-style history view, built by someone taking AD-6's rationale at face value ("the audit trail is the source of truth, Document fields are not reliable"), reconstructs from `AuditEntry` and shows the full sequence of reviewers. The two views now disagree about "who reviewed this" whenever a document round-trips through Reviewed more than once — precisely the drift AD-6 was written to prevent, reopened through a field AD-6 forgot to name.

**Fix:** AD-6 (or AD-3) needs a blanket rule, not a `status`-specific one: *"No Document field may cache the result of an audited action (Reviewed-by, Delegated Approval, reassignment). Current 'reviewed by' state is a read-time query against `AuditEntry`, the same way AD-4 forbids caching `blocked`."* Make it a named, shared rule the way AD-4 did for `blocked`, not an inferred consequence of AD-3's `status`-only wording.

---

## Finding 4 (High) — AD-2's "Binds" line and its Rule text disagree about whether Epic 6 is covered, so scanned documents get a second, incompatible file-link mechanism

**Pair:** Epic 1 developer building `DriveConnector` / `resolveLink` (Stories 1.2–1.4) vs. Epic 6 developer building "link the resulting scan file" (Story 6.1).

AD-2's **Binds** line reads: *"FR-1, FR-2, FR-3 (Epic 1)"* — Epic 6's FR-14 is not listed. But AD-2's **Rule** text is unscoped: *"all Google Drive interaction goes through the `DriveConnector` port ... Application services and domain code depend only on this interface — never on a concrete Drive SDK or MCP client type."* And NFR-5 (which Epic 6 *is* bound by) explicitly folds scans into the same file-reference model: *"Docket never stores or duplicates file content — only references/metadata to the Drive-hosted file **(or scan)**."* The parenthetical implies scan files are Drive-hosted too — which is exactly the kind of file that AD-2's Rule says must go through the port.

Two literal-minded developers diverge here:
- The Epic 6 developer, reading the **Binds** line, correctly notes AD-2 doesn't bind FR-14, and builds Story 6.1's "link the resulting scan file" as a raw URL/string field captured at scan time — no `DriveConnector` call, no port dependency, fully AD-2-compliant by scope.
- The Epic 1 developer (and Story 1.4, which is *not* scoped to only-Drive-created documents — its AC says "a Document linked to a Drive file," and Story 6.1's own AC says the Scanned Document "behaves like any other Document — Status, Deadline, and Aging all apply") built the "current version" view assuming every Document's file link is `DriveConnector.resolveLink(fileId)` — i.e., a Drive file id, not an arbitrary URL.

Result: Story 1.4's "open it in Docket, see the Drive last-modified timestamp and a live-file link" code path either breaks for every Scanned Document (wrong field, no `fileId` to resolve) or has to special-case a second, undocumented file-reference shape that AD-2 never anticipated — exactly the "structural fork rippling through the codebase" AD-2 exists to prevent, just relocated to the Epic1/Epic6 seam instead of the custom-API-vs-MCP seam it was written for.

**Fix:** Either (a) explicitly bind FR-14 to AD-2 and require Story 6.1's scan upload to go through `DriveConnector` (get a real Drive `fileId` from the scan-upload flow, then store/resolve it identically to Drive-detected documents), or (b) if scans are deliberately out-of-Drive, add a new AD defining a second, named file-reference variant on `Document` (e.g. a discriminated `fileRef: { kind: 'drive', fileId } | { kind: 'scan', url }`) and update Story 1.4's contract to branch on it. Currently neither is decided, and the Binds/Rule mismatch lets both developers claim compliance while shipping incompatible shapes.

---

## Finding 5 (Medium) — `StatusTransition`'s signature is never specified, and every consumer beyond Story 2.2 needs to pass it something different

**Pair:** Epic 2 developer building the base `StatusTransition(documentId, newStatus, actorId)` (Story 2.2) vs. Epic 4 developer building `DelegatedApproval` on top of it (Story 4.1) vs. Epic 2's own Story 2.3 (reviewer capture).

AD-3 names `StatusTransition` as the one entry point and AD-6 requires that Reviewed-by and Delegated-Approval audit rows be written "in the same transaction as the Document mutation." For that to be literally true (one transaction), the extra context — *who reviewed*, *that this was a delegated action, on whose behalf* — has to flow into the same call that changes `status`, not a separate call afterward (a separate call after `StatusTransition` returns is, by definition, a second transaction unless the caller wraps both in its own transaction, which then makes the "single service" boundary meaningless — two different callers would each have to reimplement the same wrapping).

Nothing in the spine gives the method signature. A minimal-scope Story 2.2 build produces `StatusTransition(documentId, toStatus, actorId): void`. Story 2.3 (reviewer) and Story 4.1 (delegated approval, "shown distinctly from a standard attorney-initiated transition" per its AC) each need to extend that signature — but since they're different stories/epics, there's nothing forcing convergence on *how*. One plausible build: Story 2.3's developer adds an optional `reviewerId` param directly to `StatusTransition`. A different plausible build: the Epic 4 developer, not wanting to touch Epic 2's service, builds `DelegatedApproval` as a wrapper that calls `StatusTransition` and then writes its own `AuditEntry` in a *second* transaction — which is a literal AD-6 violation, arrived at by a developer trying to avoid touching someone else's file. Both are "reasonable" readings of an underspecified single-owner service.

**Fix:** Pin the actual interface in the spine, the same way AD-2 pinned `DriveConnector`'s four methods: `StatusTransition(documentId, toStatus, actorId, auditContext?: { type: 'REVIEWED' | 'DELEGATED_APPROVAL', reviewerId?, onBehalfOf?, reason? })`, single transaction, single function. Right now `DriveConnector` gets a named method list in AD-2; `StatusTransition` — arguably the more contested shared boundary, since three separate epics call it — gets none.

---

## Finding 6 (Medium) — AD-5's "same repository-level checks" doesn't say where Matter-level client scoping is enforced, and AD-1's repository contract only promises `firmId`

**Pair:** Epic 1 developer building the Prisma-extension repository layer that AD-1 mandates (the `firmId`-by-construction guarantee) vs. Epic 5 developer building Client-scoped access (Stories 5.1–5.3).

AD-1's rule is specific and testable: repository methods require and apply a `firmId` filter by construction; "no repository method may accept an unscoped mode." That's the whole guarantee — it says nothing about narrower scopes. AD-5 then leans on that same layer for Client role: *"Client and staff requests are authorized through the same AuthProvider port and the same repository-level `firmId`/role checks — a Client role narrows what's visible (via grant scope on `ClientAccess`), it does not route through different code."*

But `ClientAccess` scoping is Matter-level (Story 5.1: "grant client access to a specific Matter... that client can log in and see only that Matter"), and AD-1's repository contract was only ever specified to enforce `firmId`. Nothing says the shared Prisma-extension layer also enforces a `matterId` allow-list for Client-role sessions. So the Epic 5 developer has two AD-5-compliant options that produce different code shapes:
1. Extend the shared repository layer (Epic 1's file) to also take a Client's granted-matter set and inject a second filter by construction — but this requires touching and extending a contract AD-1 never described as extensible, and the Epic 1 developer had no reason to build it that way since AD-1's binds line doesn't mention Epic 5.
2. Leave the repository layer as `firmId`-only (per AD-1's literal scope) and add the Matter-narrowing check in the application-service layer for client-facing endpoints instead — which is precisely "a parallel ... surface accumulating its own, differently-shaped security bugs" that AD-5 exists to prevent, arrived at by an AD-5-literal reading that never says *where* the narrowing must live.

Story 5.1's own AC ("a client has not been granted access to a Matter... it's not visible or accessible to them") and NFR-3 are exactly the kind of requirement a service-layer-only check can quietly get wrong on one endpoint and not another (e.g. a new API route added in a later story that queries `Document` directly-ish without threading the Matter check) — the failure mode AD-5 names but doesn't structurally block.

**Fix:** Extend AD-1's rule to name Matter-scoping as a second, equally-structural filter (not just `firmId`) that the repository layer applies whenever the session role is Client, so AD-5 has an actual mechanism to point at instead of a description of intent.

---

## Summary Table

| # | Severity | Pair | What diverges |
|---|----------|------|----------------|
| 1 | Critical | Epic 2 `StatusTransition` dev vs. Epic 3 Aging/`StaleCheck` dev | No field is designated as the Aging-anchor timestamp; AD-6 makes deriving it from `AuditEntry` impossible for ordinary transitions |
| 2 | Critical | Epic 1 reassignment audit (1.5) vs. Epic 4 delegated-approval audit (4.2) | `AuditEntry`'s field list in AD-6 omits `documentId`/`matterId`, which FR-10 (bound by AD-6) requires |
| 3 | High | Epic 2 board "Reviewed by" display (2.3) vs. any `AuditEntry`-sourced history view (4.2-style) | AD-3's "don't write `status` directly" doesn't stop a mutable `Document.reviewedByUserId` cache, reopening the exact drift AD-6 exists to prevent |
| 4 | High | Epic 1 `DriveConnector`/`resolveLink` (1.2–1.4) vs. Epic 6 scan file link (6.1) | AD-2's Binds line excludes FR-14 but its Rule text says "all Google Drive interaction" — two incompatible file-reference shapes on the same `Document` type |
| 5 | Medium | Epic 2 base `StatusTransition` (2.2/2.3) vs. Epic 4 `DelegatedApproval` (4.1) | No pinned method signature for the one named cross-epic service; extra audit context (reviewer, delegation) has no agreed place to attach, risking a second, non-atomic transaction |
| 6 | Medium | Epic 1 repository/Prisma-extension layer (AD-1) vs. Epic 5 Client Matter-scoping (5.1–5.3) | AD-1's structural guarantee only covers `firmId`; AD-5 assumes but doesn't mandate that Matter-level scoping lives at the same structural layer |

**Net recommendation:** Before Epic 1/2/3/4/6 stories are handed to separate developers, tighten AD-3 (name the Aging-anchor field and the `StatusTransition` signature), tighten AD-6 (complete the `AuditEntry` field list; extend the "don't cache audited state on Document" rule beyond just `status`), and resolve the AD-2 binds/rule scope conflict for Epic 6 before Story 6.1 is built. Finding 6 can wait for Epic 5's own design pass but should not be silently left to "the repository layer, presumably" the way AD-5's current wording leaves it.
