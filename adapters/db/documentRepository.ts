import type { Document, DocumentStatus } from "../../domain/Document";
import type { DocumentRepository } from "../../application/DocumentDetection";
import { firmScopedClient } from "./prisma";

export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly firmId: string) {}

  async findById(id: string): Promise<Document | null> {
    const client = firmScopedClient(this.firmId);
    return client.document.findFirst({ where: { id } });
  }

  async findByDriveFileId(matterId: string, driveFileId: string): Promise<Document | null> {
    const client = firmScopedClient(this.firmId);
    return client.document.findFirst({ where: { matterId, driveFileId } });
  }

  async create(input: {
    firmId: string;
    matterId: string;
    driveFileId: string;
    name: string;
    attorneyOfRecordId: string;
  }): Promise<Document> {
    if (input.firmId !== this.firmId) {
      throw new Error(
        `PrismaDocumentRepository: input.firmId ("${input.firmId}") does not match the repository's bound firmId ("${this.firmId}")`,
      );
    }
    const client = firmScopedClient(this.firmId);
    return client.document.create({
      data: {
        firmId: this.firmId,
        matterId: input.matterId,
        driveFileId: input.driveFileId,
        name: input.name,
        attorneyOfRecordId: input.attorneyOfRecordId,
      },
    });
  }

  async findLatestForMatter(matterId: string): Promise<Document | null> {
    const client = firmScopedClient(this.firmId);
    return client.document.findFirst({ where: { matterId }, orderBy: { createdAt: "desc" } });
  }

  async setAttorneyOfRecord(documentId: string, attorneyId: string): Promise<Document> {
    const client = firmScopedClient(this.firmId);
    await client.document.updateMany({ where: { id: documentId }, data: { attorneyOfRecordId: attorneyId } });
    const updated = await client.document.findFirst({ where: { id: documentId } });
    if (!updated) {
      throw new Error(`PrismaDocumentRepository.setAttorneyOfRecord: Document ${documentId} not found after update`);
    }
    return updated;
  }

  async findAllForFirm(): Promise<Document[]> {
    const client = firmScopedClient(this.firmId);
    return client.document.findMany({});
  }

  async updateStatus(documentId: string, status: DocumentStatus, reviewedByUserId?: string): Promise<Document> {
    const client = firmScopedClient(this.firmId);
    await client.document.updateMany({
      where: { id: documentId },
      data: reviewedByUserId
        ? { status, statusChangedAt: new Date(), reviewedByUserId, staleAlertSentAt: null }
        : { status, statusChangedAt: new Date(), staleAlertSentAt: null },
    });
    const updated = await client.document.findFirst({ where: { id: documentId } });
    if (!updated) {
      throw new Error(`PrismaDocumentRepository.updateStatus: Document ${documentId} not found after update`);
    }
    return updated;
  }

  async setDeadline(documentId: string, deadline: Date): Promise<Document> {
    const client = firmScopedClient(this.firmId);
    await client.document.updateMany({ where: { id: documentId }, data: { deadline } });
    const updated = await client.document.findFirst({ where: { id: documentId } });
    if (!updated) {
      throw new Error(`PrismaDocumentRepository.setDeadline: Document ${documentId} not found after update`);
    }
    return updated;
  }

  async markStaleAlertSent(documentId: string, sentAt: Date): Promise<void> {
    const client = firmScopedClient(this.firmId);
    await client.document.updateMany({ where: { id: documentId }, data: { staleAlertSentAt: sentAt } });
  }
}
