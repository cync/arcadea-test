import { describe, expect, it, vi } from "vitest";
import { AttorneyReassignment, ReassignmentError, type AuditEntryRepository } from "../../application/AttorneyReassignment";
import type { DocumentRepository } from "../../application/DocumentDetection";
import type { UserRepository } from "../../application/MatterOnboarding";
import type { Document } from "../../domain/Document";
import type { User } from "../../domain/User";

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

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "attorney-2",
    firmId: "firm-1",
    name: "New Attorney",
    email: "new@x.com",
    role: "ATTORNEY_OF_RECORD",
    ...overrides,
  };
}

function makeDocsRepo(doc: Document | null): DocumentRepository & { setAttorneyOfRecord: ReturnType<typeof vi.fn> } {
  return {
    findById: vi.fn(async () => doc),
    findByDriveFileId: vi.fn(),
    create: vi.fn(),
    findLatestForMatter: vi.fn(),
    setAttorneyOfRecord: vi.fn(async (_id: string, attorneyId: string) => makeDoc({ attorneyOfRecordId: attorneyId })),
    findAllForFirm: vi.fn(),
    updateStatus: vi.fn(),
    setDeadline: vi.fn(),
    markStaleAlertSent: vi.fn(),
  };
}

function makeUsersRepo(user: User | null): UserRepository {
  return { findById: vi.fn(async () => user), findByRole: vi.fn(async () => []) };
}

function makeAuditRepo(): AuditEntryRepository & { create: ReturnType<typeof vi.fn> } {
  return { create: vi.fn(async (input) => ({ id: "audit-1", timestamp: new Date(), ...input })) };
}

describe("AttorneyReassignment.reassign", () => {
  it("allows the current Attorney of Record to reassign, and logs an AuditEntry", async () => {
    const documents = makeDocsRepo(makeDoc({ attorneyOfRecordId: "attorney-1" }));
    const users = makeUsersRepo(makeUser({ id: "attorney-2" }));
    const auditEntries = makeAuditRepo();
    const service = new AttorneyReassignment(documents, users, auditEntries);

    const result = await service.reassign({
      documentId: "doc-1",
      firmId: "firm-1",
      actorId: "attorney-1",
      actorRole: "ATTORNEY_OF_RECORD",
      newAttorneyId: "attorney-2",
      reason: "Handing off",
    });

    expect(result.attorneyOfRecordId).toBe("attorney-2");
    expect(documents.setAttorneyOfRecord).toHaveBeenCalledWith("doc-1", "attorney-2");
    expect(auditEntries.create).toHaveBeenCalledWith({
      firmId: "firm-1",
      documentId: "doc-1",
      matterId: "matter-1",
      actorId: "attorney-1",
      action: "ATTORNEY_REASSIGNED",
      reason: "Handing off",
    });
  });

  it("allows an Office Manager to reassign a Document they don't own", async () => {
    const documents = makeDocsRepo(makeDoc({ attorneyOfRecordId: "attorney-1" }));
    const users = makeUsersRepo(makeUser({ id: "attorney-2" }));
    const auditEntries = makeAuditRepo();
    const service = new AttorneyReassignment(documents, users, auditEntries);

    const result = await service.reassign({
      documentId: "doc-1",
      firmId: "firm-1",
      actorId: "office-manager-1",
      actorRole: "OFFICE_MANAGER",
      newAttorneyId: "attorney-2",
    });

    expect(result.attorneyOfRecordId).toBe("attorney-2");
  });

  it("rejects a staff member who is neither the current Attorney of Record nor an Office Manager", async () => {
    const documents = makeDocsRepo(makeDoc({ attorneyOfRecordId: "attorney-1" }));
    const users = makeUsersRepo(makeUser({ id: "attorney-2" }));
    const auditEntries = makeAuditRepo();
    const service = new AttorneyReassignment(documents, users, auditEntries);

    await expect(
      service.reassign({
        documentId: "doc-1",
        firmId: "firm-1",
        actorId: "paralegal-1",
        actorRole: "PARALEGAL",
        newAttorneyId: "attorney-2",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(documents.setAttorneyOfRecord).not.toHaveBeenCalled();
    expect(auditEntries.create).not.toHaveBeenCalled();
  });

  it("rejects a different Attorney of Record who doesn't own this Document", async () => {
    const documents = makeDocsRepo(makeDoc({ attorneyOfRecordId: "attorney-1" }));
    const users = makeUsersRepo(makeUser({ id: "attorney-3" }));
    const auditEntries = makeAuditRepo();
    const service = new AttorneyReassignment(documents, users, auditEntries);

    await expect(
      service.reassign({
        documentId: "doc-1",
        firmId: "firm-1",
        actorId: "attorney-99",
        actorRole: "ATTORNEY_OF_RECORD",
        newAttorneyId: "attorney-3",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND for an unknown Document", async () => {
    const documents = makeDocsRepo(null);
    const users = makeUsersRepo(makeUser());
    const auditEntries = makeAuditRepo();
    const service = new AttorneyReassignment(documents, users, auditEntries);

    await expect(
      service.reassign({
        documentId: "missing",
        firmId: "firm-1",
        actorId: "attorney-1",
        actorRole: "ATTORNEY_OF_RECORD",
        newAttorneyId: "attorney-2",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws VALIDATION_ERROR when newAttorneyId doesn't resolve to a User in the calling Firm", async () => {
    const documents = makeDocsRepo(makeDoc({ attorneyOfRecordId: "attorney-1" }));
    const users = makeUsersRepo(null);
    const auditEntries = makeAuditRepo();
    const service = new AttorneyReassignment(documents, users, auditEntries);

    await expect(
      service.reassign({
        documentId: "doc-1",
        firmId: "firm-1",
        actorId: "attorney-1",
        actorRole: "ATTORNEY_OF_RECORD",
        newAttorneyId: "nonexistent",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("throws VALIDATION_ERROR when newAttorneyId belongs to a different Firm", async () => {
    const documents = makeDocsRepo(makeDoc({ attorneyOfRecordId: "attorney-1" }));
    const users = makeUsersRepo(makeUser({ id: "attorney-2", firmId: "firm-2" }));
    const auditEntries = makeAuditRepo();
    const service = new AttorneyReassignment(documents, users, auditEntries);

    await expect(
      service.reassign({
        documentId: "doc-1",
        firmId: "firm-1",
        actorId: "attorney-1",
        actorRole: "ATTORNEY_OF_RECORD",
        newAttorneyId: "attorney-2",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("ReassignmentError instances carry the expected name", async () => {
    const err = new ReassignmentError("test", "FORBIDDEN");
    expect(err.name).toBe("ReassignmentError");
    expect(err.code).toBe("FORBIDDEN");
  });
});
