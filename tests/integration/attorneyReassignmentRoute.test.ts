import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { firmScopeExtension } from "../../adapters/db/firmScopeExtension";
import { createTestClient } from "../helpers/testDb";

let testClient: PrismaClient;

vi.mock("../../adapters/db/prisma", () => ({
  firmScopedClient: (firmId: string) => testClient.$extends(firmScopeExtension(firmId)),
}));

const { POST: reassignAttorney } = await import("../../app/api/documents/[id]/attorney/route");

function sessionHeaders(userId: string, firmId: string, role = "PARALEGAL") {
  return { "x-dev-user-id": userId, "x-dev-firm-id": firmId, "x-dev-role": role };
}

describe("POST /api/documents/:id/attorney (route handler, PGlite-backed)", () => {
  let firmId: string;
  let matterId: string;
  let documentId: string;
  let currentAttorneyId: string;
  let newAttorneyId: string;
  let officeManagerId: string;

  beforeEach(async () => {
    testClient = await createTestClient();
    const firm = await testClient.firm.create({ data: { name: "Firm A" } });
    firmId = firm.id;
    const scoped = testClient.$extends(firmScopeExtension(firmId));

    const currentAttorney = await scoped.user.create({
      data: { firmId, name: "Current Attorney", email: "current@x.com", role: "ATTORNEY_OF_RECORD" },
    });
    currentAttorneyId = currentAttorney.id;
    const newAttorney = await scoped.user.create({
      data: { firmId, name: "New Attorney", email: "new@x.com", role: "ATTORNEY_OF_RECORD" },
    });
    newAttorneyId = newAttorney.id;
    const officeManager = await scoped.user.create({
      data: { firmId, name: "Office Manager", email: "om@x.com", role: "OFFICE_MANAGER" },
    });
    officeManagerId = officeManager.id;

    const matter = await scoped.matter.create({ data: { firmId, name: "Smith v. Jones", client: "Smith" } });
    matterId = matter.id;

    const document = await scoped.document.create({
      data: { firmId, matterId, driveFileId: "file-1", name: "Motion.pdf", attorneyOfRecordId: currentAttorneyId },
    });
    documentId = document.id;
  });

  it("allows the current Attorney of Record to reassign, and persists an AuditEntry", async () => {
    const res = await reassignAttorney(
      new Request(`http://localhost/api/documents/${documentId}/attorney`, {
        method: "POST",
        headers: { ...sessionHeaders(currentAttorneyId, firmId, "ATTORNEY_OF_RECORD"), "content-type": "application/json" },
        body: JSON.stringify({ attorneyId: newAttorneyId, reason: "Handing off" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.attorneyOfRecordId).toBe(newAttorneyId);

    const auditRow = await testClient.auditEntry.findFirst({ where: { documentId } });
    expect(auditRow).toMatchObject({
      documentId,
      matterId,
      actorId: currentAttorneyId,
      action: "ATTORNEY_REASSIGNED",
      reason: "Handing off",
    });
  });

  it("allows an Office Manager to reassign a Document they don't own", async () => {
    const res = await reassignAttorney(
      new Request(`http://localhost/api/documents/${documentId}/attorney`, {
        method: "POST",
        headers: { ...sessionHeaders(officeManagerId, firmId, "OFFICE_MANAGER"), "content-type": "application/json" },
        body: JSON.stringify({ attorneyId: newAttorneyId }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.attorneyOfRecordId).toBe(newAttorneyId);
  });

  it("returns 403 for staff who is neither the current Attorney of Record nor an Office Manager", async () => {
    const res = await reassignAttorney(
      new Request(`http://localhost/api/documents/${documentId}/attorney`, {
        method: "POST",
        headers: { ...sessionHeaders("paralegal-1", firmId, "PARALEGAL"), "content-type": "application/json" },
        body: JSON.stringify({ attorneyId: newAttorneyId }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for a Document outside the caller's Firm", async () => {
    const otherFirm = await testClient.firm.create({ data: { name: "Firm B" } });
    const res = await reassignAttorney(
      new Request(`http://localhost/api/documents/${documentId}/attorney`, {
        method: "POST",
        headers: { ...sessionHeaders("someone", otherFirm.id, "OFFICE_MANAGER"), "content-type": "application/json" },
        body: JSON.stringify({ attorneyId: newAttorneyId }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when attorneyId is missing", async () => {
    const res = await reassignAttorney(
      new Request(`http://localhost/api/documents/${documentId}/attorney`, {
        method: "POST",
        headers: { ...sessionHeaders(currentAttorneyId, firmId, "ATTORNEY_OF_RECORD"), "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 with no session", async () => {
    const res = await reassignAttorney(
      new Request(`http://localhost/api/documents/${documentId}/attorney`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attorneyId: newAttorneyId }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(401);
  });
});
