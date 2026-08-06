import { DocumentDetection } from "../application/DocumentDetection";
import { PrismaDocumentRepository } from "../adapters/db/documentRepository";
import { GoogleDriveApiAdapter } from "../adapters/drive/googleDriveApiAdapter";
import { listScanTargets } from "../adapters/db/scanTargetsRepository";
import { decrypt } from "../adapters/crypto/tokenCipher";

export interface ScanRunResult {
  firmId: string;
  matterId: string;
  createdCount: number;
  skippedReason?: string;
}

/**
 * The scheduled job runner named in ARCHITECTURE-SPINE.md's Structural Seed.
 * No real periodic trigger is wired up in this environment (see Story 1.3
 * Dev Notes) — this is the callable logic a real scheduler (Vercel Cron,
 * node-cron, etc.) or the manual `/api/jobs/scan-documents` route invokes.
 */
export async function scanAllConnectedMatters(): Promise<ScanRunResult[]> {
  const targets = await listScanTargets();
  const results: ScanRunResult[] = [];

  for (const target of targets) {
    const documents = new PrismaDocumentRepository(target.firmId);
    const detection = new DocumentDetection(documents, (token) => new GoogleDriveApiAdapter(token));
    const accessToken = decrypt(target.accessTokenEncrypted);
    const result = await detection.scanMatter(target.matter, accessToken);
    results.push({
      firmId: target.firmId,
      matterId: result.matterId,
      createdCount: result.created.length,
      skippedReason: result.skippedReason,
    });
  }

  return results;
}
