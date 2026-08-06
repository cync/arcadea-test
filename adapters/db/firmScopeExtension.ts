import { Prisma } from "../../generated/prisma/client";

/**
 * Models scoped by AD-1 (ARCHITECTURE-SPINE.md). Add every new firm-owned
 * entity here as it's introduced — this extension is the single enforcement
 * point, not a per-entity convention.
 */
const FIRM_SCOPED_MODELS = new Set(["Matter", "DriveConnection", "User", "Document", "AuditEntry"]);

// Ops that only need a `where` filter — none of these carry a `data` payload
// that could smuggle a different firmId through.
const READ_OR_DELETE_OPS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy", "deleteMany"]);
// updateMany carries BOTH where and data — data.firmId must be overwritten
// too, or a scoped client could reassign a row to another Firm.
const UPDATE_MANY_OPS = new Set(["updateMany"]);
const CREATE_OPS = new Set(["create"]);

/**
 * AD-1: every read/write against a firm-scoped model is filtered by firmId
 * "by construction" — this is that construction. Deliberately a strict
 * allow-list: operations not explicitly handled are rejected rather than
 * silently passed through unscoped (findUnique/update/delete/upsert by a
 * bare unique key are rejected on purpose — callers must go through
 * findFirst/updateMany/deleteMany so a firmId filter is always attachable).
 */
export function firmScopeExtension(firmId: string) {
  if (!firmId) {
    throw new Error("firmScopeExtension requires a firmId — unscoped access is not permitted");
  }

  return Prisma.defineExtension((client) =>
    client.$extends({
      name: "firm-scope",
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!model || !FIRM_SCOPED_MODELS.has(model)) {
              return query(args);
            }

            // Prisma can invoke this with `args === undefined` for some
            // zero-argument calls (e.g. `matter.count()`) — never property-
            // access args directly.
            const safeArgs = (args ?? {}) as { where?: object; data?: object };

            if (READ_OR_DELETE_OPS.has(operation)) {
              return query({ ...safeArgs, where: { ...safeArgs.where, firmId } });
            }

            if (UPDATE_MANY_OPS.has(operation)) {
              // Overwrite firmId in BOTH where and data — where scopes which
              // rows are touched, data is what a caller could otherwise use
              // to reassign a row to a different Firm.
              return query({
                ...safeArgs,
                where: { ...safeArgs.where, firmId },
                data: { ...safeArgs.data, firmId },
              });
            }

            if (CREATE_OPS.has(operation)) {
              return query({ ...safeArgs, data: { ...safeArgs.data, firmId } });
            }

            throw new Error(
              `firmScopeExtension: operation "${operation}" on "${model}" is not allow-listed for firm scoping. ` +
                "Use findFirst/updateMany/deleteMany (with an id in the where clause) instead of findUnique/update/delete/upsert " +
                "so a firmId filter can always be attached — see ARCHITECTURE-SPINE.md AD-1.",
            );
          },
        },
      },
    }),
  );
}
