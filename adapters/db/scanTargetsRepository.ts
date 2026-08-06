import type { Matter } from "../../domain/Matter";
import { systemClient } from "./prisma";

export interface ScanTarget {
  firmId: string;
  matter: Matter;
  accessTokenEncrypted: string;
}

/**
 * System-level enumeration (see systemClient's doc comment in prisma.ts) —
 * the one legitimate place a query spans multiple Firms: figuring out which
 * Firms have an active Drive connection and which of their Matters have a
 * linked folder, before any per-Firm scoped work (DocumentDetection) starts.
 */
export async function listScanTargets(): Promise<ScanTarget[]> {
  const client = systemClient();
  const firms = await client.firm.findMany({
    where: { driveConnection: { revokedAt: null } },
    include: {
      driveConnection: true,
      matters: { where: { driveFolderId: { not: null } } },
    },
  });

  const targets: ScanTarget[] = [];
  for (const firm of firms) {
    if (!firm.driveConnection) {
      continue;
    }
    for (const matter of firm.matters) {
      targets.push({ firmId: firm.id, matter, accessTokenEncrypted: firm.driveConnection.accessTokenEncrypted });
    }
  }
  return targets;
}
