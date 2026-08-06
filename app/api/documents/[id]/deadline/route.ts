import { resolveSession } from "../../../_lib/session";
import { errorResponse } from "../../../_lib/errors";
import { DeadlineManagement, DeadlineError } from "../../../../../application/DeadlineManagement";
import { PrismaDocumentRepository } from "../../../../../adapters/db/documentRepository";

// No static role gate — same reasoning and shape as POST /api/documents/:id/attorney
// (Story 1.5): resolveSession still requires a valid session, but the
// FORBIDDEN-vs-not decision is instance-scoped (is this actor the
// Document's current Attorney of Record?) and is delegated entirely to
// DeadlineManagement.setDeadline.
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

  const { deadline: deadlineInput } = body as { deadline?: unknown };
  if (typeof deadlineInput !== "string" || !deadlineInput.trim()) {
    return errorResponse(400, "VALIDATION_ERROR", '"deadline" is a required ISO-8601 date string.');
  }
  const deadline = new Date(deadlineInput);
  if (isNaN(deadline.getTime())) {
    return errorResponse(400, "VALIDATION_ERROR", '"deadline" must be a valid date.');
  }

  const { id: documentId } = await params;
  const documents = new PrismaDocumentRepository(session.firmId);
  const deadlineManagement = new DeadlineManagement(documents);

  try {
    const document = await deadlineManagement.setDeadline({ documentId, actorId: session.userId, deadline });
    return Response.json(document);
  } catch (error) {
    if (error instanceof DeadlineError) {
      const status = error.code === "NOT_FOUND" ? 404 : 403;
      return errorResponse(status, error.code, error.message);
    }
    throw error;
  }
}
