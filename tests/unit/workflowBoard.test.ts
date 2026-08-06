import { describe, expect, it, vi } from "vitest";
import { WorkflowBoard } from "../../application/WorkflowBoard";
import type { DocumentRepository } from "../../application/DocumentDetection";
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

function makeRepo(documents: Document[]): DocumentRepository {
  return {
    findById: vi.fn(),
    findByDriveFileId: vi.fn(),
    create: vi.fn(),
    findLatestForMatter: vi.fn(),
    setAttorneyOfRecord: vi.fn(),
    findAllForFirm: vi.fn(async () => documents),
    updateStatus: vi.fn(),
    setDeadline: vi.fn(),
    markStaleAlertSent: vi.fn(),
  };
}

describe("WorkflowBoard.getBoard", () => {
  it("groups Documents into all five status columns, including empty ones", async () => {
    const board = await new WorkflowBoard(makeRepo([makeDoc({ id: "doc-1", status: "DRAFT" })])).getBoard();

    expect(Object.keys(board)).toEqual(["DRAFT", "REVIEWED", "NEEDS_REVISION", "WAITING_ON_CLIENT_SIGNATURE", "FILED_SENT"]);
    expect(board.DRAFT).toHaveLength(1);
    expect(board.REVIEWED).toEqual([]);
    expect(board.NEEDS_REVISION).toEqual([]);
    expect(board.WAITING_ON_CLIENT_SIGNATURE).toEqual([]);
    expect(board.FILED_SENT).toEqual([]);
  });

  it("places each Document in the column matching its status", async () => {
    const docs = [
      makeDoc({ id: "doc-1", status: "DRAFT" }),
      makeDoc({ id: "doc-2", status: "REVIEWED" }),
      makeDoc({ id: "doc-3", status: "FILED_SENT" }),
    ];
    const board = await new WorkflowBoard(makeRepo(docs)).getBoard();

    expect(board.DRAFT.map((d) => d.id)).toEqual(["doc-1"]);
    expect(board.REVIEWED.map((d) => d.id)).toEqual(["doc-2"]);
    expect(board.FILED_SENT.map((d) => d.id)).toEqual(["doc-3"]);
  });

  it("sorts within a column by statusChangedAt ascending — longest-in-status first", async () => {
    const docs = [
      makeDoc({ id: "doc-newest", status: "DRAFT", statusChangedAt: new Date("2026-08-03") }),
      makeDoc({ id: "doc-oldest", status: "DRAFT", statusChangedAt: new Date("2026-08-01") }),
      makeDoc({ id: "doc-middle", status: "DRAFT", statusChangedAt: new Date("2026-08-02") }),
    ];
    const board = await new WorkflowBoard(makeRepo(docs)).getBoard();

    expect(board.DRAFT.map((d) => d.id)).toEqual(["doc-oldest", "doc-middle", "doc-newest"]);
  });

  it("attaches Aging computed against the injected `now` to every Document", async () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const docs = [
      makeDoc({ id: "doc-fresh", status: "DRAFT", statusChangedAt: new Date("2026-08-09T00:00:00.000Z") }),
      makeDoc({ id: "doc-stale", status: "DRAFT", statusChangedAt: new Date("2026-08-01T00:00:00.000Z") }),
    ];
    const board = await new WorkflowBoard(makeRepo(docs)).getBoard(now);

    const fresh = board.DRAFT.find((d) => d.id === "doc-fresh");
    const stale = board.DRAFT.find((d) => d.id === "doc-stale");
    expect(fresh?.aging).toEqual({ days: 1, isStale: false });
    expect(stale?.aging).toEqual({ days: 9, isStale: true });
  });
});
