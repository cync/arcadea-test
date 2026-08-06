import { resolveSession, type Role } from "../../../_lib/session";
import { errorResponse } from "../../../_lib/errors";
import { StatusTransition, StatusTransitionError } from "../../../../../application/StatusTransition";
import { PrismaDocumentRepository } from "../../../../../adapters/db/documentRepository";
import { PrismaAuditEntryRepository } from "../../../../../adapters/db/auditEntryRepository";
import type { DocumentStatus } from "../../../../../domain/Document";

// Staff only — EXPERIENCE.md's Roles & Permissions: Paralegal "move Status",
// inherited by Attorney of Record and Office Manager; Client "Cannot change
// Status".
const ALLOWED_ROLES: Role[] = ["PARALEGAL", "ATTORNEY_OF_RECORD", "OFFICE_MANAGER"];
const VALID_STATUSES: DocumentStatus[] = ["DRAFT", "REVIEWED", "NEEDS_REVISION", "WAITING_ON_CLIENT_SIGNATURE", "FILED_SENT"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = resolveSession(request);
  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "A valid session is required.");
  }
  if (!ALLOWED_ROLES.includes(session.role)) {
    return errorResponse(403, "FORBIDDEN", "This role cannot change a Document's Status.");
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

  const { status, reviewerId } = body as { status?: unknown; reviewerId?: unknown };
  if (typeof status !== "string" || !VALID_STATUSES.includes(status as DocumentStatus)) {
    return errorResponse(400, "VALIDATION_ERROR", `"status" must be one of: ${VALID_STATUSES.join(", ")}.`);
  }
  if (status === "REVIEWED" && (typeof reviewerId !== "string" || !reviewerId.trim())) {
    return errorResponse(400, "VALIDATION_ERROR", '"reviewerId" is required to confirm yourself as the reviewer when moving to Reviewed.');
  }

  const { id: documentId } = await params;
  const documents = new PrismaDocumentRepository(session.firmId);
  const auditEntries = new PrismaAuditEntryRepository(session.firmId);
  const statusTransition = new StatusTransition(documents, auditEntries);

  try {
    const document = await statusTransition.transition({
      documentId,
      firmId: session.firmId,
      toStatus: status as DocumentStatus,
      actorId: session.userId,
      reviewerId: typeof reviewerId === "string" ? reviewerId : undefined,
    });
    return Response.json(document);
  } catch (error) {
    if (error instanceof StatusTransitionError) {
      const httpStatus = error.code === "NOT_FOUND" ? 404 : 400;
      return errorResponse(httpStatus, error.code, error.message);
    }
    throw error;
  }
}
