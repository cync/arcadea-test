import type { Matter } from "../domain/Matter";
import type { User, Role } from "../domain/User";
import type { DriveConnector } from "../ports/DriveConnector";
import type { DriveConnectionRepository } from "./DriveOnboarding";
import { decrypt } from "../adapters/crypto/tokenCipher";

export interface CreateMatterInput {
  firmId: string;
  name: string;
  client: string;
}

/**
 * Dependency the service needs from the persistence layer. Kept minimal and
 * co-located here rather than a standalone ports/ file — this is an
 * application-internal dependency, not one of ARCHITECTURE-SPINE.md's named
 * external ports (DriveConnector, EmailNotifier, AuthProvider).
 */
export interface MatterRepository {
  create(input: CreateMatterInput): Promise<Matter>;
  findById(id: string): Promise<Matter | null>;
  setDriveFolder(matterId: string, driveFolderId: string): Promise<Matter>;
  setPrimaryAttorney(matterId: string, attorneyId: string): Promise<Matter>;
}

/** Minimal — only what setPrimaryAttorney needs to validate against, plus
 * findByRole (Story 3.3's StaleCheck needs to enumerate Office Managers). */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByRole(role: Role): Promise<User[]>;
}

const MAX_FIELD_LENGTH = 200;

export class MatterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatterValidationError";
  }
}

/**
 * Drive-folder references accepted from the API: a bare Drive file/folder ID,
 * or a full share URL (`https://drive.google.com/drive/folders/<id>`),
 * tolerating a trailing query string or slash.
 */
export function parseDriveFolderReference(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/);
  return urlMatch ? urlMatch[1] : trimmed.replace(/\/+$/, "");
}

/**
 * Story 1.1 implements createMatter only. Story 1.2 (Drive-folder connection)
 * extends this service as a second step of the same onboarding flow — the UX
 * spec presents both as one combined moment, even though they're two
 * sequenced calls. Do not treat this as a dead end.
 */
export class DriveFolderLinkError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "VALIDATION_ERROR" | "FAILED_PRECONDITION",
  ) {
    super(message);
    this.name = "DriveFolderLinkError";
  }
}

export class MatterOnboarding {
  constructor(
    private readonly matters: MatterRepository,
    // Optional: only linkDriveFolder needs these. A factory, not a concrete
    // adapter import — MatterOnboarding depends on the DriveConnector port
    // type only, never on GoogleDriveApiAdapter directly (AD-2).
    private readonly connections?: DriveConnectionRepository,
    private readonly driveConnectorFactory?: (accessToken: string) => DriveConnector,
    private readonly users?: UserRepository,
  ) {}

  async createMatter(input: CreateMatterInput): Promise<Matter> {
    const firmId = input.firmId.trim();
    if (!firmId) {
      throw new MatterValidationError("firmId is required");
    }

    const name = input.name.trim();
    if (!name) {
      throw new MatterValidationError("Matter name is required");
    }
    if (name.length > MAX_FIELD_LENGTH) {
      throw new MatterValidationError(`Matter name must be ${MAX_FIELD_LENGTH} characters or fewer`);
    }

    const client = input.client.trim();
    if (!client) {
      throw new MatterValidationError("Client is required");
    }
    if (client.length > MAX_FIELD_LENGTH) {
      throw new MatterValidationError(`Client must be ${MAX_FIELD_LENGTH} characters or fewer`);
    }

    return this.matters.create({ firmId, name, client });
  }

  /**
   * Driving adapters (API routes) must go through this, not the repository
   * directly (ARCHITECTURE-SPINE.md Design Paradigm) — even for a plain
   * lookup, so the application layer stays the single entry point.
   */
  async getMatter(id: string): Promise<Matter | null> {
    return this.matters.findById(id);
  }

  /**
   * Requires an active (non-revoked) DriveConnection for the Firm, verifies
   * the connected account can actually read the folder, then links it.
   */
  async linkDriveFolder(input: { matterId: string; firmId: string; folder: string }): Promise<Matter> {
    if (!this.connections || !this.driveConnectorFactory) {
      throw new Error("MatterOnboarding.linkDriveFolder requires a DriveConnectionRepository and driveConnectorFactory");
    }

    const folderId = parseDriveFolderReference(input.folder);
    if (!folderId) {
      throw new DriveFolderLinkError("A Drive folder ID or URL is required", "VALIDATION_ERROR");
    }

    const matter = await this.matters.findById(input.matterId);
    if (!matter) {
      throw new DriveFolderLinkError("Matter not found", "NOT_FOUND");
    }

    const connection = await this.connections.findByFirmId(input.firmId);
    if (!connection || connection.revokedAt) {
      throw new DriveFolderLinkError("Firm has no active Drive connection", "FAILED_PRECONDITION");
    }

    const drive = this.driveConnectorFactory(decrypt(connection.accessTokenEncrypted));
    try {
      await drive.getFileMetadata(folderId);
    } catch {
      throw new DriveFolderLinkError("The connected Drive account cannot access this folder", "VALIDATION_ERROR");
    }

    return this.matters.setDriveFolder(input.matterId, folderId);
  }

  /**
   * Sets the Matter's lead attorney — a retroactive gap Story 1.1 left open
   * (see 1-1-create-a-matter.md), added here because Story 1.3's
   * auto-detection needs a real Attorney of Record to assign.
   */
  async setPrimaryAttorney(input: { matterId: string; firmId: string; attorneyId: string }): Promise<Matter> {
    if (!this.users) {
      throw new Error("MatterOnboarding.setPrimaryAttorney requires a UserRepository");
    }

    const matter = await this.matters.findById(input.matterId);
    if (!matter) {
      throw new MatterValidationError("Matter not found");
    }

    const attorney = await this.users.findById(input.attorneyId);
    if (!attorney || attorney.firmId !== input.firmId) {
      throw new MatterValidationError("attorneyId must reference a User in the calling Firm");
    }

    return this.matters.setPrimaryAttorney(input.matterId, input.attorneyId);
  }
}
