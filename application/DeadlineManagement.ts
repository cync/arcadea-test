import type { Document } from "../domain/Document";
import type { DocumentRepository } from "./DocumentDetection";

export class DeadlineError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "FORBIDDEN",
  ) {
    super(message);
    this.name = "DeadlineError";
  }
}

/**
 * Firm-scoped. Permission is document-instance-scoped, not role-scoped (same
 * reasoning as AttorneyReassignment, Story 1.5): only the Document's current
 * attorneyOfRecordId may set/edit its Deadline. EXPERIENCE.md explicitly
 * excludes Office Manager from this control (FR-6 names the Attorney of
 * Record specifically) — don't grant it a blanket staff exception.
 */
export class DeadlineManagement {
  constructor(private readonly documents: DocumentRepository) {}

  async setDeadline(input: { documentId: string; actorId: string; deadline: Date }): Promise<Document> {
    const document = await this.documents.findById(input.documentId);
    if (!document) {
      throw new DeadlineError("Document not found", "NOT_FOUND");
    }

    if (document.attorneyOfRecordId !== input.actorId) {
      throw new DeadlineError("Only the Document's Attorney of Record may set its Deadline", "FORBIDDEN");
    }

    return this.documents.setDeadline(input.documentId, input.deadline);
  }
}
