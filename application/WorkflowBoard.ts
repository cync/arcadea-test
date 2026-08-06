import type { Document, DocumentStatus } from "../domain/Document";
import type { DocumentRepository } from "./DocumentDetection";
import { computeAging, type Aging } from "../domain/Aging";

const STATUS_COLUMNS: DocumentStatus[] = ["DRAFT", "REVIEWED", "NEEDS_REVISION", "WAITING_ON_CLIENT_SIGNATURE", "FILED_SENT"];

export type BoardDocument = Document & { aging: Aging };
export type Board = Record<DocumentStatus, BoardDocument[]>;

/**
 * Firm-scoped read model. "Access to a Matter" is Firm membership, nothing
 * finer — Docket has no per-Matter staff ACL, only the firmId scoping every
 * other story already relies on (AD-1), so AC #2 holds by construction via
 * DocumentRepository.findAllForFirm().
 *
 * Sort is intentionally partial: statusChangedAt ascending (longest-in-status
 * first) is the only ordering signal available today (AD-7). EXPERIENCE.md's
 * full "urgency + aging" sort needs Deadline (Story 3.1, built; the sort
 * itself still isn't reworked to weigh it — unchanged from Story 2.1).
 *
 * Every Document carries an `aging` field (AD-7's shared computeAging,
 * Story 3.2) so a future UI can indicate/distinguish stale cards without
 * this service or the client recomputing Aging independently.
 */
export class WorkflowBoard {
  constructor(private readonly documents: DocumentRepository) {}

  async getBoard(now: Date = new Date()): Promise<Board> {
    const board = Object.fromEntries(STATUS_COLUMNS.map((status) => [status, [] as BoardDocument[]])) as Board;

    const documents = await this.documents.findAllForFirm();
    for (const document of documents) {
      board[document.status].push({ ...document, aging: computeAging(document.statusChangedAt, now) });
    }

    for (const status of STATUS_COLUMNS) {
      board[status].sort((a, b) => a.statusChangedAt.getTime() - b.statusChangedAt.getTime());
    }

    return board;
  }
}
