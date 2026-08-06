import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { firmScopeExtension } from "../../adapters/db/firmScopeExtension";
import { createTestClient } from "../helpers/testDb";

let testClient: PrismaClient;

vi.mock("../../adapters/db/prisma", () => ({
  firmScopedClient: (firmId: string) => testClient.$extends(firmScopeExtension(firmId)),
  systemClient: () => testClient,
}));

const { POST: staleCheck } = await import("../../app/api/jobs/stale-check/route");

const DAY_MS = 24 * 60 * 60 * 1000;

describe("POST /api/jobs/stale-check (route handler, PGlite-backed)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM_ADDRESS = "alerts@docket.test";
  });

  beforeEach(async () => {
    testClient = await createTestClient();
    fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  async function seedStaleFirm(name: string) {
    const firm = await testClient.firm.create({ data: { name } });
    const scoped = testClient.$extends(firmScopeExtension(firm.id));
    const attorney = await scoped.user.create({ data: { firmId: firm.id, name: "Attorney", email: `a-${firm.id}@x.com`, role: "ATTORNEY_OF_RECORD" } });
    const matter = await scoped.matter.create({ data: { firmId: firm.id, name: "Smith v. Jones", client: "Smith" } });
    const document = await scoped.document.create({
      data: {
        firmId: firm.id,
        matterId: matter.id,
        driveFileId: "file-1",
        name: "Motion.pdf",
        attorneyOfRecordId: attorney.id,
        status: "DRAFT",
        statusChangedAt: new Date(Date.now() - 5 * DAY_MS),
      },
    });
    return { firm, document };
  }

  it("returns an empty results array when there's nothing to check", async () => {
    const res = await staleCheck();
    expect(res.status).toBe(200);
    expect((await res.json()).results).toEqual([]);
  });

  it("sends one alert per stale Document, across two different Firms", async () => {
    await seedStaleFirm("Firm A");
    await seedStaleFirm("Firm B");

    const res = await staleCheck();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(2);
    expect(body.results.reduce((sum: number, r: { alertsSent: number }) => sum + r.alertsSent, 0)).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not resend an alert for a Document already alerted on a prior run (AC #2)", async () => {
    await seedStaleFirm("Firm A");

    await staleCheck();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const res = await staleCheck();
    const body = await res.json();

    expect(body.results[0].alertsSent).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends no alert for a fresh (non-stale) Document", async () => {
    const firm = await testClient.firm.create({ data: { name: "Firm A" } });
    const scoped = testClient.$extends(firmScopeExtension(firm.id));
    const attorney = await scoped.user.create({ data: { firmId: firm.id, name: "Attorney", email: "a@x.com", role: "ATTORNEY_OF_RECORD" } });
    const matter = await scoped.matter.create({ data: { firmId: firm.id, name: "Smith v. Jones", client: "Smith" } });
    await scoped.document.create({
      data: { firmId: firm.id, matterId: matter.id, driveFileId: "file-1", name: "Motion.pdf", attorneyOfRecordId: attorney.id, status: "DRAFT" },
    });

    const res = await staleCheck();
    const body = await res.json();

    expect(body.results[0].alertsSent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires no session/headers at all (AC #3)", async () => {
    await seedStaleFirm("Firm A");
    const res = await staleCheck();
    expect(res.status).toBe(200);
  });
});
