import { beforeAll, describe, expect, it, vi } from "vitest";
import { DriveOnboarding, DriveConnectionValidationError, type DriveConnectionRepository } from "../../application/DriveOnboarding";
import type { DriveConnector, DriveTokens } from "../../ports/DriveConnector";
import type { DriveConnection } from "../../domain/DriveConnection";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "Bzyuseu9/yH7/F0sHlxeFru+C9lvwziz66mbKIF/0sA=";
});

function makeConnector(tokens: DriveTokens): DriveConnector {
  return {
    connect: vi.fn(async () => tokens),
    listNewFiles: vi.fn(),
    getFileMetadata: vi.fn(),
    resolveLink: vi.fn(),
    uploadFile: vi.fn(),
  };
}

function makeRepo(existing: DriveConnection | null = null): DriveConnectionRepository & {
  create: ReturnType<typeof vi.fn>;
  updateTokens: ReturnType<typeof vi.fn>;
  revoke: ReturnType<typeof vi.fn>;
} {
  return {
    findByFirmId: vi.fn(async () => existing),
    create: vi.fn(async (input) => ({ id: "conn-1", revokedAt: null, createdAt: new Date(), updatedAt: new Date(), ...input })),
    updateTokens: vi.fn(async () => undefined),
    revoke: vi.fn(async () => undefined),
  };
}

const tokens: DriveTokens = { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: new Date("2026-09-01") };

describe("DriveOnboarding.connectAccount", () => {
  it("creates a new DriveConnection with encrypted tokens when none exists", async () => {
    const repo = makeRepo(null);
    const onboarding = new DriveOnboarding(repo, makeConnector(tokens));

    await onboarding.connectAccount({ firmId: "firm-1", authCode: "auth-code" });

    expect(repo.create).toHaveBeenCalledTimes(1);
    const call = repo.create.mock.calls[0][0];
    expect(call.firmId).toBe("firm-1");
    expect(call.accessTokenEncrypted).not.toBe("access-1");
    expect(call.refreshTokenEncrypted).not.toBe("refresh-1");
    expect(repo.updateTokens).not.toHaveBeenCalled();
  });

  it("updates tokens instead of creating a second row when a connection already exists", async () => {
    const existing: DriveConnection = {
      id: "conn-1",
      firmId: "firm-1",
      accessTokenEncrypted: "old",
      refreshTokenEncrypted: "old",
      expiresAt: new Date("2026-01-01"),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const repo = makeRepo(existing);
    const onboarding = new DriveOnboarding(repo, makeConnector(tokens));

    await onboarding.connectAccount({ firmId: "firm-1", authCode: "auth-code" });

    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.updateTokens).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing firmId", async () => {
    const onboarding = new DriveOnboarding(makeRepo(), makeConnector(tokens));
    await expect(onboarding.connectAccount({ firmId: "  ", authCode: "auth-code" })).rejects.toThrow(
      DriveConnectionValidationError,
    );
  });

  it("rejects a missing authCode", async () => {
    const onboarding = new DriveOnboarding(makeRepo(), makeConnector(tokens));
    await expect(onboarding.connectAccount({ firmId: "firm-1", authCode: "" })).rejects.toThrow(
      DriveConnectionValidationError,
    );
  });
});

describe("DriveOnboarding.revokeAccount", () => {
  it("calls repository.revoke, never deleting the row", async () => {
    const repo = makeRepo();
    const onboarding = new DriveOnboarding(repo, makeConnector(tokens));

    await onboarding.revokeAccount({ firmId: "firm-1" });

    expect(repo.revoke).toHaveBeenCalledWith("firm-1");
  });

  it("rejects a missing firmId", async () => {
    const onboarding = new DriveOnboarding(makeRepo(), makeConnector(tokens));
    await expect(onboarding.revokeAccount({ firmId: "" })).rejects.toThrow(DriveConnectionValidationError);
  });
});
