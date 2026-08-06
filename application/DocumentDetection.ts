import type { Document, DocumentStatus } from "../domain/Document";
import type { Matter } from "../domain/Matter";
import type { DriveConnector } from "../ports/DriveConnector";

export interface DocumentRepository {
  findById(id: string): Promise<Document | null>;
  findByDriveFileId(matterId: string, driveFileId: string): Promise<Document | null>;
  create(input: {
    firmId: string;
    matterId: string;
    driveFileId: string;
    name: string;
    attorneyOfRecordId: string;
  }): Promise<Document>;
  findLatestForMatter(matterId: string): Promise<Document | null>;
  setAttorneyOfRecord(documentId: string, attorneyId: string): Promise<Document>;
  findAllForFirm(): Promise<Document[]>;
  updateStatus(documentId: string, status: DocumentStatus, reviewedByUserId?: string): Promise<Document>;
  setDeadline(documentId: string, deadline: Date): Promise<Document>;
  markStaleAlertSent(documentId: string, sentAt: Date): Promise<void>;
}

export interface ScanResult {
  matterId: string;
  created: Document[];
  skippedReason?: "no-drive-folder" | "no-primary-attorney";
}

/**
 * Firm-scoped — constructed with a firm-bound DocumentRepository, same
 * per-request-instance pattern as every other application service. AC #3
 * (a file outside the linked folder is never detected) holds by
 * construction: listNewFiles only ever queries within matter.driveFolderId,
 * there is no broader scan path.
 */
export class DocumentDetection {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly driveConnectorFactory: (accessToken: string) => DriveConnector,
  ) {}

  async scanMatter(matter: Matter, accessToken: string): Promise<ScanResult> {
    if (!matter.driveFolderId) {
      return { matterId: matter.id, created: [], skippedReason: "no-drive-folder" };
    }
    if (!matter.primaryAttorneyId) {
      return { matterId: matter.id, created: [], skippedReason: "no-primary-attorney" };
    }

    const latest = await this.documents.findLatestForMatter(matter.id);
    const drive = this.driveConnectorFactory(accessToken);
    const files = await drive.listNewFiles(matter.driveFolderId, latest?.createdAt);

    const created: Document[] = [];
    for (const file of files) {
      // Defensive de-dupe by driveFileId — Drive's `since` filter is
      // best-effort, not a hard guarantee against reprocessing.
      const existing = await this.documents.findByDriveFileId(matter.id, file.id);
      if (existing) {
        continue;
      }
      created.push(
        await this.documents.create({
          firmId: matter.firmId,
          matterId: matter.id,
          driveFileId: file.id,
          name: file.name,
          attorneyOfRecordId: matter.primaryAttorneyId,
        }),
      );
    }

    return { matterId: matter.id, created };
  }
}
