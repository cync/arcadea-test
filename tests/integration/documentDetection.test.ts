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
    files: {
      get: vi.fn(),
      list: vi.fn(async () => ({ data: { files: [] } })),
      create: vi.fn(),
    },
  })),
}));
vi.mock("googleapis-common", () => ({
  OAuth2Client: class {
    setCredentials() {}
  },
}));

const { DocumentDetection } = await import("../../application/DocumentDetection");
const { PrismaDocumentRepository } = await import("../../adapters/db/documentRepository");
const { listScanTargets } = await import("../../adapters/db/scanTargetsRepository");
const { scanAllConnectedMatters } = await import("../../jobs/scanDocuments");
const { encrypt } = await import("../../adapters/crypto/tokenCipher");

function fakeConnectorFactory(files: { id: string; name: string; modifiedAt: Date }[]) {
  return () => ({
    connect: vi.fn(),
    listNewFiles: vi.fn(async () => files),
    getFileMetadata: vi.fn(),
    resolveLink: vi.fn(),
    uploadFile: vi.fn(),
  });
}

describe("Document auto-detection (PGlite-backed, DriveConnector faked)", () => {
  let firmId: string;
  let attorneyId: string;
  let matterId: string;

  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "Bzyuseu9/yH7/F0sHlxeFru+C9lvwziz66mbKIF/0sA=";
  });

  beforeEach(async () => {
    testClient = await createTestClient();
    const firm = await testClient.firm.create({ data: { name: "Firm A" } });
    firmId = firm.id;
    const attorney = await testClient.$extends(firmScopeExtension(firmId)).user.create({
      data: { firmId, name: "Attorney One", email: "a@x.com", role: "ATTORNEY_OF_RECORD" },
    });
    attorneyId = attorney.id;
    const matter = await testClient.$extends(firmScopeExtension(firmId)).matter.create({
      data: { firmId, name: "Smith v. Jones", client: "Smith", driveFolderId: "folder-1", primaryAttorneyId: attorneyId },
    });
    matterId = matter.id;
  });

  it("creates a Document owned by the Matter's primary attorney", async () => {
    const documents = new PrismaDocumentRepository(firmId);
    const detection = new DocumentDetection(documents, fakeConnectorFactory([{ id: "file-1", name: "Motion.pdf", modifiedAt: new Date() }]));

    const matter = await testClient.$extends(firmScopeExtension(firmId)).matter.findFirst({ where: { id: matterId } });
    const result = await detection.scanMatter(matter!, "fake-token");

    expect(result.created).toHaveLength(1);
    const stored = await testClient.$extends(firmScopeExtension(firmId)).document.findFirst({ where: { driveFileId: "file-1" } });
    expect(stored?.attorneyOfRecordId).toBe(attorneyId);
    expect(stored?.status).toBe("DRAFT");
  });

  it("does not duplicate a Document already recorded on a second scan", async () => {
    const documents = new PrismaDocumentRepository(firmId);
    const detection = new DocumentDetection(documents, fakeConnectorFactory([{ id: "file-1", name: "Motion.pdf", modifiedAt: new Date() }]));
    const matter = await testClient.$extends(firmScopeExtension(firmId)).matter.findFirst({ where: { id: matterId } });

    await detection.scanMatter(matter!, "fake-token");
    const secondScan = await detection.scanMatter(matter!, "fake-token");

    expect(secondScan.created).toHaveLength(0);
    const all = await testClient.$extends(firmScopeExtension(firmId)).document.findMany({ where: { matterId } });
    expect(all).toHaveLength(1);
  });

  describe("listScanTargets + scanAllConnectedMatters (the system-level job orchestration)", () => {
    beforeEach(async () => {
      await testClient.driveConnection.create({
        data: {
          firmId,
          accessTokenEncrypted: encrypt("real-access-token"),
          refreshTokenEncrypted: encrypt("real-refresh-token"),
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
    });

    it("listScanTargets finds the Matter for a Firm with an active connection and a linked folder", async () => {
      const targets = await listScanTargets();
      expect(targets).toHaveLength(1);
      expect(targets[0].firmId).toBe(firmId);
      expect(targets[0].matter.id).toBe(matterId);
    });

    it("excludes a Firm whose connection is revoked", async () => {
      await testClient.driveConnection.updateMany({ where: { firmId }, data: { revokedAt: new Date() } });
      const targets = await listScanTargets();
      expect(targets).toHaveLength(0);
    });

    it("excludes a Matter with no linked Drive folder", async () => {
      await testClient.$extends(firmScopeExtension(firmId)).matter.updateMany({ where: { id: matterId }, data: { driveFolderId: null } });
      const targets = await listScanTargets();
      expect(targets).toHaveLength(0);
    });

    it("scanAllConnectedMatters runs the full job for every target and reports a result per Matter", async () => {
      const results = await scanAllConnectedMatters();
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ firmId, matterId, createdCount: 0 });
    });
  });
});
