import { describe, expect, it, vi } from "vitest";
import { StatusTransition, StatusTransitionError } from "../../application/StatusTransition";
import type { DocumentRepository } from "../../application/DocumentDetection";
import type { AuditEntryRepository } from "../../application/AttorneyReassignment";
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

function makeRepo(doc: Document | null): DocumentRepository & { updateStatus: ReturnType<typeof vi.fn> } {
  return {
    findById: vi.fn(async () => doc),
    findByDriveFileId: vi.fn(),
    create: vi.fn(),
    findLatestForMatter: vi.fn(),
    setAttorneyOfRecord: vi.fn(),
    findAllForFirm: vi.fn(),
    updateStatus: vi.fn(async (_id: string, status, reviewedByUserId?: string) =>
      makeDoc({ status, statusChangedAt: new Date("2026-08-05"), reviewedByUserId: reviewedByUserId ?? null }),
    ),
    setDeadline: vi.fn(),
    markStaleAlertSent: vi.fn(),
  };
}

function makeAuditRepo(): AuditEntryRepository & { create: ReturnType<typeof vi.fn> } {
  return { create: vi.fn(async (input) => ({ id: "audit-1", timestamp: new Date(), ...input })) };
}

describe("StatusTransition.transition", () => {
  it("rejects a move to Reviewed with no reviewerId provided", async () => {
    const documents = makeRepo(makeDoc({ status: "DRAFT" }));
    const auditEntries = makeAuditRepo();
    const service = new StatusTransition(documents, auditEntries);

    await expect(
      service.transition({ documentId: "doc-1", firmId: "firm-1", toStatus: "REVIEWED", actorId: "attorney-1" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("allows an arbitrary non-Reviewed Status-to-Status move — no enforced linear order, no audit row", async () => {
    const documents = makeRepo(makeDoc({ status: "FILED_SENT" }));
    const auditEntries = makeAuditRepo();
    const service = new StatusTransition(documents, auditEntries);

    const result = await service.transition({ documentId: "doc-1", firmId: "firm-1", toStatus: "DRAFT", actorId: "attorney-1" });

    expect(documents.updateStatus).toHaveBeenCalledWith("doc-1", "DRAFT");
    expect(result.status).toBe("DRAFT");
    expect(auditEntries.create).not.toHaveBeenCalled();
  });

  it("moves a Document to Reviewed when reviewerId matches actorId, writing reviewedByUserId and an AuditEntry", async () => {
    const documents = makeRepo(makeDoc({ status: "DRAFT", matterId: "matter-1" }));
    const auditEntries = makeAuditRepo();
    const service = new StatusTransition(documents, auditEntries);

    const result = await service.transition({
      documentId: "doc-1",
      firmId: "firm-1",
      toStatus: "REVIEWED",
      actorId: "attorney-1",
      reviewerId: "attorney-1",
    });

    expect(documents.updateStatus).toHaveBeenCalledWith("doc-1", "REVIEWED", "attorney-1");
    expect(result.reviewedByUserId).toBe("attorney-1");
    expect(auditEntries.create).toHaveBeenCalledWith({
      firmId: "firm-1",
      documentId: "doc-1",
      matterId: "matter-1",
      actorId: "attorney-1",
      action: "REVIEWED",
      reason: null,
    });
  });

  it("rejects a move to Reviewed when reviewerId does not match actorId", async () => {
    const documents = makeRepo(makeDoc({ status: "DRAFT" }));
    const auditEntries = makeAuditRepo();
    const service = new StatusTransition(documents, auditEntries);

    await expect(
      service.transition({
        documentId: "doc-1",
        firmId: "firm-1",
        toStatus: "REVIEWED",
        actorId: "attorney-1",
        reviewerId: "attorney-2",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(documents.updateStatus).not.toHaveBeenCalled();
    expect(auditEntries.create).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unknown Document", async () => {
    const documents = makeRepo(null);
    const auditEntries = makeAuditRepo();
    const service = new StatusTransition(documents, auditEntries);

    await expect(
      service.transition({ documentId: "missing", firmId: "firm-1", toStatus: "REVIEWED", actorId: "attorney-1", reviewerId: "attorney-1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("moves a Document to Filed/Sent via a delegated approval, writing an AuditEntry but no reviewedByUserId", async () => {
    const documents = makeRepo(makeDoc({ status: "DRAFT", matterId: "matter-1" }));
    const auditEntries = makeAuditRepo();
    const service = new StatusTransition(documents, auditEntries);

    const result = await service.transition({
      documentId: "doc-1",
      firmId: "firm-1",
      toStatus: "FILED_SENT",
      actorId: "office-manager-1",
      delegatedApproval: { reason: "Attorney unreachable" },
    });

    expect(documents.updateStatus).toHaveBeenCalledWith("doc-1", "FILED_SENT");
    expect(result.status).toBe("FILED_SENT");
    expect(auditEntries.create).toHaveBeenCalledWith({
      firmId: "firm-1",
      documentId: "doc-1",
      matterId: "matter-1",
      actorId: "office-manager-1",
      action: "DELEGATED_APPROVAL",
      reason: "Attorney unreachable",
    });
  });

  it("throws NOT_FOUND for an unknown Document via the delegated approval path too", async () => {
    const documents = makeRepo(null);
    const auditEntries = makeAuditRepo();
    const service = new StatusTransition(documents, auditEntries);

    await expect(
      service.transition({
        documentId: "missing",
        firmId: "firm-1",
        toStatus: "FILED_SENT",
        actorId: "office-manager-1",
        delegatedApproval: {},
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("StatusTransitionError instances carry the expected name", () => {
    const err = new StatusTransitionError("test", "NOT_FOUND");
    expect(err.name).toBe("StatusTransitionError");
    expect(err.code).toBe("NOT_FOUND");
  });
});
