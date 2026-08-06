import { resolveSession, type Role } from "../../_lib/session";
import { errorResponse } from "../../_lib/errors";
import { DocumentViewer, DocumentNotFoundError } from "../../../../application/DocumentViewer";
import { PrismaDocumentRepository } from "../../../../adapters/db/documentRepository";
import { PrismaDriveConnectionRepository } from "../../../../adapters/db/driveConnectionRepository";
import { GoogleDriveApiAdapter } from "../../../../adapters/drive/googleDriveApiAdapter";

// Staff only — same reasoning as GET /api/matters/:id (Story 1.1): Client
// visibility isn't built until Epic 5.
const ALLOWED_ROLES: Role[] = ["PARALEGAL", "ATTORNEY_OF_RECORD", "OFFICE_MANAGER"];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = resolveSession(request);
  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "A valid session is required.");
  }
  if (!ALLOWED_ROLES.includes(session.role)) {
    return errorResponse(403, "FORBIDDEN", "This role cannot view Documents directly.");
  }

  const { id } = await params;
  const documents = new PrismaDocumentRepository(session.firmId);
  const connections = new PrismaDriveConnectionRepository(session.firmId);
  const viewer = new DocumentViewer(documents, connections, (token) => new GoogleDriveApiAdapter(token));

  try {
    const view = await viewer.getDocument({ documentId: id, firmId: session.firmId });
    return Response.json(view);
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return errorResponse(404, "NOT_FOUND", "Document not found.");
    }
    throw error;
  }
}
