import { resolveSession } from "../../../_lib/session";
import { errorResponse } from "../../../_lib/errors";
import { AttorneyReassignment, ReassignmentError } from "../../../../../application/AttorneyReassignment";
import { PrismaDocumentRepository } from "../../../../../adapters/db/documentRepository";
import { PrismaUserRepository } from "../../../../../adapters/db/userRepository";
import { PrismaAuditEntryRepository } from "../../../../../adapters/db/auditEntryRepository";

// No static role gate here (unlike GET /api/matters/:id or GET /api/documents/:id)
// — resolveSession still requires a valid session to authenticate, but the
// FORBIDDEN-vs-not decision is instance-scoped (is this actor the Document's
// current Attorney of Record, or an Office Manager?) and is delegated
// entirely to AttorneyReassignment.reassign.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = resolveSession(request);
  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "A valid session is required.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
  }
  if (body === null || typeof body !== "object") {
    return errorResponse(400, "VALIDATION_ERROR", "Request body must be a JSON object.");
  }

  const { attorneyId, reason } = body as { attorneyId?: unknown; reason?: unknown };
  if (typeof attorneyId !== "string" || !attorneyId.trim()) {
    return errorResponse(400, "VALIDATION_ERROR", '"attorneyId" is a required string.');
  }
  if (reason !== undefined && typeof reason !== "string") {
    return errorResponse(400, "VALIDATION_ERROR", '"reason" must be a string when provided.');
  }

  const { id: documentId } = await params;
  const documents = new PrismaDocumentRepository(session.firmId);
  const users = new PrismaUserRepository(session.firmId);
  const auditEntries = new PrismaAuditEntryRepository(session.firmId);
  const reassignment = new AttorneyReassignment(documents, users, auditEntries);

  try {
    const document = await reassignment.reassign({
      documentId,
      firmId: session.firmId,
      actorId: session.userId,
      actorRole: session.role,
      newAttorneyId: attorneyId,
      reason,
    });
    return Response.json(document);
  } catch (error) {
    if (error instanceof ReassignmentError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
      return errorResponse(status, error.code, error.message);
    }
    throw error;
  }
}
