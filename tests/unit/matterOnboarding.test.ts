import { describe, expect, it, vi } from "vitest";
import {
  MatterOnboarding,
  MatterValidationError,
  parseDriveFolderReference,
  type MatterRepository,
} from "../../application/MatterOnboarding";
import type { Matter } from "../../domain/Matter";
import type { DriveConnectionRepository } from "../../application/DriveOnboarding";
import type { DriveConnector } from "../../ports/DriveConnector";
import type { DriveConnection } from "../../domain/DriveConnection";
import { encrypt } from "../../adapters/crypto/tokenCipher";

// Set eagerly (not in beforeAll) — activeConnection below is a module-level
// const evaluated during test collection, before any beforeAll hook runs.
process.env.TOKEN_ENCRYPTION_KEY = "Bzyuseu9/yH7/F0sHlxeFru+C9lvwziz66mbKIF/0sA=";

function makeMatter(overrides: Partial<Matter> = {}): Matter {
  return {
    id: "matter-1",
    firmId: "firm-1",
    name: "Smith v. Jones",
    client: "Smith",
    driveFolderId: null,
    primaryAttorneyId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(): MatterRepository & { create: ReturnType<typeof vi.fn> } {
  return {
    create: vi.fn(async (input): Promise<Matter> => makeMatter({ firmId: input.firmId, name: input.name, client: input.client })),
    findById: vi.fn(async () => null),
    setDriveFolder: vi.fn(async (matterId: string, driveFolderId: string) => makeMatter({ id: matterId, driveFolderId })),
    setPrimaryAttorney: vi.fn(async (matterId: string, primaryAttorneyId: string) => makeMatter({ id: matterId, primaryAttorneyId })),
  };
}

describe("MatterOnboarding.createMatter", () => {
  it("creates a Matter scoped to the calling Firm", async () => {
    const repo = makeRepo();
    const onboarding = new MatterOnboarding(repo);

    const matter = await onboarding.createMatter({ firmId: "firm-1", name: "Smith v. Jones", client: "Smith" });

    expect(matter.firmId).toBe("firm-1");
    expect(repo.create).toHaveBeenCalledWith({ firmId: "firm-1", name: "Smith v. Jones", client: "Smith" });
  });

  it("trims whitespace from name and client before persisting", async () => {
    const repo = makeRepo();
    const onboarding = new MatterOnboarding(repo);

    await onboarding.createMatter({ firmId: "firm-1", name: "  Smith v. Jones  ", client: "  Smith  " });

    expect(repo.create).toHaveBeenCalledWith({ firmId: "firm-1", name: "Smith v. Jones", client: "Smith" });
  });

  it("rejects an empty name", async () => {
    const onboarding = new MatterOnboarding(makeRepo());
    await expect(onboarding.createMatter({ firmId: "firm-1", name: "   ", client: "Smith" })).rejects.toThrow(
      MatterValidationError,
    );
  });

  it("rejects an empty client", async () => {
    const onboarding = new MatterOnboarding(makeRepo());
    await expect(onboarding.createMatter({ firmId: "firm-1", name: "Smith v. Jones", client: "" })).rejects.toThrow(
      MatterValidationError,
    );
  });

  it("rejects a name over 200 characters", async () => {
    const onboarding = new MatterOnboarding(makeRepo());
    await expect(
      onboarding.createMatter({ firmId: "firm-1", name: "a".repeat(201), client: "Smith" }),
    ).rejects.toThrow(MatterValidationError);
  });

  it("rejects a client over 200 characters", async () => {
    const onboarding = new MatterOnboarding(makeRepo());
    await expect(
      onboarding.createMatter({ firmId: "firm-1", name: "Smith v. Jones", client: "a".repeat(201) }),
    ).rejects.toThrow(MatterValidationError);
  });

  it("rejects a missing firmId", async () => {
    const onboarding = new MatterOnboarding(makeRepo());
    await expect(
      onboarding.createMatter({ firmId: "", name: "Smith v. Jones", client: "Smith" }),
    ).rejects.toThrow(MatterValidationError);
  });

  it("rejects a whitespace-only firmId", async () => {
    const onboarding = new MatterOnboarding(makeRepo());
    await expect(
      onboarding.createMatter({ firmId: "   ", name: "Smith v. Jones", client: "Smith" }),
    ).rejects.toThrow(MatterValidationError);
  });

  it("does not call the repository when validation fails", async () => {
    const repo = makeRepo();
    const onboarding = new MatterOnboarding(repo);

    await expect(onboarding.createMatter({ firmId: "firm-1", name: "", client: "Smith" })).rejects.toThrow();
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("parseDriveFolderReference", () => {
  it("passes through a bare folder ID unchanged", () => {
    expect(parseDriveFolderReference("1AbCdEfGhIjKlMnOp")).toBe("1AbCdEfGhIjKlMnOp");
  });

  it("extracts the ID from a full Drive folder URL", () => {
    expect(parseDriveFolderReference("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp")).toBe(
      "1AbCdEfGhIjKlMnOp",
    );
  });

  it("extracts the ID from a URL with a trailing query string", () => {
    expect(parseDriveFolderReference("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing")).toBe(
      "1AbCdEfGhIjKlMnOp",
    );
  });

  it("strips a trailing slash from a bare ID", () => {
    expect(parseDriveFolderReference("1AbCdEfGhIjKlMnOp/")).toBe("1AbCdEfGhIjKlMnOp");
  });
});

describe("MatterOnboarding.linkDriveFolder", () => {
  const activeConnection: DriveConnection = {
    id: "conn-1",
    firmId: "firm-1",
    accessTokenEncrypted: encrypt("fake-access-token"),
    refreshTokenEncrypted: encrypt("fake-refresh-token"),
    expiresAt: new Date("2026-09-01"),
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function makeConnectionsRepo(connection: DriveConnection | null): DriveConnectionRepository {
    return {
      findByFirmId: vi.fn(async () => connection),
      create: vi.fn(),
      updateTokens: vi.fn(),
      revoke: vi.fn(),
    };
  }

  function makeDriveFactory(shouldSucceed: boolean): (accessToken: string) => DriveConnector {
    return () => ({
      connect: vi.fn(),
      listNewFiles: vi.fn(),
      getFileMetadata: shouldSucceed
        ? vi.fn(async () => ({ id: "folder-1", name: "Case Files", modifiedAt: new Date(), mimeType: "application/vnd.google-apps.folder" }))
        : vi.fn(async () => {
            throw new Error("403 Forbidden");
          }),
      resolveLink: vi.fn(),
      uploadFile: vi.fn(),
    });
  }

  it("links the folder when the connection is active and the folder is accessible", async () => {
    const matters = makeRepo();
    matters.findById = vi.fn(async () => makeMatter());
    const onboarding = new MatterOnboarding(matters, makeConnectionsRepo(activeConnection), makeDriveFactory(true));

    const matter = await onboarding.linkDriveFolder({ matterId: "matter-1", firmId: "firm-1", folder: "folder-1" });

    expect(matter.driveFolderId).toBe("folder-1");
    expect(matters.setDriveFolder).toHaveBeenCalledWith("matter-1", "folder-1");
  });

  it("rejects with NOT_FOUND when the Matter doesn't exist", async () => {
    const matters = makeRepo();
    matters.findById = vi.fn(async () => null);
    const onboarding = new MatterOnboarding(matters, makeConnectionsRepo(activeConnection), makeDriveFactory(true));

    await expect(
      onboarding.linkDriveFolder({ matterId: "missing", firmId: "firm-1", folder: "folder-1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects with FAILED_PRECONDITION when there's no active connection", async () => {
    const matters = makeRepo();
    matters.findById = vi.fn(async () => makeMatter());
    const onboarding = new MatterOnboarding(matters, makeConnectionsRepo(null), makeDriveFactory(true));

    await expect(
      onboarding.linkDriveFolder({ matterId: "matter-1", firmId: "firm-1", folder: "folder-1" }),
    ).rejects.toMatchObject({ code: "FAILED_PRECONDITION" });
  });

  it("rejects with FAILED_PRECONDITION when the connection is revoked", async () => {
    const matters = makeRepo();
    matters.findById = vi.fn(async () => makeMatter());
    const revoked = { ...activeConnection, revokedAt: new Date() };
    const onboarding = new MatterOnboarding(matters, makeConnectionsRepo(revoked), makeDriveFactory(true));

    await expect(
      onboarding.linkDriveFolder({ matterId: "matter-1", firmId: "firm-1", folder: "folder-1" }),
    ).rejects.toMatchObject({ code: "FAILED_PRECONDITION" });
  });

  it("rejects with VALIDATION_ERROR when the connected account can't access the folder", async () => {
    const matters = makeRepo();
    matters.findById = vi.fn(async () => makeMatter());
    const onboarding = new MatterOnboarding(matters, makeConnectionsRepo(activeConnection), makeDriveFactory(false));

    await expect(
      onboarding.linkDriveFolder({ matterId: "matter-1", firmId: "firm-1", folder: "folder-1" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("throws a plain Error when constructed without the Drive dependencies", async () => {
    const matters = makeRepo();
    const onboarding = new MatterOnboarding(matters);
    await expect(
      onboarding.linkDriveFolder({ matterId: "matter-1", firmId: "firm-1", folder: "folder-1" }),
    ).rejects.toThrow(/requires a DriveConnectionRepository/);
  });
});

describe("MatterOnboarding.setPrimaryAttorney", () => {
  function makeUsersRepo(user: { id: string; firmId: string } | null) {
    return {
      findById: vi.fn(async () => (user ? { ...user, name: "Attorney", email: "a@x.com", role: "ATTORNEY_OF_RECORD" as const } : null)),
      findByRole: vi.fn(async () => []),
    };
  }

  it("sets the primary attorney when the User belongs to the Firm", async () => {
    const matters = makeRepo();
    matters.findById = vi.fn(async () => makeMatter());
    const onboarding = new MatterOnboarding(matters, undefined, undefined, makeUsersRepo({ id: "user-1", firmId: "firm-1" }));

    const matter = await onboarding.setPrimaryAttorney({ matterId: "matter-1", firmId: "firm-1", attorneyId: "user-1" });

    expect(matter.primaryAttorneyId).toBe("user-1");
    expect(matters.setPrimaryAttorney).toHaveBeenCalledWith("matter-1", "user-1");
  });

  it("rejects when the Matter doesn't exist", async () => {
    const matters = makeRepo();
    matters.findById = vi.fn(async () => null);
    const onboarding = new MatterOnboarding(matters, undefined, undefined, makeUsersRepo({ id: "user-1", firmId: "firm-1" }));

    await expect(
      onboarding.setPrimaryAttorney({ matterId: "missing", firmId: "firm-1", attorneyId: "user-1" }),
    ).rejects.toThrow(MatterValidationError);
  });

  it("rejects when the attorney doesn't belong to the calling Firm", async () => {
    const matters = makeRepo();
    matters.findById = vi.fn(async () => makeMatter());
    const onboarding = new MatterOnboarding(matters, undefined, undefined, makeUsersRepo({ id: "user-1", firmId: "firm-OTHER" }));

    await expect(
      onboarding.setPrimaryAttorney({ matterId: "matter-1", firmId: "firm-1", attorneyId: "user-1" }),
    ).rejects.toThrow(MatterValidationError);
  });

  it("rejects when the attorney doesn't exist at all", async () => {
    const matters = makeRepo();
    matters.findById = vi.fn(async () => makeMatter());
    const onboarding = new MatterOnboarding(matters, undefined, undefined, makeUsersRepo(null));

    await expect(
      onboarding.setPrimaryAttorney({ matterId: "matter-1", firmId: "firm-1", attorneyId: "missing-user" }),
    ).rejects.toThrow(MatterValidationError);
  });

  it("throws a plain Error when constructed without a UserRepository", async () => {
    const matters = makeRepo();
    const onboarding = new MatterOnboarding(matters);
    await expect(
      onboarding.setPrimaryAttorney({ matterId: "matter-1", firmId: "firm-1", attorneyId: "user-1" }),
    ).rejects.toThrow(/requires a UserRepository/);
  });
});
