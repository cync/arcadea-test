import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { firmScopeExtension } from "../../adapters/db/firmScopeExtension";
import { createTestClient } from "../helpers/testDb";

let testClient: PrismaClient;

vi.mock("../../adapters/db/prisma", () => ({
  firmScopedClient: (firmId: string) => testClient.$extends(firmScopeExtension(firmId)),
}));

const { POST: changeStatus } = await import("../../app/api/documents/[id]/status/route");

function sessionHeaders(userId: string, firmId: string, role = "PARALEGAL") {
  return { "x-dev-user-id": userId, "x-dev-firm-id": firmId, "x-dev-role": role };
}

describe("POST /api/documents/:id/status (route handler, PGlite-backed)", () => {
  let firmId: string;
  let documentId: string;
  let originalStatusChangedAt: Date;
  let userAId: string;
  let userBId: string;

  beforeEach(async () => {
    testClient = await createTestClient();
    const firm = await testClient.firm.create({ data: { name: "Firm A" } });
    firmId = firm.id;
    const scoped = testClient.$extends(firmScopeExtension(firmId));
    const attorney = await scoped.user.create({ data: { firmId, name: "Attorney", email: "a@x.com", role: "ATTORNEY_OF_RECORD" } });
    userAId = attorney.id;
    const paralegal = await scoped.user.create({ data: { firmId, name: "Paralegal Two", email: "p2@x.com", role: "PARALEGAL" } });
    userBId = paralegal.id;
    const matter = await scoped.matter.create({ data: { firmId, name: "Smith v. Jones", client: "Smith" } });
    const document = await scoped.document.create({
      data: {
        firmId,
        matterId: matter.id,
        driveFileId: "file-1",
        name: "Motion.pdf",
        attorneyOfRecordId: attorney.id,
        status: "DRAFT",
        statusChangedAt: new Date("2020-01-01"),
      },
    });
    documentId = document.id;
    originalStatusChangedAt = document.statusChangedAt;
  });

  it("moves a Document to a new Status and bumps statusChangedAt", async () => {
    const res = await changeStatus(
      new Request(`http://localhost/api/documents/${documentId}/status`, {
        method: "POST",
        headers: { ...sessionHeaders(userAId, firmId), "content-type": "application/json" },
        body: JSON.stringify({ status: "NEEDS_REVISION" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("NEEDS_REVISION");
    expect(new Date(body.statusChangedAt).getTime()).toBeGreaterThan(originalStatusChangedAt.getTime());
  });

  it("allows an arbitrary Status-to-Status move", async () => {
    const res = await changeStatus(
      new Request(`http://localhost/api/documents/${documentId}/status`, {
        method: "POST",
        headers: { ...sessionHeaders(userAId, firmId, "OFFICE_MANAGER"), "content-type": "application/json" },
        body: JSON.stringify({ status: "FILED_SENT" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("FILED_SENT");
  });

  it("moves a Document to Reviewed when reviewerId confirms the caller themselves, and persists an AuditEntry", async () => {
    const res = await changeStatus(
      new Request(`http://localhost/api/documents/${documentId}/status`, {
        method: "POST",
        headers: { ...sessionHeaders(userAId, firmId), "content-type": "application/json" },
        body: JSON.stringify({ status: "REVIEWED", reviewerId: userAId }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("REVIEWED");
    expect(body.reviewedByUserId).toBe(userAId);

    const auditRow = await testClient.auditEntry.findFirst({ where: { documentId } });
    expect(auditRow).toMatchObject({ documentId, actorId: userAId, action: "REVIEWED" });
  });

  it("keeps showing the latest reviewer after the Document moves on and is reviewed again by someone else", async () => {
    await changeStatus(
      new Request(`http://localhost/api/documents/${documentId}/status`, {
        method: "POST",
        headers: { ...sessionHeaders(userAId, firmId), "content-type": "application/json" },
        body: JSON.stringify({ status: "REVIEWED", reviewerId: userAId }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    await changeStatus(
      new Request(`http://localhost/api/documents/${documentId}/status`, {
        method: "POST",
        headers: { ...sessionHeaders(userAId, firmId), "content-type": "application/json" },
        body: JSON.stringify({ status: "NEEDS_REVISION" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    const afterDemotion = await testClient.document.findFirst({ where: { id: documentId } });
    expect(afterDemotion?.reviewedByUserId).toBe(userAId);

    const res = await changeStatus(
      new Request(`http://localhost/api/documents/${documentId}/status`, {
        method: "POST",
        headers: { ...sessionHeaders(userBId, firmId), "content-type": "application/json" },
        body: JSON.stringify({ status: "REVIEWED", reviewerId: userBId }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reviewedByUserId).toBe(userBId);
  });

  it("returns 400 for a move to Reviewed with a reviewerId that doesn't match the caller", async () => {
    const res = await changeStatus(
      new Request(`http://localhost/api/documents/${documentId}/status`, {
        method: "POST",
        headers: { ...sessionHeaders(userAId, firmId), "content-type": "application/json" },
        body: JSON.stringify({ status: "REVIEWED", reviewerId: userBId }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for a move to Reviewed with no reviewerId", async () => {
    const res = await changeStatus(
      new Request(`http://localhost/api/documents/${documentId}/status`, {
        method: "POST",
        headers: { ...sessionHeaders(userAId, firmId), "content-type": "application/json" },
        body: JSON.stringify({ status: "REVIEWED" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for a Document outside the caller's Firm", async () => {
    const otherFirm = await testClient.firm.create({ data: { name: "Firm B" } });
    const res = await changeStatus(
      new Request(`http://localhost/api/documents/${documentId}/status`, {
        method: "POST",
        headers: { ...sessionHeaders(userAId, otherFirm.id), "content-type": "application/json" },
        body: JSON.stringify({ status: "NEEDS_REVISION" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid status value", async () => {
    const res = await changeStatus(
      new Request(`http://localhost/api/documents/${documentId}/status`, {
        method: "POST",
        headers: { ...sessionHeaders(userAId, firmId), "content-type": "application/json" },
        body: JSON.stringify({ status: "BOGUS" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for a Client role", async () => {
    const res = await changeStatus(
      new Request(`http://localhost/api/documents/${documentId}/status`, {
        method: "POST",
        headers: { ...sessionHeaders(userAId, firmId, "CLIENT"), "content-type": "application/json" },
        body: JSON.stringify({ status: "NEEDS_REVISION" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 with no session", async () => {
    const res = await changeStatus(
      new Request(`http://localhost/api/documents/${documentId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "NEEDS_REVISION" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(401);
  });
});
