import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { firmScopeExtension } from "../../adapters/db/firmScopeExtension";
import { createTestClient } from "../helpers/testDb";

let testClient: PrismaClient;

vi.mock("../../adapters/db/prisma", () => ({
  firmScopedClient: (firmId: string) => testClient.$extends(firmScopeExtension(firmId)),
  systemClient: () => testClient,
}));

vi.mock("googleapis-common", () => ({
  OAuth2Client: class {
    setCredentials() {}
  },
}));

vi.mock("@googleapis/drive", () => ({
  drive: vi.fn(() => ({
    files: {
      get: vi.fn(async ({ fileId, fields }: { fileId: string; fields: string }) => {
        if (fileId === "missing-file") {
          throw new Error("404 Not Found");
        }
        if (fields?.includes("webViewLink")) {
          return { data: { webViewLink: `https://drive.google.com/file/d/${fileId}/view` } };
        }
        return { data: { id: fileId, name: "Motion.pdf", modifiedTime: "2026-08-01T00:00:00.000Z", mimeType: "application/pdf" } };
      }),
    },
  })),
}));

const { GET: getDocument } = await import("../../app/api/documents/[id]/route");
const { encrypt } = await import("../../adapters/crypto/tokenCipher");

function sessionHeaders(firmId: string, role = "PARALEGAL") {
  return { "x-dev-user-id": "user-1", "x-dev-firm-id": firmId, "x-dev-role": role };
}

describe("GET /api/documents/:id (route handler, PGlite-backed, Drive SDKs mocked)", () => {
  let firmId: string;
  let documentId: string;

  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "Bzyuseu9/yH7/F0sHlxeFru+C9lvwziz66mbKIF/0sA=";
  });

  beforeEach(async () => {
    testClient = await createTestClient();
    const firm = await testClient.firm.create({ data: { name: "Firm A" } });
    firmId = firm.id;
    const scoped = testClient.$extends(firmScopeExtension(firmId));
    const attorney = await scoped.user.create({ data: { firmId, name: "Attorney", email: "a@x.com", role: "ATTORNEY_OF_RECORD" } });
    const matter = await scoped.matter.create({ data: { firmId, name: "Smith v. Jones", client: "Smith" } });
    const document = await scoped.document.create({
      data: { firmId, matterId: matter.id, driveFileId: "file-1", name: "Motion.pdf", attorneyOfRecordId: attorney.id },
    });
    documentId = document.id;
  });

  it("returns the Document with Drive metadata when the connection is active", async () => {
    await testClient.driveConnection.create({
      data: { firmId, accessTokenEncrypted: encrypt("token"), refreshTokenEncrypted: encrypt("refresh"), expiresAt: new Date(Date.now() + 3600_000) },
    });

    const res = await getDocument(new Request(`http://localhost/api/documents/${documentId}`, { headers: sessionHeaders(firmId) }), {
      params: Promise.resolve({ id: documentId }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.document.id).toBe(documentId);
    expect(body.drive.available).toBe(true);
    expect(body.drive.link).toBe("https://drive.google.com/file/d/file-1/view");
  });

  it("returns 200 with drive.available: false when there's no Drive connection (not an error)", async () => {
    const res = await getDocument(new Request(`http://localhost/api/documents/${documentId}`, { headers: sessionHeaders(firmId) }), {
      params: Promise.resolve({ id: documentId }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.drive.available).toBe(false);
  });

  it("returns 404 for a Document outside the caller's Firm", async () => {
    const otherFirm = await testClient.firm.create({ data: { name: "Firm B" } });
    const res = await getDocument(new Request(`http://localhost/api/documents/${documentId}`, { headers: sessionHeaders(otherFirm.id) }), {
      params: Promise.resolve({ id: documentId }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 401 with no session", async () => {
    const res = await getDocument(new Request(`http://localhost/api/documents/${documentId}`), {
      params: Promise.resolve({ id: documentId }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a Client role", async () => {
    const res = await getDocument(
      new Request(`http://localhost/api/documents/${documentId}`, { headers: sessionHeaders(firmId, "CLIENT") }),
      { params: Promise.resolve({ id: documentId }) },
    );
    expect(res.status).toBe(403);
  });
});
