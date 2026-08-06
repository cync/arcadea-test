import { describe, expect, it, vi } from "vitest";
import { DocumentViewer, DocumentNotFoundError } from "../../application/DocumentViewer";
import type { DocumentRepository } from "../../application/DocumentDetection";
import type { DriveConnectionRepository } from "../../application/DriveOnboarding";
import type { DriveConnector } from "../../ports/DriveConnector";
import type { Document } from "../../domain/Document";
import type { DriveConnection } from "../../domain/DriveConnection";
import { encrypt } from "../../adapters/crypto/tokenCipher";

process.env.TOKEN_ENCRYPTION_KEY = "Bzyuseu9/yH7/F0sHlxeFru+C9lvwziz66mbKIF/0sA=";

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    firmId: "firm-1",
    matterId: "matter-1",
    driveFileId: "file-1",
    name: "Motion.pdf",
    status: "DRAFT",
    attorneyOfRecordId: "attorney-1",
    reviewedByUserId: null,
    deadline: null,
    staleAlertSentAt: null,
    statusChangedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDocsRepo(doc: Document | null): DocumentRepository {
  return {
    findById: vi.fn(async () => doc),
    findByDriveFileId: vi.fn(),
    create: vi.fn(),
    findLatestForMatter: vi.fn(),
    setAttorneyOfRecord: vi.fn(),
    findAllForFirm: vi.fn(),
    updateStatus: vi.fn(),
    setDeadline: vi.fn(),
    markStaleAlertSent: vi.fn(),
  };
}

function makeConnectionsRepo(connection: DriveConnection | null): DriveConnectionRepository {
  return {
    findByFirmId: vi.fn(async () => connection),
    create: vi.fn(),
    updateTokens: vi.fn(),
    revoke: vi.fn(),
  };
}

const activeConnection: DriveConnection = {
  id: "conn-1",
  firmId: "firm-1",
  accessTokenEncrypted: encrypt("fake-token"),
  refreshTokenEncrypted: encrypt("fake-refresh"),
  expiresAt: new Date("2026-09-01"),
  revokedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeConnectorFactory(behavior: "success" | "throw"): (accessToken: string) => DriveConnector {
  return () => ({
    connect: vi.fn(),
    listNewFiles: vi.fn(),
    getFileMetadata:
      behavior === "success"
        ? vi.fn(async () => ({ id: "file-1", name: "Motion.pdf", modifiedAt: new Date("2026-08-01"), mimeType: "application/pdf" }))
        : vi.fn(async () => {
            throw new Error("404");
          }),
    resolveLink: behavior === "success" ? vi.fn(async () => "https://drive.google.com/file/d/file-1/view") : vi.fn(async () => {
      throw new Error("404");
    }),
    uploadFile: vi.fn(),
  });
}

describe("DocumentViewer.getDocument", () => {
  it("returns Drive metadata and link when the connection is active and Drive calls succeed", async () => {
    const viewer = new DocumentViewer(makeDocsRepo(makeDoc()), makeConnectionsRepo(activeConnection), makeConnectorFactory("success"));

    const view = await viewer.getDocument({ documentId: "doc-1", firmId: "firm-1" });

    expect(view.drive).toMatchObject({ available: true, link: "https://drive.google.com/file/d/file-1/view" });
  });

  it("returns available: false, not an error, when there's no Drive connection", async () => {
    const viewer = new DocumentViewer(makeDocsRepo(makeDoc()), makeConnectionsRepo(null), makeConnectorFactory("success"));

    const view = await viewer.getDocument({ documentId: "doc-1", firmId: "firm-1" });

    expect(view.drive.available).toBe(false);
    expect(view.document.id).toBe("doc-1");
  });

  it("returns available: false when the connection is revoked", async () => {
    const revoked = { ...activeConnection, revokedAt: new Date() };
    const viewer = new DocumentViewer(makeDocsRepo(makeDoc()), makeConnectionsRepo(revoked), makeConnectorFactory("success"));

    const view = await viewer.getDocument({ documentId: "doc-1", firmId: "firm-1" });

    expect(view.drive.available).toBe(false);
  });

  it("returns available: false, not an error, when the Drive calls throw (file deleted/moved)", async () => {
    const viewer = new DocumentViewer(makeDocsRepo(makeDoc()), makeConnectionsRepo(activeConnection), makeConnectorFactory("throw"));

    const view = await viewer.getDocument({ documentId: "doc-1", firmId: "firm-1" });

    expect(view.drive.available).toBe(false);
    expect(view.document.id).toBe("doc-1");
  });

  it("throws DocumentNotFoundError for an unknown Document", async () => {
    const viewer = new DocumentViewer(makeDocsRepo(null), makeConnectionsRepo(activeConnection), makeConnectorFactory("success"));

    await expect(viewer.getDocument({ documentId: "missing", firmId: "firm-1" })).rejects.toThrow(DocumentNotFoundError);
  });
});
