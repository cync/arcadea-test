import type { AuditEntry } from "../../domain/AuditEntry";
import type { AuditEntryRepository } from "../../application/AttorneyReassignment";
import { firmScopedClient } from "./prisma";

export class PrismaAuditEntryRepository implements AuditEntryRepository {
  constructor(private readonly firmId: string) {}

  async create(input: {
    firmId: string;
    documentId: string;
    matterId: string;
    actorId: string;
    action: string;
    reason: string | null;
  }): Promise<AuditEntry> {
    if (input.firmId !== this.firmId) {
      throw new Error(
        `PrismaAuditEntryRepository: input.firmId ("${input.firmId}") does not match the repository's bound firmId ("${this.firmId}")`,
      );
    }
    const client = firmScopedClient(this.firmId);
    return client.auditEntry.create({
      data: {
        firmId: this.firmId,
        documentId: input.documentId,
        matterId: input.matterId,
        actorId: input.actorId,
        action: input.action,
        reason: input.reason,
      },
    });
  }
}
