import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { firmScopeExtension } from "./firmScopeExtension";

/**
 * Base (unscoped) client — for use ONLY inside adapters/db/. Nothing outside
 * this directory may import it directly (AD-1's raw-SQL/unscoped-access ban
 * is enforced for this file by keeping it un-exported outside adapters/db/,
 * and by the ESLint rule banning $queryRaw/$executeRaw elsewhere).
 */
function createBaseClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Cached on globalThis, not just a module-level variable — Next.js dev-mode
// HMR re-evaluates modules on every reload, which would otherwise create a
// fresh PrismaClient (and connection pool) each time and exhaust the
// database's connection limit. globalThis survives the reload; production
// only ever populates it once anyway.
const globalForPrisma = globalThis as unknown as {
  __docketPrismaBaseClient?: ReturnType<typeof createBaseClient>;
};

function getBaseClient() {
  globalForPrisma.__docketPrismaBaseClient ??= createBaseClient();
  return globalForPrisma.__docketPrismaBaseClient;
}

/**
 * The only way the rest of the app is meant to touch the database:
 * a client pre-scoped to one Firm, per AD-1. Cheap to create per-request —
 * extensions share the base client's connection pool and query engine.
 */
export function firmScopedClient(firmId: string) {
  return getBaseClient().$extends(firmScopeExtension(firmId));
}

/**
 * For system-level operations that legitimately span Firms — e.g. the
 * document-detection scheduler enumerating which Firms have an active Drive
 * connection to scan. Firm itself was never in FIRM_SCOPED_MODELS (AD-1 scopes
 * tenant *data*, not the tenant list itself), so listing Firms here is exactly
 * as safe as it would be through firmScopedClient — the only difference is not
 * needing a firmId before you know which ones exist. Never use this to query
 * a FIRM_SCOPED_MODELS entity (Matter/Document/User/DriveConnection) directly
 * — only Firm and its to-one/to-many relations navigated *from* a specific
 * Firm row, which are inherently scoped by that row.
 */
export function systemClient() {
  return getBaseClient();
}
