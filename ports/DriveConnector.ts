/**
 * Named in ARCHITECTURE-SPINE.md's Structural Seed and bound by AD-2: all
 * Google Drive interaction goes through this interface. Application/domain
 * code depends only on this — never on @googleapis/drive or
 * google-auth-library directly.
 */

export interface DriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface DriveFile {
  id: string;
  name: string;
  modifiedAt: Date;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  modifiedAt: Date;
  mimeType: string;
}

export interface DriveConnector {
  connect(authCode: string): Promise<DriveTokens>;
  listNewFiles(folderId: string, since?: Date): Promise<DriveFile[]>;
  getFileMetadata(fileId: string): Promise<DriveFileMetadata>;
  resolveLink(fileId: string): Promise<string>;
  uploadFile(folderId: string, file: { name: string; content: Buffer }): Promise<string>;
}
