import { describe, expect, it, vi } from "vitest";
import { StaleCheck } from "../../application/StaleCheck";
import type { DocumentRepository } from "../../application/DocumentDetection";
import type { UserRepository } from "../../application/MatterOnboarding";
import type { EmailNotifier } from "../../ports/EmailNotifier";
import type { Document } from "../../domain/Document";
import type { User } from "../../domain/User";

const NOW = new Date("2026-08-10T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

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
    statusChangedAt: new Date(NOW.getTime() - 5 * DAY_MS),
    createdAt: new Date("2026-08-01"),
    updatedAt: new Date("2026-08-01"),
    ...overrides,
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return { id: "attorney-1", firmId: "firm-1", name: "Attorney", email: "attorney@x.com", role: "ATTORNEY_OF_RECORD", ...overrides };
}

function makeDocsRepo(documents: Document[]): DocumentRepository & { markStaleAlertSent: ReturnType<typeof vi.fn> } {
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

function makeUsersRepo(byId: Record<string, User | undefined>, officeManagers: User[]): UserRepository {
  return {
    findById: vi.fn(async (id: string) => byId[id] ?? null),
    findByRole: vi.fn(async () => officeManagers),
  };
}

function makeEmailNotifier(): EmailNotifier & { sendStaleAlert: ReturnType<typeof vi.fn> } {
  return { sendStaleAlert: vi.fn(async () => undefined) };
}

describe("StaleCheck.run", () => {
  it("emails the Attorney of Record and every Office Manager for a stale, not-yet-alerted Document", async () => {
    const attorney = makeUser({ id: "attorney-1", email: "attorney@x.com" });
    const officeManager = makeUser({ id: "om-1", email: "om@x.com", role: "OFFICE_MANAGER" });
    const documents = makeDocsRepo([makeDoc()]);
    const users = makeUsersRepo({ "attorney-1": attorney }, [officeManager]);
    const email = makeEmailNotifier();
    const service = new StaleCheck(documents, users, email);

    const result = await service.run(NOW);

    expect(result.alertsSent).toBe(1);
    expect(email.sendStaleAlert).toHaveBeenCalledWith({
      to: expect.arrayContaining(["attorney@x.com", "om@x.com"]),
      documentId: "doc-1",
      documentName: "Motion.pdf",
      agingDays: 5,
    });
    expect(documents.markStaleAlertSent).toHaveBeenCalledWith("doc-1", NOW);
  });

  it("does not alert a Document at or under the 3-day threshold", async () => {
    const attorney = makeUser();
    const documents = makeDocsRepo([makeDoc({ statusChangedAt: new Date(NOW.getTime() - 3 * DAY_MS) })]);
    const users = makeUsersRepo({ "attorney-1": attorney }, []);
    const email = makeEmailNotifier();
    const service = new StaleCheck(documents, users, email);

    const result = await service.run(NOW);

    expect(result.alertsSent).toBe(0);
    expect(email.sendStaleAlert).not.toHaveBeenCalled();
  });

  it("does not re-alert a Document that already has staleAlertSentAt set (AC #2 de-dupe)", async () => {
    const attorney = makeUser();
    const documents = makeDocsRepo([makeDoc({ staleAlertSentAt: new Date(NOW.getTime() - DAY_MS) })]);
    const users = makeUsersRepo({ "attorney-1": attorney }, []);
    const email = makeEmailNotifier();
    const service = new StaleCheck(documents, users, email);

    const result = await service.run(NOW);

    expect(result.alertsSent).toBe(0);
    expect(email.sendStaleAlert).not.toHaveBeenCalled();
    expect(documents.markStaleAlertSent).not.toHaveBeenCalled();
  });

  it("alerts the Attorney of Record alone when the Firm has no Office Manager on record", async () => {
    const attorney = makeUser();
    const documents = makeDocsRepo([makeDoc()]);
    const users = makeUsersRepo({ "attorney-1": attorney }, []);
    const email = makeEmailNotifier();
    const service = new StaleCheck(documents, users, email);

    const result = await service.run(NOW);

    expect(result.alertsSent).toBe(1);
    expect(email.sendStaleAlert).toHaveBeenCalledWith(expect.objectContaining({ to: ["attorney@x.com"] }));
  });

  it("skips a Document entirely if no recipients can be found at all", async () => {
    const documents = makeDocsRepo([makeDoc()]);
    const users = makeUsersRepo({}, []);
    const email = makeEmailNotifier();
    const service = new StaleCheck(documents, users, email);

    const result = await service.run(NOW);

    expect(result.alertsSent).toBe(0);
    expect(email.sendStaleAlert).not.toHaveBeenCalled();
    expect(documents.markStaleAlertSent).not.toHaveBeenCalled();
  });

  it("de-duplicates recipient emails", async () => {
    const attorney = makeUser({ id: "attorney-1", email: "same@x.com" });
    const officeManager = makeUser({ id: "attorney-1", email: "same@x.com", role: "OFFICE_MANAGER" });
    const documents = makeDocsRepo([makeDoc()]);
    const users = makeUsersRepo({ "attorney-1": attorney }, [officeManager]);
    const email = makeEmailNotifier();
    const service = new StaleCheck(documents, users, email);

    await service.run(NOW);

    expect(email.sendStaleAlert).toHaveBeenCalledWith(expect.objectContaining({ to: ["same@x.com"] }));
  });
});
