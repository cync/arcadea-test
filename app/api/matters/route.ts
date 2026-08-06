import { resolveSession } from "../_lib/session";
import { errorResponse } from "../_lib/errors";
import { MatterOnboarding, MatterValidationError } from "../../../application/MatterOnboarding";
import { PrismaMatterRepository } from "../../../adapters/db/matterRepository";

export async function POST(request: Request) {
  const session = resolveSession(request);
  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "A valid session is required.");
  }
  // Office Manager only — EXPERIENCE.md Roles & Permissions.
  if (session.role !== "OFFICE_MANAGER") {
    return errorResponse(403, "FORBIDDEN", "Only an Office Manager can create a Matter.");
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

  const { name, client } = body as { name?: unknown; client?: unknown };
  if (typeof name !== "string" || typeof client !== "string") {
    return errorResponse(400, "VALIDATION_ERROR", '"name" and "client" are required strings.');
  }

  const repository = new PrismaMatterRepository(session.firmId);
  const onboarding = new MatterOnboarding(repository);

  try {
    const matter = await onboarding.createMatter({
      firmId: session.firmId,
      name,
      client,
    });
    return Response.json(matter, { status: 201 });
  } catch (error) {
    if (error instanceof MatterValidationError) {
      return errorResponse(400, "VALIDATION_ERROR", error.message);
    }
    throw error;
  }
}
