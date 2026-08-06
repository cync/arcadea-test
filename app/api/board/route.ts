import { resolveSession, type Role } from "../_lib/session";
import { errorResponse } from "../_lib/errors";
import { WorkflowBoard } from "../../../application/WorkflowBoard";
import { PrismaDocumentRepository } from "../../../adapters/db/documentRepository";

// Staff only — same reasoning as GET /api/matters/:id and GET /api/documents/:id
// (Story 1.1/1.4): Client visibility is a separate surface (Client Matter
// View, Epic 5), not this endpoint.
const ALLOWED_ROLES: Role[] = ["PARALEGAL", "ATTORNEY_OF_RECORD", "OFFICE_MANAGER"];

export async function GET(request: Request) {
  const session = resolveSession(request);
  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "A valid session is required.");
  }
  if (!ALLOWED_ROLES.includes(session.role)) {
    return errorResponse(403, "FORBIDDEN", "This role cannot view the workflow board.");
  }

  const documents = new PrismaDocumentRepository(session.firmId);
  const board = new WorkflowBoard(documents);
  return Response.json(await board.getBoard());
}
