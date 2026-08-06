import type { Role } from "../../../domain/User";

// Re-exported so existing call sites (`import { type Role } from "../_lib/session"`)
// keep working — Role's canonical home is now domain/User.ts, since the
// domain layer must not depend on the API layer.
export type { Role };

export interface Session {
  userId: string;
  firmId: string;
  role: Role;
}

const VALID_ROLES: Role[] = ["PARALEGAL", "ATTORNEY_OF_RECORD", "OFFICE_MANAGER", "CLIENT"];

/**
 * TEMPORARY stopgap — no story in the current backlog builds
 * login/authentication (see 1-1-create-a-matter.md "Open Question").
 * Reads session fields from headers so routes are testable/demoable now.
 * Replace with the real AuthProvider adapter (ARCHITECTURE-SPINE.md,
 * Deferred) once that story exists; every call site goes through this one
 * function so the swap is one-file.
 *
 * Environment-gated on purpose: trusting client-supplied headers for
 * identity is a full authentication bypass, so this refuses to resolve
 * anything outside development/test, however this code gets deployed.
 */
export function resolveSession(request: Request): Session | null {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const userId = request.headers.get("x-dev-user-id");
  const firmId = request.headers.get("x-dev-firm-id");
  const role = request.headers.get("x-dev-role");

  if (!userId || !firmId || !role || !VALID_ROLES.includes(role as Role)) {
    return null;
  }

  return { userId, firmId, role: role as Role };
}
