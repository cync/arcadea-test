import { beforeEach, describe, expect, it } from "vitest";
import { firmScopeExtension } from "../../adapters/db/firmScopeExtension";
import { createTestClient } from "../helpers/testDb";

describe("firmScopeExtension (AD-1 enforcement, real PostgreSQL-compatible engine via PGlite)", () => {
  let base: Awaited<ReturnType<typeof createTestClient>>;
  let firmA: { id: string };
  let firmB: { id: string };

  beforeEach(async () => {
    base = await createTestClient();
    firmA = await base.firm.create({ data: { name: "Firm A" } });
    firmB = await base.firm.create({ data: { name: "Firm B" } });
  });

  it("scopes create() to the extension's firmId even if the caller passes a different one", async () => {
    const scopedA = base.$extends(firmScopeExtension(firmA.id));

    const matter = await scopedA.matter.create({
      data: { firmId: firmB.id, name: "Smith v. Jones", client: "Smith" },
    });

    expect(matter.firmId).toBe(firmA.id);
  });

  it("findFirst never returns another Firm's Matter — this is AC #2", async () => {
    const scopedA = base.$extends(firmScopeExtension(firmA.id));
    const scopedB = base.$extends(firmScopeExtension(firmB.id));

    const matter = await scopedA.matter.create({
      data: { firmId: firmA.id, name: "Smith v. Jones", client: "Smith" },
    });

    const foundByOwner = await scopedA.matter.findFirst({ where: { id: matter.id } });
    const foundByOtherFirm = await scopedB.matter.findFirst({ where: { id: matter.id } });

    expect(foundByOwner?.id).toBe(matter.id);
    expect(foundByOtherFirm).toBeNull();
  });

  it("findMany only ever returns the scoped Firm's Matters", async () => {
    const scopedA = base.$extends(firmScopeExtension(firmA.id));
    const scopedB = base.$extends(firmScopeExtension(firmB.id));

    await scopedA.matter.create({ data: { firmId: firmA.id, name: "A's matter", client: "X" } });
    await scopedB.matter.create({ data: { firmId: firmB.id, name: "B's matter", client: "Y" } });

    const matchesForA = await scopedA.matter.findMany({});
    expect(matchesForA).toHaveLength(1);
    expect(matchesForA[0].name).toBe("A's matter");
  });

  it("rejects findUnique on a scoped model rather than silently allowing unscoped access", async () => {
    const scopedA = base.$extends(firmScopeExtension(firmA.id));
    const matter = await scopedA.matter.create({
      data: { firmId: firmA.id, name: "Smith v. Jones", client: "Smith" },
    });

    await expect(scopedA.matter.findUnique({ where: { id: matter.id } })).rejects.toThrow(/not allow-listed/);
  });

  it("throws at construction time when firmId is empty", () => {
    expect(() => firmScopeExtension("")).toThrow(/requires a firmId/);
  });

  it("does not scope models outside the allow-list (Firm itself)", async () => {
    const scopedA = base.$extends(firmScopeExtension(firmA.id));
    const firms = await scopedA.firm.findMany({});
    // Firm is not in FIRM_SCOPED_MODELS — both firms are visible, proving the
    // extension is selective rather than blanket-filtering every model.
    expect(firms.length).toBeGreaterThanOrEqual(2);
  });

  it("updateMany overwrites a caller-supplied data.firmId instead of letting it reassign the row to another Firm", async () => {
    const scopedA = base.$extends(firmScopeExtension(firmA.id));
    const matter = await scopedA.matter.create({
      data: { firmId: firmA.id, name: "Smith v. Jones", client: "Smith" },
    });

    await scopedA.matter.updateMany({
      where: { id: matter.id },
      data: { name: "Renamed", firmId: firmB.id },
    });

    const stillOwnedByA = await scopedA.matter.findFirst({ where: { id: matter.id } });
    expect(stillOwnedByA?.firmId).toBe(firmA.id);
    expect(stillOwnedByA?.name).toBe("Renamed");
  });

  it("does not throw when Prisma calls an operation with undefined args (e.g. a zero-arg count())", async () => {
    const scopedA = base.$extends(firmScopeExtension(firmA.id));
    await expect(scopedA.matter.count()).resolves.toBeTypeOf("number");
  });
});
