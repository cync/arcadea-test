import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { firmScopeExtension } from "../../adapters/db/firmScopeExtension";
import { createTestClient } from "../helpers/testDb";

let testClient: PrismaClient;

vi.mock("../../adapters/db/prisma", () => ({
  firmScopedClient: (firmId: string) => testClient.$extends(firmScopeExtension(firmId)),
}));

// Fake Google SDKs — no real network calls, no real credentials exist in
// this environment (see Story 1.2 Dev Notes).
vi.mock("googleapis-common", () => {
  class FakeOAuth2Client {
    credentials: Record<string, unknown> = {};
    constructor(public opts: unknown) {}
    generateAuthUrl(opts: { state: string }) {
      return `https://fake-consent-url?state=${opts.state}`;
    }
    async getToken(code: string) {
      return {
        tokens: {
          access_token: `fake-access-${code}`,
          refresh_token: `fake-refresh-${code}`,
          expiry_date: Date.now() + 3600_000,
        },
      };
    }
    setCredentials(creds: Record<string, unknown>) {
      this.credentials = creds;
    }
  }
  return { OAuth2Client: FakeOAuth2Client };
});

vi.mock("@googleapis/drive", () => ({
  drive: vi.fn(() => ({
    files: {
      get: vi.fn(async ({ fileId }: { fileId: string }) => {
        if (fileId === "inaccessible-folder") {
          throw new Error("403 Forbidden");
        }
        return {
          data: {
            id: fileId,
            name: "Case Files",
            modifiedTime: new Date().toISOString(),
            mimeType: "application/vnd.google-apps.folder",
            webViewLink: `https://drive.google.com/drive/folders/${fileId}`,
          },
        };
      }),
    },
  })),
}));

const { DriveOnboarding } = await import("../../application/DriveOnboarding");
const { MatterOnboarding } = await import("../../application/MatterOnboarding");
const { GoogleDriveApiAdapter } = await import("../../adapters/drive/googleDriveApiAdapter");
const { PrismaDriveConnectionRepository } = await import("../../adapters/db/driveConnectionRepository");
const { PrismaMatterRepository } = await import("../../adapters/db/matterRepository");

describe("Drive connection persistence and folder linking (PGlite-backed, Google SDKs mocked)", () => {
  let firmId: string;
  let matterId: string;

  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "Bzyuseu9/yH7/F0sHlxeFru+C9lvwziz66mbKIF/0sA=";
  });

  beforeEach(async () => {
    testClient = await createTestClient();
    const firm = await testClient.firm.create({ data: { name: "Firm A" } });
    firmId = firm.id;
    const matter = await testClient.$extends(firmScopeExtension(firmId)).matter.create({
      data: { firmId, name: "Smith v. Jones", client: "Smith" },
    });
    matterId = matter.id;
  });

  it("connectAccount persists an encrypted DriveConnection row", async () => {
    const repo = new PrismaDriveConnectionRepository(firmId);
    const onboarding = new DriveOnboarding(repo, new GoogleDriveApiAdapter());

    await onboarding.connectAccount({ firmId, authCode: "auth-code-1" });

    const stored = await testClient.$extends(firmScopeExtension(firmId)).driveConnection.findFirst({ where: { firmId } });
    expect(stored).not.toBeNull();
    expect(stored?.accessTokenEncrypted).not.toBe("fake-access-auth-code-1");
    expect(stored?.refreshTokenEncrypted).not.toBe("fake-refresh-auth-code-1");
    expect(stored?.revokedAt).toBeNull();
  });

  it("linkDriveFolder sets Matter.driveFolderId when the connection is active and folder is accessible", async () => {
    const connections = new PrismaDriveConnectionRepository(firmId);
    await new DriveOnboarding(connections, new GoogleDriveApiAdapter()).connectAccount({ firmId, authCode: "auth-code-2" });

    const matters = new PrismaMatterRepository(firmId);
    const onboarding = new MatterOnboarding(matters, connections, (token) => new GoogleDriveApiAdapter(token));

    const matter = await onboarding.linkDriveFolder({ matterId, firmId, folder: "folder-xyz" });

    expect(matter.driveFolderId).toBe("folder-xyz");
  });

  it("linkDriveFolder rejects when the account can't access the given folder", async () => {
    const connections = new PrismaDriveConnectionRepository(firmId);
    await new DriveOnboarding(connections, new GoogleDriveApiAdapter()).connectAccount({ firmId, authCode: "auth-code-3" });

    const matters = new PrismaMatterRepository(firmId);
    const onboarding = new MatterOnboarding(matters, connections, (token) => new GoogleDriveApiAdapter(token));

    await expect(
      onboarding.linkDriveFolder({ matterId, firmId, folder: "inaccessible-folder" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("revokeAccount sets revokedAt without deleting the row or clearing an already-linked Matter's driveFolderId", async () => {
    const connections = new PrismaDriveConnectionRepository(firmId);
    const drive = new GoogleDriveApiAdapter();
    await new DriveOnboarding(connections, drive).connectAccount({ firmId, authCode: "auth-code-4" });

    const matters = new PrismaMatterRepository(firmId);
    const onboarding = new MatterOnboarding(matters, connections, (token) => new GoogleDriveApiAdapter(token));
    await onboarding.linkDriveFolder({ matterId, firmId, folder: "folder-abc" });

    await new DriveOnboarding(connections, drive).revokeAccount({ firmId });

    const stored = await testClient.$extends(firmScopeExtension(firmId)).driveConnection.findFirst({ where: { firmId } });
    expect(stored).not.toBeNull();
    expect(stored?.revokedAt).not.toBeNull();

    const matterAfterRevoke = await matters.findById(matterId);
    expect(matterAfterRevoke?.driveFolderId).toBe("folder-abc");
  });

  it("linkDriveFolder rejects once the connection is revoked", async () => {
    const connections = new PrismaDriveConnectionRepository(firmId);
    const drive = new GoogleDriveApiAdapter();
    await new DriveOnboarding(connections, drive).connectAccount({ firmId, authCode: "auth-code-5" });
    await new DriveOnboarding(connections, drive).revokeAccount({ firmId });

    const matters = new PrismaMatterRepository(firmId);
    const onboarding = new MatterOnboarding(matters, connections, (token) => new GoogleDriveApiAdapter(token));

    await expect(
      onboarding.linkDriveFolder({ matterId, firmId, folder: "folder-abc" }),
    ).rejects.toMatchObject({ code: "FAILED_PRECONDITION" });
  });
});
