import { describe, expect, it, vi } from "vitest";
import { DeadlineManagement, DeadlineError } from "../../application/DeadlineManagement";
import type { DocumentRepository } from "../../application/DocumentDetection";
import type { Document } from "../../domain/Document";

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
    statusChangedAt: new Date("2026-08-01"),
    createdAt: new Date("2026-08-01"),
    updatedAt: new Date("2026-08-01"),
    ...overrides,
  };
}

function makeRepo(doc: Document | null): DocumentRepository & { setDeadline: ReturnType<typeof vi.fn> } {
  return {
    findById: vi.fn(async () => doc),
    findByDriveFileId: vi.fn(),
    create: vi.fn(),
    findLatestForMatter: vi.fn(),
    setAttorneyOfRecord: vi.fn(),
    findAllForFirm: vi.fn(),
    updateStatus: vi.fn(),
    setDeadline: vi.fn(async (_id: string, deadline: Date) => makeDoc({ deadline })),
    markStaleAlertSent: vi.fn(),
  };
}

describe("DeadlineManagement.setDeadline", () => {
  it("allows the Document's current Attorney of Record to set a Deadline", async () => {
    const documents = makeRepo(makeDoc({ attorneyOfRecordId: "attorney-1" }));
    const service = new DeadlineManagement(documents);
    const deadline = new Date("2026-09-01");

    const result = await service.setDeadline({ documentId: "doc-1", actorId: "attorney-1", deadline });

    expect(documents.setDeadline).toHaveBeenCalledWith("doc-1", deadline);
    expect(result.deadline).toEqual(deadline);
  });

  it("allows editing an already-set Deadline", async () => {
    const documents = makeRepo(makeDoc({ attorneyOfRecordId: "attorney-1", deadline: new Date("2026-08-15") }));
    const service = new DeadlineManagement(documents);
    const newDeadline = new Date("2026-09-15");

    const result = await service.setDeadline({ documentId: "doc-1", actorId: "attorney-1", deadline: newDeadline });

    expect(result.deadline).toEqual(newDeadline);
  });

  it("rejects a staff member who is not this Document's Attorney of Record", async () => {
    const documents = makeRepo(makeDoc({ attorneyOfRecordId: "attorney-1" }));
    const service = new DeadlineManagement(documents);

    await expect(
      service.setDeadline({ documentId: "doc-1", actorId: "paralegal-1", deadline: new Date("2026-09-01") }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(documents.setDeadline).not.toHaveBeenCalled();
  });

  it("rejects an Office Manager — EXPERIENCE.md explicitly excludes this role from Deadline control", async () => {
    const documents = makeRepo(makeDoc({ attorneyOfRecordId: "attorney-1" }));
    const service = new DeadlineManagement(documents);

    await expect(
      service.setDeadline({ documentId: "doc-1", actorId: "office-manager-1", deadline: new Date("2026-09-01") }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a different Attorney of Record who doesn't own this Document", async () => {
    const documents = makeRepo(makeDoc({ attorneyOfRecordId: "attorney-1" }));
    const service = new DeadlineManagement(documents);

    await expect(
      service.setDeadline({ documentId: "doc-1", actorId: "attorney-2", deadline: new Date("2026-09-01") }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND for an unknown Document", async () => {
    const documents = makeRepo(null);
    const service = new DeadlineManagement(documents);

    await expect(
      service.setDeadline({ documentId: "missing", actorId: "attorney-1", deadline: new Date("2026-09-01") }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("DeadlineError instances carry the expected name", () => {
    const err = new DeadlineError("test", "FORBIDDEN");
    expect(err.name).toBe("DeadlineError");
    expect(err.code).toBe("FORBIDDEN");
  });
});
