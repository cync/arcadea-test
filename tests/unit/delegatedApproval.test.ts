import { describe, expect, it, vi } from "vitest";
import { DelegatedApproval } from "../../application/DelegatedApproval";
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
    status: "WAITING_ON_CLIENT_SIGNATURE",
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

function makeRepo(doc: Document | null): DocumentRepository {
  return {
    findById: vi.fn(async () => doc),
    findByDriveFileId: vi.fn(),
    create: vi.fn(),
    findLatestForMatter: vi.fn(),
    setAttorneyOfRecord: vi.fn(),
    findAllForFirm: vi.fn(),
    updateStatus: vi.fn(async (_id: string, status) => makeDoc({ status })),
    setDeadline: vi.fn(),
    markStaleAlertSent: vi.fn(),
  };
}

function makeAuditRepo(): AuditEntryRepository & { create: ReturnType<typeof vi.fn> } {
  return { create: vi.fn(async (input) => ({ id: "audit-1", timestamp: new Date(), ...input })) };
}

describe("DelegatedApproval.approve", () => {
  it("moves the Document to Filed/Sent regardless of its current status", async () => {
    const documents = makeRepo(makeDoc({ status: "DRAFT" }));
    const auditEntries = makeAuditRepo();
    const statusTransition = new StatusTransition(documents, auditEntries);
    const service = new DelegatedApproval(statusTransition);

    const result = await service.approve({ documentId: "doc-1", firmId: "firm-1", actorId: "office-manager-1", reason: "Attorney unreachable" });

    expect(documents.updateStatus).toHaveBeenCalledWith("doc-1", "FILED_SENT");
    expect(result.status).toBe("FILED_SENT");
    expect(auditEntries.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELEGATED_APPROVAL", actorId: "office-manager-1", reason: "Attorney unreachable" }),
    );
  });

  it("works with no reason provided", async () => {
    const documents = makeRepo(makeDoc());
    const auditEntries = makeAuditRepo();
    const statusTransition = new StatusTransition(documents, auditEntries);
    const service = new DelegatedApproval(statusTransition);

    await service.approve({ documentId: "doc-1", firmId: "firm-1", actorId: "office-manager-1" });

    expect(auditEntries.create).toHaveBeenCalledWith(expect.objectContaining({ reason: null }));
  });

  it("propagates NOT_FOUND for an unknown Document", async () => {
    const documents = makeRepo(null);
    const auditEntries = makeAuditRepo();
    const statusTransition = new StatusTransition(documents, auditEntries);
    const service = new DelegatedApproval(statusTransition);

    await expect(service.approve({ documentId: "missing", firmId: "firm-1", actorId: "office-manager-1" })).rejects.toBeInstanceOf(
      StatusTransitionError,
    );
  });
});
