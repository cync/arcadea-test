import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { firmScopeExtension } from "../../adapters/db/firmScopeExtension";
import { createTestClient } from "../helpers/testDb";

let testClient: PrismaClient;

vi.mock("../../adapters/db/prisma", () => ({
  firmScopedClient: (firmId: string) => testClient.$extends(firmScopeExtension(firmId)),
}));

const { GET: getBoard } = await import("../../app/api/board/route");

function sessionHeaders(firmId: string, role = "PARALEGAL") {
  return { "x-dev-user-id": "user-1", "x-dev-firm-id": firmId, "x-dev-role": role };
}

describe("GET /api/board (route handler, PGlite-backed)", () => {
  let firmId: string;

  beforeEach(async () => {
    testClient = await createTestClient();
    const firm = await testClient.firm.create({ data: { name: "Firm A" } });
    firmId = firm.id;
    const scoped = testClient.$extends(firmScopeExtension(firmId));
    const attorney = await scoped.user.create({ data: { firmId, name: "Attorney", email: "a@x.com", role: "ATTORNEY_OF_RECORD" } });
    const matter = await scoped.matter.create({ data: { firmId, name: "Smith v. Jones", client: "Smith" } });
    await scoped.document.create({
      data: { firmId, matterId: matter.id, driveFileId: "file-1", name: "Motion.pdf", attorneyOfRecordId: attorney.id, status: "DRAFT" },
    });
    await scoped.document.create({
      data: { firmId, matterId: matter.id, driveFileId: "file-2", name: "Brief.pdf", attorneyOfRecordId: attorney.id, status: "REVIEWED" },
    });
  });

  it("returns Documents grouped into the five status columns for the calling Firm", async () => {
    const res = await getBoard(new Request("http://localhost/api/board", { headers: sessionHeaders(firmId) }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.DRAFT).toHaveLength(1);
    expect(body.DRAFT[0].driveFileId).toBe("file-1");
    expect(body.REVIEWED).toHaveLength(1);
    expect(body.REVIEWED[0].driveFileId).toBe("file-2");
    expect(body.NEEDS_REVISION).toEqual([]);
    expect(body.WAITING_ON_CLIENT_SIGNATURE).toEqual([]);
    expect(body.FILED_SENT).toEqual([]);
  });

  it("never shows a Document belonging to a different Firm (AC #2)", async () => {
    const otherFirm = await testClient.firm.create({ data: { name: "Firm B" } });
    const res = await getBoard(new Request("http://localhost/api/board", { headers: sessionHeaders(otherFirm.id, "PARALEGAL") }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.DRAFT).toEqual([]);
    expect(body.REVIEWED).toEqual([]);
  });

  it("includes aging on every Document, distinguishing stale from fresh", async () => {
    const scoped = testClient.$extends(firmScopeExtension(firmId));
    const attorney = await scoped.user.findFirst({ where: { firmId } });
    const matter = await scoped.matter.findFirst({ where: { firmId } });
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await scoped.document.create({
      data: {
        firmId,
        matterId: matter!.id,
        driveFileId: "file-stale",
        name: "Stale.pdf",
        attorneyOfRecordId: attorney!.id,
        status: "DRAFT",
        statusChangedAt: fiveDaysAgo,
      },
    });

    const res = await getBoard(new Request("http://localhost/api/board", { headers: sessionHeaders(firmId) }));
    const body = await res.json();

    expect(res.status).toBe(200);
    const fresh = body.DRAFT.find((d: { driveFileId: string }) => d.driveFileId === "file-1");
    const stale = body.DRAFT.find((d: { driveFileId: string }) => d.driveFileId === "file-stale");
    expect(fresh.aging.isStale).toBe(false);
    expect(stale.aging.isStale).toBe(true);
    expect(stale.aging.days).toBeGreaterThanOrEqual(5);
  });

  it("returns 401 with no session", async () => {
    const res = await getBoard(new Request("http://localhost/api/board"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a Client role", async () => {
    const res = await getBoard(new Request("http://localhost/api/board", { headers: sessionHeaders(firmId, "CLIENT") }));
    expect(res.status).toBe(403);
  });
});
