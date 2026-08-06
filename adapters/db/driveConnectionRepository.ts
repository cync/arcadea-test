import type { DriveConnection } from "../../domain/DriveConnection";
import type { DriveConnectionRepository } from "../../application/DriveOnboarding";
import { firmScopedClient } from "./prisma";

export class PrismaDriveConnectionRepository implements DriveConnectionRepository {
  constructor(private readonly firmId: string) {}

  async findByFirmId(firmId: string): Promise<DriveConnection | null> {
    const client = firmScopedClient(this.firmId);
    return client.driveConnection.findFirst({ where: { firmId } });
  }

  async create(input: {
    firmId: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    expiresAt: Date;
  }): Promise<DriveConnection> {
    const client = firmScopedClient(this.firmId);
    return client.driveConnection.create({
      data: {
        firmId: this.firmId,
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        expiresAt: input.expiresAt,
      },
    });
  }

  async updateTokens(
    firmId: string,
    data: { accessTokenEncrypted: string; refreshTokenEncrypted: string; expiresAt: Date },
  ): Promise<void> {
    const client = firmScopedClient(this.firmId);
    await client.driveConnection.updateMany({
      where: { firmId },
      data: { ...data, revokedAt: null },
    });
  }

  async revoke(firmId: string): Promise<void> {
    const client = firmScopedClient(this.firmId);
    await client.driveConnection.updateMany({ where: { firmId }, data: { revokedAt: new Date() } });
  }
}
