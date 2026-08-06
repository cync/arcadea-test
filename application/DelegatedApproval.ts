import type { Document } from "../domain/Document";
import type { StatusTransition } from "./StatusTransition";

/**
 * AD-3: composes StatusTransition rather than mutating Document
 * independently — no second DocumentRepository/AuditEntryRepository pair,
 * no parallel write path. toStatus is hard-coded to FILED_SENT, never
 * caller-supplied, so AC #1 ("it moves to Filed/Sent") holds by
 * construction. Office-Manager-only eligibility (EXPERIENCE.md: "regardless
 * of whose Document it is") is enforced at the route, not here — this
 * service has no role/ownership check of its own.
 */
export class DelegatedApproval {
  constructor(private readonly statusTransition: StatusTransition) {}

  async approve(input: { documentId: string; firmId: string; actorId: string; reason?: string }): Promise<Document> {
    return this.statusTransition.transition({
      documentId: input.documentId,
      firmId: input.firmId,
      toStatus: "FILED_SENT",
      actorId: input.actorId,
      delegatedApproval: { reason: input.reason },
    });
  }
}
