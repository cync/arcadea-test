import { describe, expect, it } from "vitest";
import { PrismaMatterRepository } from "../../adapters/db/matterRepository";

describe("PrismaMatterRepository.create", () => {
  it("throws before touching the database when input.firmId doesn't match the repository's bound firmId", async () => {
    const repo = new PrismaMatterRepository("firm-a");
    await expect(
      repo.create({ firmId: "firm-b", name: "Smith v. Jones", client: "Smith" }),
    ).rejects.toThrow(/does not match/);
  });
});
