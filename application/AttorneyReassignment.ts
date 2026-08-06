import type { Document } from "../domain/Document";
import type { AuditEntry } from "../domain/AuditEntry";
import type { Role } from "../domain/User";
import type { DocumentRepository } from "./DocumentDetection";
import type { UserRepository } from "./MatterOnboarding";

export interface AuditEntryRepository {
  create(input: {
    firmId: string;
    documentId: string;
    matterId: string;
    actorId: string;
    action: string;
    reason: string | null;
  }): Promise<AuditEntry>;
}

export class ReassignmentError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "VALIDATION_ERROR" | "FORBIDDEN",
  ) {
    super(message);
    this.name = "ReassignmentError";
  }
}

/**
 * Firm-scoped. Permission is document-instance-scoped, not role-scoped
 * (AC #2): allowed only for the Document's *current* Attorney of Record or
 * an Office Manager — never a static role allow-list, since a different
 * Attorney of Record who doesn't own this Document must still be rejected.
 */
export class AttorneyReassignment {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly users: UserRepository,
    private readonly auditEntries: AuditEntryRepository,
  ) {}

  async reassign(input: {
    documentId: string;
    firmId: string;
    actorId: string;
    actorRole: Role;
    newAttorneyId: string;
    reason?: string;
  }): Promise<Document> {
    const document = await this.documents.findById(input.documentId);
    if (!document) {
      throw new ReassignmentError("Document not found", "NOT_FOUND");
    }

    const isCurrentAttorney = document.attorneyOfRecordId === input.actorId;
    const isOfficeManager = input.actorRole === "OFFICE_MANAGER";
    if (!isCurrentAttorney && !isOfficeManager) {
      throw new ReassignmentError("Only the current Attorney of Record or an Office Manager may reassign this Document", "FORBIDDEN");
    }

    const newAttorney = await this.users.findById(input.newAttorneyId);
    if (!newAttorney || newAttorney.firmId !== input.firmId) {
      throw new ReassignmentError("newAttorneyId must reference a User in the calling Firm", "VALIDATION_ERROR");
    }

    const updated = await this.documents.setAttorneyOfRecord(input.documentId, input.newAttorneyId);
    await this.auditEntries.create({
      firmId: input.firmId,
      documentId: document.id,
      matterId: document.matterId,
      actorId: input.actorId,
      action: "ATTORNEY_REASSIGNED",
      reason: input.reason ?? null,
    });

    return updated;
  }
}
