import { resolveSession, type Role } from "../../../_lib/session";
import { errorResponse } from "../../../_lib/errors";
import { DelegatedApproval } from "../../../../../application/DelegatedApproval";
import { StatusTransition, StatusTransitionError } from "../../../../../application/StatusTransition";
import { PrismaDocumentRepository } from "../../../../../adapters/db/documentRepository";
import { PrismaAuditEntryRepository } from "../../../../../adapters/db/auditEntryRepository";

// Office-Manager-only, regardless of whose Document it is (EXPERIENCE.md) —
// a static role gate, not the document-instance-scoped check
// AttorneyReassignment/DeadlineManagement use.
const ALLOWED_ROLES: Role[] = ["OFFICE_MANAGER"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = resolveSession(request);
  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "A valid session is required.");
  }
  if (!ALLOWED_ROLES.includes(session.role)) {
    return errorResponse(403, "FORBIDDEN", "Only an Office Manager can use the delegated-approval action.");
  }

  let body: unknown = {};
  const rawBody = await request.text();
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return errorResponse(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
    }
  }
  if (body === null || typeof body !== "object") {
    return errorResponse(400, "VALIDATION_ERROR", "Request body must be a JSON object.");
  }

  const { reason } = body as { reason?: unknown };
  if (reason !== undefined && typeof reason !== "string") {
    return errorResponse(400, "VALIDATION_ERROR", '"reason" must be a string when provided.');
  }

  const { id: documentId } = await params;
  const documents = new PrismaDocumentRepository(session.firmId);
  const auditEntries = new PrismaAuditEntryRepository(session.firmId);
  const delegatedApproval = new DelegatedApproval(new StatusTransition(documents, auditEntries));

  try {
    const document = await delegatedApproval.approve({ documentId, firmId: session.firmId, actorId: session.userId, reason });
    return Response.json(document);
  } catch (error) {
    if (error instanceof StatusTransitionError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      return errorResponse(status, error.code, error.message);
    }
    throw error;
  }
}
