## Deferred from: code review of 1-1-create-a-matter (2026-08-05)

- `FIRM_SCOPED_MODELS` (`adapters/db/firmScopeExtension.ts`) is a manually-maintained allow-list with nothing enforcing it stays in sync with the schema as new entities are added. Real but not a Story 1.1 blocker; revisit when the next firm-scoped entity (Document, Story 1.3) is added.
- No audit trail (`createdByUserId`) is recorded for who created a Matter (`adapters/db/matterRepository.ts`). Not required by any current AC/AD — worth a product call, not a code defect.
- `prisma/seed.ts` has a benign check-then-create race condition (not atomic). Dev-only script, low real-world impact.
- `prisma/schema.prisma`'s `name`/`client` fields have no DB-level length/non-empty constraints, only app-layer validation. Defense-in-depth, not required by any AD.
- `prisma/schema.prisma`'s Firm→Matter relation has no explicit `onDelete` policy. Firm deletion isn't a feature yet.
- `firmScopeExtension`'s rejection of `findUnique`/`update`/`delete`/`upsert` is only exercised via `findUnique` in `tests/integration/firmScopeExtension.test.ts`. Exercise the rest when a real update/delete path exists.
