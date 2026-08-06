import { Readable } from "node:stream";
// Imported from googleapis-common, not the top-level google-auth-library
// package — @googleapis/drive bundles its own nested google-auth-library
// version, and TypeScript treats the two OAuth2Client classes as distinct
// (structurally incompatible) types despite being functionally the same.
// This is the version @googleapis/drive's own `auth` client actually expects.
import { OAuth2Client } from "googleapis-common";
import { drive as driveClient, drive_v3 } from "@googleapis/drive";
import type { DriveConnector, DriveFile, DriveFileMetadata, DriveTokens } from "../../ports/DriveConnector";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DRIVE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/drive.file";

function createOAuthClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
  });
}

export function buildConsentUrl(state: string): string {
  return createOAuthClient().generateAuthUrl({
    access_type: "offline",
    scope: [DRIVE_SCOPE, DRIVE_UPLOAD_SCOPE],
    prompt: "consent",
    state,
  });
}

/**
 * Implements DriveConnector for real, using Google's own SDKs
 * (@googleapis/drive + google-auth-library).
 *
 * Constructed per-request with a (decrypted) access token — the same
 * per-request-instance pattern PrismaMatterRepository uses for firmId
 * (Story 1.1). `connect()` is the one method that doesn't need a token yet,
 * since it's what produces the first one from an OAuth authorization code.
 *
 * connect() and getFileMetadata() (used for AC #2's folder-access check) are
 * exercised by this story's tests. listNewFiles/resolveLink/uploadFile are
 * real, complete implementations but exercised by later stories (1.3, 1.4,
 * 6.1 respectively) — not half-built stubs, just not this story's tests to write.
 */
export class GoogleDriveApiAdapter implements DriveConnector {
  constructor(private readonly accessToken?: string) {}

  async connect(authCode: string): Promise<DriveTokens> {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(authCode);
    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
      throw new Error("Google OAuth token exchange did not return the expected access/refresh token and expiry");
    }
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(tokens.expiry_date),
    };
  }

  private driveForAccessToken(): drive_v3.Drive {
    if (!this.accessToken) {
      throw new Error("GoogleDriveApiAdapter: this operation requires an access token — construct with one");
    }
    const auth = createOAuthClient();
    auth.setCredentials({ access_token: this.accessToken });
    return driveClient({ version: "v3", auth });
  }

  async listNewFiles(folderId: string, since?: Date): Promise<DriveFile[]> {
    const drive = this.driveForAccessToken();
    const sinceClause = since ? ` and modifiedTime > '${since.toISOString()}'` : "";
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false${sinceClause}`,
      fields: "files(id, name, modifiedTime)",
    });
    return (res.data.files ?? []).map((f) => ({
      id: f.id!,
      name: f.name!,
      modifiedAt: new Date(f.modifiedTime!),
    }));
  }

  async getFileMetadata(fileId: string): Promise<DriveFileMetadata> {
    const drive = this.driveForAccessToken();
    const res = await drive.files.get({ fileId, fields: "id, name, modifiedTime, mimeType" });
    return {
      id: res.data.id!,
      name: res.data.name!,
      modifiedAt: new Date(res.data.modifiedTime!),
      mimeType: res.data.mimeType!,
    };
  }

  async resolveLink(fileId: string): Promise<string> {
    const drive = this.driveForAccessToken();
    const res = await drive.files.get({ fileId, fields: "webViewLink" });
    if (!res.data.webViewLink) {
      throw new Error(`Drive returned no webViewLink for file ${fileId}`);
    }
    return res.data.webViewLink;
  }

  async uploadFile(folderId: string, file: { name: string; content: Buffer }): Promise<string> {
    const drive = this.driveForAccessToken();
    const res = await drive.files.create({
      requestBody: { name: file.name, parents: [folderId] },
      media: { body: Readable.from(file.content) },
      fields: "id",
    });
    if (!res.data.id) {
      throw new Error("Drive upload did not return a file id");
    }
    return res.data.id;
  }
}
