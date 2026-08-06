import { describe, expect, it, vi } from "vitest";
import { DocumentDetection, type DocumentRepository } from "../../application/DocumentDetection";
import type { DriveConnector, DriveFile } from "../../ports/DriveConnector";
import type { Matter } from "../../domain/Matter";
import type { Document } from "../../domain/Document";

function makeMatter(overrides: Partial<Matter> = {}): Matter {
  return {
    id: "matter-1",
    firmId: "firm-1",
    name: "Smith v. Jones",
    client: "Smith",
    driveFolderId: "folder-1",
    primaryAttorneyId: "attorney-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

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

function makeRepo(existingFileIds: string[] = []): DocumentRepository & { create: ReturnType<typeof vi.fn> } {
  return {
    findById: vi.fn(async () => null),
    findByDriveFileId: vi.fn(async (_matterId: string, driveFileId: string) =>
      existingFileIds.includes(driveFileId) ? makeDoc({ driveFileId }) : null,
    ),
    create: vi.fn(async (input) => makeDoc({ driveFileId: input.driveFileId, name: input.name, attorneyOfRecordId: input.attorneyOfRecordId })),
    findLatestForMatter: vi.fn(async () => null),
    setAttorneyOfRecord: vi.fn(async (_id, attorneyId) => makeDoc({ attorneyOfRecordId: attorneyId })),
    findAllForFirm: vi.fn(async () => []),
    updateStatus: vi.fn(),
    setDeadline: vi.fn(),
    markStaleAlertSent: vi.fn(),
  };
}

function makeConnector(files: DriveFile[]): DriveConnector {
  return {
    connect: vi.fn(),
    listNewFiles: vi.fn(async () => files),
    getFileMetadata: vi.fn(),
    resolveLink: vi.fn(),
    uploadFile: vi.fn(),
  };
}

describe("DocumentDetection.scanMatter", () => {
  it("creates a Document at Draft, owned by the Matter's primary attorney", async () => {
    const repo = makeRepo();
    const files: DriveFile[] = [{ id: "file-1", name: "Motion.pdf", modifiedAt: new Date() }];
    const detection = new DocumentDetection(repo, () => makeConnector(files));

    const result = await detection.scanMatter(makeMatter(), "access-token");

    expect(result.created).toHaveLength(1);
    expect(result.created[0].attorneyOfRecordId).toBe("attorney-1");
    expect(result.created[0].status).toBe("DRAFT");
    expect(repo.create).toHaveBeenCalledWith({
      firmId: "firm-1",
      matterId: "matter-1",
      driveFileId: "file-1",
      name: "Motion.pdf",
      attorneyOfRecordId: "attorney-1",
    });
  });

  it("does not re-create a file already recorded (defensive de-dupe by driveFileId)", async () => {
    const repo = makeRepo(["file-1"]);
    const files: DriveFile[] = [{ id: "file-1", name: "Motion.pdf", modifiedAt: new Date() }];
    const detection = new DocumentDetection(repo, () => makeConnector(files));

    const result = await detection.scanMatter(makeMatter(), "access-token");

    expect(result.created).toHaveLength(0);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("skips a Matter with no linked Drive folder", async () => {
    const repo = makeRepo();
    const detection = new DocumentDetection(repo, () => makeConnector([]));

    const result = await detection.scanMatter(makeMatter({ driveFolderId: null }), "access-token");

    expect(result.skippedReason).toBe("no-drive-folder");
    expect(result.created).toHaveLength(0);
  });

  it("skips a Matter with no primary attorney assigned", async () => {
    const repo = makeRepo();
    const detection = new DocumentDetection(repo, () => makeConnector([]));

    const result = await detection.scanMatter(makeMatter({ primaryAttorneyId: null }), "access-token");

    expect(result.skippedReason).toBe("no-primary-attorney");
    expect(result.created).toHaveLength(0);
  });

  it("only ever queries listNewFiles within the Matter's own linked folder (AC #3, by construction)", async () => {
    const repo = makeRepo();
    const connector = makeConnector([]);
    const detection = new DocumentDetection(repo, () => connector);

    await detection.scanMatter(makeMatter({ driveFolderId: "folder-xyz" }), "access-token");

    expect(connector.listNewFiles).toHaveBeenCalledWith("folder-xyz", undefined);
  });

  it("passes the latest known Document's createdAt as the `since` cursor", async () => {
    const repo = makeRepo();
    const since = new Date("2026-08-01");
    repo.findLatestForMatter = vi.fn(async () => makeDoc({ createdAt: since }));
    const connector = makeConnector([]);
    const detection = new DocumentDetection(repo, () => connector);

    await detection.scanMatter(makeMatter(), "access-token");

    expect(connector.listNewFiles).toHaveBeenCalledWith("folder-1", since);
  });

  it("creates multiple new Documents from multiple new files in one scan", async () => {
    const repo = makeRepo();
    const files: DriveFile[] = [
      { id: "file-1", name: "Motion.pdf", modifiedAt: new Date() },
      { id: "file-2", name: "Exhibit A.pdf", modifiedAt: new Date() },
    ];
    const detection = new DocumentDetection(repo, () => makeConnector(files));

    const result = await detection.scanMatter(makeMatter(), "access-token");

    expect(result.created).toHaveLength(2);
  });
});
