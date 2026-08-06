import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { firmScopeExtension } from "../../adapters/db/firmScopeExtension";
import { createTestClient } from "../helpers/testDb";

// Route handlers call PrismaMatterRepository, which calls firmScopedClient()
// from adapters/db/prisma.ts — that module wires the REAL @prisma/adapter-pg
// against DATABASE_URL. Swap it for a PGlite-backed client so these are
// genuine end-to-end tests of the route handlers against a real
// Postgres-compatible engine, not a mocked repository.
let testClient: PrismaClient;

vi.mock("../../adapters/db/prisma", () => ({
  firmScopedClient: (firmId: string) => testClient.$extends(firmScopeExtension(firmId)),
}));

const { POST } = await import("../../app/api/matters/route");
const { GET } = await import("../../app/api/matters/[id]/route");

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/matters", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function getRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/matters/x", { headers });
}

function sessionHeaders(firmId: string, role = "OFFICE_MANAGER") {
  return { "x-dev-user-id": "user-1", "x-dev-firm-id": firmId, "x-dev-role": role };
}

describe("POST /api/matters and GET /api/matters/:id (route handlers, real PGlite-backed DB)", () => {
  let firmA: { id: string };
  let firmB: { id: string };

  beforeEach(async () => {
    testClient = await createTestClient();
    firmA = await testClient.firm.create({ data: { name: "Firm A" } });
    firmB = await testClient.firm.create({ data: { name: "Firm B" } });
  });

  it("POST creates a Matter and returns 201", async () => {
    const res = await POST(postRequest({ name: "Smith v. Jones", client: "Smith" }, sessionHeaders(firmA.id)));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.firmId).toBe(firmA.id);
  });

  it("POST returns 401 UNAUTHENTICATED with no session headers", async () => {
    const res = await POST(postRequest({ name: "Smith v. Jones", client: "Smith" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("POST returns 403 FORBIDDEN for a non-Office-Manager role", async () => {
    const res = await POST(
      postRequest({ name: "Smith v. Jones", client: "Smith" }, sessionHeaders(firmA.id, "PARALEGAL")),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  it("POST returns 400 VALIDATION_ERROR for a JSON body of null", async () => {
    const res = await POST(postRequest(null, sessionHeaders(firmA.id)));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("POST returns 400 VALIDATION_ERROR for malformed JSON", async () => {
    const res = await POST(postRequest("{not json", sessionHeaders(firmA.id)));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("POST returns 400 VALIDATION_ERROR when name/client are missing", async () => {
    const res = await POST(postRequest({}, sessionHeaders(firmA.id)));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("GET returns the Matter for the owning Firm", async () => {
    const created = await testClient.$extends(firmScopeExtension(firmA.id)).matter.create({
      data: { firmId: firmA.id, name: "Smith v. Jones", client: "Smith" },
    });

    const res = await GET(getRequest(sessionHeaders(firmA.id)), { params: Promise.resolve({ id: created.id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(created.id);
  });

  it("GET returns a generic 404 NOT_FOUND for a Firm-B session requesting a Firm-A Matter — this is AC #2 through the real route", async () => {
    const created = await testClient.$extends(firmScopeExtension(firmA.id)).matter.create({
      data: { firmId: firmA.id, name: "Smith v. Jones", client: "Smith" },
    });

    const res = await GET(getRequest(sessionHeaders(firmB.id)), { params: Promise.resolve({ id: created.id }) });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("GET returns 401 UNAUTHENTICATED with no session headers", async () => {
    const res = await GET(getRequest(), { params: Promise.resolve({ id: "any" }) });
    expect(res.status).toBe(401);
  });

  it("GET returns 403 FORBIDDEN for a Client role (no ClientAccess grant mechanism exists yet)", async () => {
    const res = await GET(getRequest(sessionHeaders(firmA.id, "CLIENT")), {
      params: Promise.resolve({ id: "any" }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  it("GET is allowed for Paralegal and Attorney of Record roles", async () => {
    const created = await testClient.$extends(firmScopeExtension(firmA.id)).matter.create({
      data: { firmId: firmA.id, name: "Smith v. Jones", client: "Smith" },
    });

    for (const role of ["PARALEGAL", "ATTORNEY_OF_RECORD"]) {
      const res = await GET(getRequest(sessionHeaders(firmA.id, role)), {
        params: Promise.resolve({ id: created.id }),
      });
      expect(res.status).toBe(200);
    }
  });
});
