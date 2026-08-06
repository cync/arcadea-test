import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { firmScopeExtension } from "../../adapters/db/firmScopeExtension";
import { createTestClient } from "../helpers/testDb";

let testClient: PrismaClient;

vi.mock("../../adapters/db/prisma", () => ({
  firmScopedClient: (firmId: string) => testClient.$extends(firmScopeExtension(firmId)),
}));

const { POST: delegatedApprove } = await import("../../app/api/documents/[id]/delegated-approval/route");

function sessionHeaders(userId: string, firmId: string, role = "OFFICE_MANAGER") {
  return { "x-dev-user-id": userId, "x-dev-firm-id": firmId, "x-dev-role": role };
}

describe("POST /api/documents/:id/delegated-approval (route handler, PGlite-backed)", () => {
  let firmId: string;
  let documentId: string;
  let attorneyId: string;
  let officeManagerId: string;

  beforeEach(async () => {
    testClient = await createTestClient();
    const firm = await testClient.firm.create({ data: { name: "Firm A" } });
    firmId = firm.id;
    const scoped = testClient.$extends(firmScopeExtension(firmId));
    const attorney = await scoped.user.create({ data: { firmId, name: "Attorney", email: "a@x.com", role: "ATTORNEY_OF_RECORD" } });
    attorneyId = attorney.id;
    const officeManager = await scoped.user.create({ data: { firmId, name: "Office Manager", email: "om@x.com", role: "OFFICE_MANAGER" } });
    officeManagerId = officeManager.id;
    const matter = await scoped.matter.create({ data: { firmId, name: "Smith v. Jones", client: "Smith" } });
    const document = await scoped.document.create({
      data: {
        firmId,
        matterId: matter.id,
        driveFileId: "file-1",
        name: "Motion.pdf",
        attorneyOfRecordId: attorney.id,
        status: "WAITING_ON_CLIENT_SIGNATURE",
      },
    });
    documentId = document.id;
  });

  it("moves the Document to Filed/Sent for an Office Manager, regardless of whose Document it is", async () => {
    const res = await delegatedApprove(
      new Request(`http://localhost/api/documents/${documentId}/delegated-approval`, {
        method: "POST",
        headers: { ...sessionHeaders(officeManagerId, firmId), "content-type": "application/json" },
        body: JSON.stringify({ reason: "Attorney unreachable" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("FILED_SENT");

    const auditRow = await testClient.auditEntry.findFirst({ where: { documentId } });
    expect(auditRow).toMatchObject({ action: "DELEGATED_APPROVAL", actorId: officeManagerId, reason: "Attorney unreachable" });
  });

  it("works with no request body at all", async () => {
    const res = await delegatedApprove(
      new Request(`http://localhost/api/documents/${documentId}/delegated-approval`, {
        method: "POST",
        headers: sessionHeaders(officeManagerId, firmId),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 403 for the Document's own Attorney of Record — Office-Manager-only", async () => {
    const res = await delegatedApprove(
      new Request(`http://localhost/api/documents/${documentId}/delegated-approval`, {
        method: "POST",
        headers: { ...sessionHeaders(attorneyId, firmId, "ATTORNEY_OF_RECORD"), "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for a Paralegal", async () => {
    const res = await delegatedApprove(
      new Request(`http://localhost/api/documents/${documentId}/delegated-approval`, {
        method: "POST",
        headers: sessionHeaders("paralegal-1", firmId, "PARALEGAL"),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for a Document outside the caller's Firm", async () => {
    const otherFirm = await testClient.firm.create({ data: { name: "Firm B" } });
    const res = await delegatedApprove(
      new Request(`http://localhost/api/documents/${documentId}/delegated-approval`, {
        method: "POST",
        headers: sessionHeaders("someone", otherFirm.id),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 with no session", async () => {
    const res = await delegatedApprove(new Request(`http://localhost/api/documents/${documentId}/delegated-approval`, { method: "POST" }), {
      params: Promise.resolve({ id: documentId }),
    });
    expect(res.status).toBe(401);
  });
});
