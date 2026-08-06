# Addendum: Docket

Implementation-leaning and downstream-relevant detail that doesn't belong in the PRD's capability narrative, preserved here for `bmad-architecture` and later workflows.

## Drive Integration — Mechanism

The brainstorming session raised using an **MCP driver (Claude plugin)** to connect to Google Drive, rather than building a custom Drive API integration from scratch. This is a build-vs-integrate technical decision, not a product capability — the PRD only commits to "Docket indexes files from a connected Google Drive account" (FR-1). Worth evaluating at the architecture stage: an MCP driver could reduce integration effort but ties the connector's reliability/versioning to an external plugin's lifecycle rather than a directly-owned API client.

## Tenancy — Resolved

Stakes calibration (Discovery) initially suggested single-tenant (internal tool for one firm), but the Success Metrics phrasing ("pilot firm," "self-reported baseline") hinted at multi-firm thinking. Flagged explicitly rather than assumed; the user confirmed **multi-tenant** is the actual intent. PRD §3 (Glossary — Firm), §4.8 (FR-16 Firm-scoped data isolation), and §7 MoSCoW now reflect this. v1 still launches with a single firm as the only provisioned tenant (§2.2, §5) — no self-serve signup/billing — but the schema and RBAC boundary are firm-scoped from day one, so onboarding a second firm later is provisioning, not migration.

## Deferred: Bulk-Import Tool

Named as the contingency response if Activation (SM-1) underperforms — see PRD §6.2 and §7 SM-C1. Not scoped in this PRD; captured here so it isn't lost when MVP scope is revisited.
