import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { firmScopeExtension } from "../../adapters/db/firmScopeExtension";
import { createTestClient } from "../helpers/testDb";

let testClient: PrismaClient;

vi.mock("../../adapters/db/prisma", () => ({
  firmScopedClient: (firmId: string) => testClient.$extends(firmScopeExtension(firmId)),
  systemClient: () => testClient,
}));

vi.mock("@googleapis/drive", () => ({
  drive: vi.fn(() => ({
    files: { get: vi.fn(), list: vi.fn(async () => ({ data: { files: [] } })), create: vi.fn() },
  })),
}));
vi.mock("googleapis-common", () => ({
  OAuth2Client: class {
    setCredentials() {}
  },
}));

const { POST: scanDocuments } = await import("../../app/api/jobs/scan-documents/route");
const { encrypt } = await import("../../adapters/crypto/tokenCipher");

describe("POST /api/jobs/scan-documents (route handler, PGlite-backed)", () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "Bzyuseu9/yH7/F0sHlxeFru+C9lvwziz66mbKIF/0sA=";
  });

  beforeEach(async () => {
    testClient = await createTestClient();
  });

  it("returns an empty results array when there's nothing to scan", async () => {
    const res = await scanDocuments();
    expect(res.status).toBe(200);
    expect((await res.json()).results).toEqual([]);
  });

  it("reports one result per connected, folder-linked Matter", async () => {
    const firm = await testClient.firm.create({ data: { name: "Firm A" } });
    const attorney = await testClient.$extends(firmScopeExtension(firm.id)).user.create({
      data: { firmId: firm.id, name: "Attorney", email: "a@x.com", role: "ATTORNEY_OF_RECORD" },
    });
    await testClient.$extends(firmScopeExtension(firm.id)).matter.create({
      data: { firmId: firm.id, name: "Smith v. Jones", client: "Smith", driveFolderId: "folder-1", primaryAttorneyId: attorney.id },
    });
    await testClient.driveConnection.create({
      data: {
        firmId: firm.id,
        accessTokenEncrypted: encrypt("token"),
        refreshTokenEncrypted: encrypt("refresh"),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const res = await scanDocuments();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].firmId).toBe(firm.id);
  });
});
