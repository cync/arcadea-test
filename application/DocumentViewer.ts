import type { Document } from "../domain/Document";
import type { DriveConnector } from "../ports/DriveConnector";
import type { DocumentRepository } from "./DocumentDetection";
import type { DriveConnectionRepository } from "./DriveOnboarding";
import { decrypt } from "../adapters/crypto/tokenCipher";

export type DriveViewState =
  | { available: true; lastModifiedAt: Date; link: string }
  | { available: false; reason: string };

export interface DocumentView {
  document: Document;
  drive: DriveViewState;
}

export class DocumentNotFoundError extends Error {
  constructor() {
    super("Document not found");
    this.name = "DocumentNotFoundError";
  }
}

/**
 * Firm-scoped. AC #2 needs no dedicated code: the service returns metadata
 * (a timestamp, a URL string) and never fetches file bytes, so there is no
 * code path that could cache content even by accident.
 *
 * Degradation is deliberate, not a fallback bolted on: a missing/revoked
 * DriveConnection or a moved/deleted Drive file both resolve to
 * `{ available: false }`, never an error — the Document's own record must
 * stay viewable regardless of current Drive reachability (EXPERIENCE.md
 * State Patterns).
 */
export class DocumentViewer {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly connections: DriveConnectionRepository,
    private readonly driveConnectorFactory: (accessToken: string) => DriveConnector,
  ) {}

  async getDocument(input: { documentId: string; firmId: string }): Promise<DocumentView> {
    const document = await this.documents.findById(input.documentId);
    if (!document) {
      throw new DocumentNotFoundError();
    }

    const connection = await this.connections.findByFirmId(input.firmId);
    if (!connection || connection.revokedAt) {
      return { document, drive: { available: false, reason: "Drive connection is not active" } };
    }

    const drive = this.driveConnectorFactory(decrypt(connection.accessTokenEncrypted));
    try {
      const [metadata, link] = await Promise.all([
        drive.getFileMetadata(document.driveFileId),
        drive.resolveLink(document.driveFileId),
      ]);
      return { document, drive: { available: true, lastModifiedAt: metadata.modifiedAt, link } };
    } catch {
      return { document, drive: { available: false, reason: "File not found in Drive" } };
    }
  }
}
