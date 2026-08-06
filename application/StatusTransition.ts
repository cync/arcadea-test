import type { Document, DocumentStatus } from "../domain/Document";
import type { DocumentRepository } from "./DocumentDetection";
import type { AuditEntryRepository } from "./AttorneyReassignment";

export class StatusTransitionError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "VALIDATION_ERROR",
  ) {
    super(message);
    this.name = "StatusTransitionError";
  }
}

/**
 * AD-3: the single owner of every Status change — board drag, Move-to-Status
 * menu, or (Epic 4) Delegated Approval all call this, never write
 * Document.status directly. No adjacency/state-machine check: any Status may
 * move to any other Status via explicit action (epics AC #2, EXPERIENCE.md
 * Interaction Primitives).
 *
 * A move to REVIEWED is one special case (Story 2.3, AD-6): the caller must
 * select/confirm *themselves* as the reviewer (reviewerId === actorId),
 * which writes the denormalized reviewedByUserId (AD-3) and appends the
 * matching AuditEntry (AD-6).
 *
 * A delegatedApproval-flagged transition (Story 4.1, AD-3/AD-6) is the other:
 * DelegatedApproval calls this internally rather than mutating Document
 * independently — it writes no denormalized field (AD-3 only sanctions
 * reviewedByUserId/statusChangedAt), only the matching AuditEntry.
 */
export class StatusTransition {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly auditEntries: AuditEntryRepository,
  ) {}

  async transition(input: {
    documentId: string;
    firmId: string;
    toStatus: DocumentStatus;
    actorId: string;
    reviewerId?: string;
    delegatedApproval?: { reason?: string };
  }): Promise<Document> {
    const document = await this.documents.findById(input.documentId);
    if (!document) {
      throw new StatusTransitionError("Document not found", "NOT_FOUND");
    }

    if (input.toStatus === "REVIEWED") {
      if (!input.reviewerId || input.reviewerId !== input.actorId) {
        throw new StatusTransitionError("You must select/confirm yourself as the reviewer", "VALIDATION_ERROR");
      }

      const updated = await this.documents.updateStatus(input.documentId, input.toStatus, input.reviewerId);
      await this.auditEntries.create({
        firmId: input.firmId,
        documentId: document.id,
        matterId: document.matterId,
        actorId: input.actorId,
        action: "REVIEWED",
        reason: null,
      });
      return updated;
    }

    if (input.delegatedApproval) {
      const updated = await this.documents.updateStatus(input.documentId, input.toStatus);
      await this.auditEntries.create({
        firmId: input.firmId,
        documentId: document.id,
        matterId: document.matterId,
        actorId: input.actorId,
        action: "DELEGATED_APPROVAL",
        reason: input.delegatedApproval.reason ?? null,
      });
      return updated;
    }

    return this.documents.updateStatus(input.documentId, input.toStatus);
  }
}
