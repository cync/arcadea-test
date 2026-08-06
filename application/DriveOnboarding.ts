import type { DriveConnection } from "../domain/DriveConnection";
import type { DriveConnector } from "../ports/DriveConnector";
import { encrypt } from "../adapters/crypto/tokenCipher";

export interface DriveConnectionRepository {
  findByFirmId(firmId: string): Promise<DriveConnection | null>;
  create(input: {
    firmId: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    expiresAt: Date;
  }): Promise<DriveConnection>;
  updateTokens(
    firmId: string,
    data: { accessTokenEncrypted: string; refreshTokenEncrypted: string; expiresAt: Date },
  ): Promise<void>;
  revoke(firmId: string): Promise<void>;
}

export class DriveConnectionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveConnectionValidationError";
  }
}

/**
 * Firm-level Drive account connection. Distinct from MatterOnboarding
 * (Matter-level) — connecting an account happens once per Firm; linking a
 * folder happens per Matter and requires an active connection here first.
 */
export class DriveOnboarding {
  constructor(
    private readonly connections: DriveConnectionRepository,
    private readonly drive: DriveConnector,
  ) {}

  async connectAccount(input: { firmId: string; authCode: string }): Promise<void> {
    const firmId = input.firmId.trim();
    if (!firmId) {
      throw new DriveConnectionValidationError("firmId is required");
    }
    const authCode = input.authCode.trim();
    if (!authCode) {
      throw new DriveConnectionValidationError("authCode is required");
    }

    const tokens = await this.drive.connect(authCode);
    const accessTokenEncrypted = encrypt(tokens.accessToken);
    const refreshTokenEncrypted = encrypt(tokens.refreshToken);

    // firmScopeExtension's allow-list has no `upsert` — find-then-create-or-
    // update instead (see Story 1.2 Dev Notes).
    const existing = await this.connections.findByFirmId(firmId);
    if (existing) {
      await this.connections.updateTokens(firmId, {
        accessTokenEncrypted,
        refreshTokenEncrypted,
        expiresAt: tokens.expiresAt,
      });
    } else {
      await this.connections.create({ firmId, accessTokenEncrypted, refreshTokenEncrypted, expiresAt: tokens.expiresAt });
    }
  }

  async revokeAccount(input: { firmId: string }): Promise<void> {
    const firmId = input.firmId.trim();
    if (!firmId) {
      throw new DriveConnectionValidationError("firmId is required");
    }
    await this.connections.revoke(firmId);
  }
}
