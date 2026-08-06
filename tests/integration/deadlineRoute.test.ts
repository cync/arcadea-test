import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { firmScopeExtension } from "../../adapters/db/firmScopeExtension";
import { createTestClient } from "../helpers/testDb";

let testClient: PrismaClient;

vi.mock("../../adapters/db/prisma", () => ({
  firmScopedClient: (firmId: string) => testClient.$extends(firmScopeExtension(firmId)),
}));

const { POST: setDeadline } = await import("../../app/api/documents/[id]/deadline/route");

function sessionHeaders(userId: string, firmId: string, role = "ATTORNEY_OF_RECORD") {
  return { "x-dev-user-id": userId, "x-dev-firm-id": firmId, "x-dev-role": role };
}

describe("POST /api/documents/:id/deadline (route handler, PGlite-backed)", () => {
  let firmId: string;
  let documentId: string;
  let attorneyId: string;
  let otherStaffId: string;

  beforeEach(async () => {
    testClient = await createTestClient();
    const firm = await testClient.firm.create({ data: { name: "Firm A" } });
    firmId = firm.id;
    const scoped = testClient.$extends(firmScopeExtension(firmId));
    const attorney = await scoped.user.create({ data: { firmId, name: "Attorney", email: "a@x.com", role: "ATTORNEY_OF_RECORD" } });
    attorneyId = attorney.id;
    const officeManager = await scoped.user.create({ data: { firmId, name: "Office Manager", email: "om@x.com", role: "OFFICE_MANAGER" } });
    otherStaffId = officeManager.id;
    const matter = await scoped.matter.create({ data: { firmId, name: "Smith v. Jones", client: "Smith" } });
    const document = await scoped.document.create({
      data: { firmId, matterId: matter.id, driveFileId: "file-1", name: "Motion.pdf", attorneyOfRecordId: attorney.id },
    });
    documentId = document.id;
  });

  it("lets the Document's Attorney of Record set a Deadline", async () => {
    const res = await setDeadline(
      new Request(`http://localhost/api/documents/${documentId}/deadline`, {
        method: "POST",
        headers: { ...sessionHeaders(attorneyId, firmId), "content-type": "application/json" },
        body: JSON.stringify({ deadline: "2026-09-01T00:00:00.000Z" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(new Date(body.deadline).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("lets the Attorney of Record edit an already-set Deadline", async () => {
    await setDeadline(
      new Request(`http://localhost/api/documents/${documentId}/deadline`, {
        method: "POST",
        headers: { ...sessionHeaders(attorneyId, firmId), "content-type": "application/json" },
        body: JSON.stringify({ deadline: "2026-09-01T00:00:00.000Z" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    const res = await setDeadline(
      new Request(`http://localhost/api/documents/${documentId}/deadline`, {
        method: "POST",
        headers: { ...sessionHeaders(attorneyId, firmId), "content-type": "application/json" },
        body: JSON.stringify({ deadline: "2026-10-15T00:00:00.000Z" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(new Date(body.deadline).toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });

  it("returns 403 for an Office Manager (excluded from Deadline control)", async () => {
    const res = await setDeadline(
      new Request(`http://localhost/api/documents/${documentId}/deadline`, {
        method: "POST",
        headers: { ...sessionHeaders(otherStaffId, firmId, "OFFICE_MANAGER"), "content-type": "application/json" },
        body: JSON.stringify({ deadline: "2026-09-01T00:00:00.000Z" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for a Document outside the caller's Firm", async () => {
    const otherFirm = await testClient.firm.create({ data: { name: "Firm B" } });
    const res = await setDeadline(
      new Request(`http://localhost/api/documents/${documentId}/deadline`, {
        method: "POST",
        headers: { ...sessionHeaders("someone", otherFirm.id), "content-type": "application/json" },
        body: JSON.stringify({ deadline: "2026-09-01T00:00:00.000Z" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for a missing deadline", async () => {
    const res = await setDeadline(
      new Request(`http://localhost/api/documents/${documentId}/deadline`, {
        method: "POST",
        headers: { ...sessionHeaders(attorneyId, firmId), "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unparseable deadline", async () => {
    const res = await setDeadline(
      new Request(`http://localhost/api/documents/${documentId}/deadline`, {
        method: "POST",
        headers: { ...sessionHeaders(attorneyId, firmId), "content-type": "application/json" },
        body: JSON.stringify({ deadline: "not-a-date" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 with no session", async () => {
    const res = await setDeadline(
      new Request(`http://localhost/api/documents/${documentId}/deadline`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deadline: "2026-09-01T00:00:00.000Z" }),
      }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(401);
  });
});
