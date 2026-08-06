import type { Matter } from "../../domain/Matter";
import type { CreateMatterInput, MatterRepository } from "../../application/MatterOnboarding";
import { firmScopedClient } from "./prisma";

/**
 * Prisma-backed adapter for MatterRepository. Always constructed with the
 * calling request's firmId — there is no unscoped constructor path (AD-1).
 */
export class PrismaMatterRepository implements MatterRepository {
  constructor(private readonly firmId: string) {}

  async create(input: CreateMatterInput): Promise<Matter> {
    // input.firmId must match the repository's bound firmId — asserted, not
    // silently overridden, so a caller passing a different Firm fails loudly
    // instead of appearing to succeed under the wrong scope.
    if (input.firmId !== this.firmId) {
      throw new Error(
        `PrismaMatterRepository: input.firmId ("${input.firmId}") does not match the repository's bound firmId ("${this.firmId}")`,
      );
    }

    const client = firmScopedClient(this.firmId);
    return client.matter.create({
      data: { firmId: this.firmId, name: input.name, client: input.client },
    });
  }

  /**
   * findFirst, not findUnique — firmScopeExtension rejects findUnique for
   * scoped models on purpose (see firmScopeExtension.ts). A cross-Firm id
   * resolves to null here, which the API route turns into a generic 404
   * (EXPERIENCE.md: never confirm the record exists to the wrong Firm).
   */
  async findById(id: string): Promise<Matter | null> {
    const client = firmScopedClient(this.firmId);
    return client.matter.findFirst({ where: { id } });
  }

  /**
   * updateMany, not update — firmScopeExtension only allow-lists updateMany
   * for scoped models (same reasoning as findFirst over findUnique above).
   */
  async setDriveFolder(matterId: string, driveFolderId: string): Promise<Matter> {
    const client = firmScopedClient(this.firmId);
    await client.matter.updateMany({ where: { id: matterId }, data: { driveFolderId } });
    const updated = await client.matter.findFirst({ where: { id: matterId } });
    if (!updated) {
      throw new Error(`PrismaMatterRepository.setDriveFolder: Matter ${matterId} not found after update`);
    }
    return updated;
  }

  async setPrimaryAttorney(matterId: string, attorneyId: string): Promise<Matter> {
    const client = firmScopedClient(this.firmId);
    await client.matter.updateMany({ where: { id: matterId }, data: { primaryAttorneyId: attorneyId } });
    const updated = await client.matter.findFirst({ where: { id: matterId } });
    if (!updated) {
      throw new Error(`PrismaMatterRepository.setPrimaryAttorney: Matter ${matterId} not found after update`);
    }
    return updated;
  }
}
