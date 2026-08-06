import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { firmScopeExtension } from "../../adapters/db/firmScopeExtension";
import { createTestClient } from "../helpers/testDb";

let testClient: PrismaClient;

vi.mock("../../adapters/db/prisma", () => ({
  firmScopedClient: (firmId: string) => testClient.$extends(firmScopeExtension(firmId)),
}));

vi.mock("googleapis-common", () => {
  class FakeOAuth2Client {
    credentials: Record<string, unknown> = {};
    constructor(public opts: unknown) {}
    generateAuthUrl(opts: { state: string }) {
      return `https://accounts.google.com/o/oauth2/auth?state=${opts.state}`;
    }
    async getToken(code: string) {
      return {
        tokens: {
          access_token: `fake-access-${code}`,
          refresh_token: `fake-refresh-${code}`,
          expiry_date: Date.now() + 3600_000,
        },
      };
    }
    setCredentials(creds: Record<string, unknown>) {
      this.credentials = creds;
    }
  }
  return { OAuth2Client: FakeOAuth2Client };
});

vi.mock("@googleapis/drive", () => ({
  drive: vi.fn(() => ({
    files: {
      get: vi.fn(async ({ fileId }: { fileId: string }) => {
        if (fileId === "inaccessible-folder") {
          throw new Error("403 Forbidden");
        }
        return { data: { id: fileId, name: "Case Files", modifiedTime: new Date().toISOString(), mimeType: "application/vnd.google-apps.folder" } };
      }),
    },
  })),
}));

const { GET: oauthStart } = await import("../../app/api/drive/oauth/start/route");
const { GET: oauthCallback } = await import("../../app/api/drive/oauth/callback/route");
const { POST: linkFolder } = await import("../../app/api/matters/[id]/drive-folder/route");
const { signState } = await import("../../app/api/_lib/oauthState");

function sessionHeaders(firmId: string, role = "OFFICE_MANAGER") {
  return { "x-dev-user-id": "user-1", "x-dev-firm-id": firmId, "x-dev-role": role };
}

describe("Drive API routes (route handlers, PGlite-backed, Google SDKs mocked)", () => {
  let firmId: string;
  let matterId: string;

  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "Bzyuseu9/yH7/F0sHlxeFru+C9lvwziz66mbKIF/0sA=";
    process.env.OAUTH_STATE_SECRET = "2Wa0gC16ZhYr/7Nzoh10fQmi6a2BoQTRoyjn0cRCiSY=";
  });

  beforeEach(async () => {
    testClient = await createTestClient();
    const firm = await testClient.firm.create({ data: { name: "Firm A" } });
    firmId = firm.id;
    const matter = await testClient.$extends(firmScopeExtension(firmId)).matter.create({
      data: { firmId, name: "Smith v. Jones", client: "Smith" },
    });
    matterId = matter.id;
  });

  describe("GET /api/drive/oauth/start", () => {
    it("redirects to the Google consent URL for an Office Manager", async () => {
      const res = await oauthStart(new Request("http://localhost/api/drive/oauth/start", { headers: sessionHeaders(firmId) }));
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("accounts.google.com");
    });

    it("returns 403 for a non-Office-Manager role", async () => {
      const res = await oauthStart(
        new Request("http://localhost/api/drive/oauth/start", { headers: sessionHeaders(firmId, "PARALEGAL") }),
      );
      expect(res.status).toBe(403);
    });

    it("returns 401 with no session", async () => {
      const res = await oauthStart(new Request("http://localhost/api/drive/oauth/start"));
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/drive/oauth/callback", () => {
    it("exchanges the code and persists a DriveConnection using the state's firmId", async () => {
      const state = signState({ firmId });
      const res = await oauthCallback(
        new Request(`http://localhost/api/drive/oauth/callback?code=auth-code-1&state=${encodeURIComponent(state)}`),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).connected).toBe(true);

      const stored = await testClient.$extends(firmScopeExtension(firmId)).driveConnection.findFirst({ where: { firmId } });
      expect(stored).not.toBeNull();
    });

    it("rejects a tampered state parameter", async () => {
      const state = signState({ firmId });
      const tampered = state.slice(0, -1) + (state.at(-1) === "A" ? "B" : "A");
      const res = await oauthCallback(
        new Request(`http://localhost/api/drive/oauth/callback?code=auth-code-1&state=${encodeURIComponent(tampered)}`),
      );
      expect(res.status).toBe(400);
    });

    it("rejects a missing code or state", async () => {
      const res = await oauthCallback(new Request("http://localhost/api/drive/oauth/callback"));
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/matters/:id/drive-folder", () => {
    async function connectAccount() {
      const state = signState({ firmId });
      await oauthCallback(new Request(`http://localhost/api/drive/oauth/callback?code=auth-code-2&state=${encodeURIComponent(state)}`));
    }

    it("links a folder given a bare folder ID", async () => {
      await connectAccount();
      const res = await linkFolder(
        new Request(`http://localhost/api/matters/${matterId}/drive-folder`, {
          method: "POST",
          headers: { "content-type": "application/json", ...sessionHeaders(firmId) },
          body: JSON.stringify({ folder: "folder-xyz" }),
        }),
        { params: Promise.resolve({ id: matterId }) },
      );
      expect(res.status).toBe(200);
      expect((await res.json()).driveFolderId).toBe("folder-xyz");
    });

    it("links a folder given a full Drive URL", async () => {
      await connectAccount();
      const res = await linkFolder(
        new Request(`http://localhost/api/matters/${matterId}/drive-folder`, {
          method: "POST",
          headers: { "content-type": "application/json", ...sessionHeaders(firmId) },
          body: JSON.stringify({ folder: "https://drive.google.com/drive/folders/folder-xyz?usp=sharing" }),
        }),
        { params: Promise.resolve({ id: matterId }) },
      );
      expect(res.status).toBe(200);
      expect((await res.json()).driveFolderId).toBe("folder-xyz");
    });

    it("returns 412 FAILED_PRECONDITION when the Firm has no active Drive connection", async () => {
      const res = await linkFolder(
        new Request(`http://localhost/api/matters/${matterId}/drive-folder`, {
          method: "POST",
          headers: { "content-type": "application/json", ...sessionHeaders(firmId) },
          body: JSON.stringify({ folder: "folder-xyz" }),
        }),
        { params: Promise.resolve({ id: matterId }) },
      );
      expect(res.status).toBe(412);
      expect((await res.json()).error.code).toBe("FAILED_PRECONDITION");
    });

    it("returns 403 for a non-Office-Manager role", async () => {
      await connectAccount();
      const res = await linkFolder(
        new Request(`http://localhost/api/matters/${matterId}/drive-folder`, {
          method: "POST",
          headers: { "content-type": "application/json", ...sessionHeaders(firmId, "PARALEGAL") },
          body: JSON.stringify({ folder: "folder-xyz" }),
        }),
        { params: Promise.resolve({ id: matterId }) },
      );
      expect(res.status).toBe(403);
    });

    it("returns 400 VALIDATION_ERROR when folder is missing", async () => {
      await connectAccount();
      const res = await linkFolder(
        new Request(`http://localhost/api/matters/${matterId}/drive-folder`, {
          method: "POST",
          headers: { "content-type": "application/json", ...sessionHeaders(firmId) },
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: matterId }) },
      );
      expect(res.status).toBe(400);
    });
  });
});
