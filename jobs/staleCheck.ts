import { StaleCheck } from "../application/StaleCheck";
import { PrismaDocumentRepository } from "../adapters/db/documentRepository";
import { PrismaUserRepository } from "../adapters/db/userRepository";
import { ResendEmailAdapter } from "../adapters/email/resendEmailAdapter";
import { systemClient } from "../adapters/db/prisma";

export interface StaleCheckRunResult {
  firmId: string;
  alertsSent: number;
}

/**
 * The scheduled job runner named in ARCHITECTURE-SPINE.md's Structural Seed.
 * No real periodic trigger is wired up in this environment (same as
 * jobs/scanDocuments.ts) — this is the callable logic a real scheduler or
 * the manual /api/jobs/stale-check route invokes. Every Firm is a target
 * (unlike scanDocuments's Drive-connection filter — staleness doesn't
 * depend on Drive at all).
 */
export async function runStaleCheckForAllFirms(): Promise<StaleCheckRunResult[]> {
  const client = systemClient();
  const firms = await client.firm.findMany({ select: { id: true } });
  const emailNotifier = new ResendEmailAdapter();

  const results: StaleCheckRunResult[] = [];
  for (const firm of firms) {
    const documents = new PrismaDocumentRepository(firm.id);
    const users = new PrismaUserRepository(firm.id);
    const staleCheck = new StaleCheck(documents, users, emailNotifier);
    const result = await staleCheck.run();
    results.push({ firmId: firm.id, alertsSent: result.alertsSent });
  }

  return results;
}
