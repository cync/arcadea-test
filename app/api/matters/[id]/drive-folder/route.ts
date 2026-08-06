import { resolveSession } from "../../../_lib/session";
import { errorResponse } from "../../../_lib/errors";
import { MatterOnboarding, DriveFolderLinkError } from "../../../../../application/MatterOnboarding";
import { PrismaMatterRepository } from "../../../../../adapters/db/matterRepository";
import { PrismaDriveConnectionRepository } from "../../../../../adapters/db/driveConnectionRepository";
import { GoogleDriveApiAdapter } from "../../../../../adapters/drive/googleDriveApiAdapter";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = resolveSession(request);
  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "A valid session is required.");
  }
  if (session.role !== "OFFICE_MANAGER") {
    return errorResponse(403, "FORBIDDEN", "Only an Office Manager can link a Drive folder.");
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

  const { folder } = body as { folder?: unknown };
  if (typeof folder !== "string" || !folder.trim()) {
    return errorResponse(400, "VALIDATION_ERROR", '"folder" is a required string (Drive folder ID or URL).');
  }

  const { id: matterId } = await params;
  const matters = new PrismaMatterRepository(session.firmId);
  const connections = new PrismaDriveConnectionRepository(session.firmId);
  const onboarding = new MatterOnboarding(matters, connections, (accessToken) => new GoogleDriveApiAdapter(accessToken));

  try {
    const matter = await onboarding.linkDriveFolder({ matterId, firmId: session.firmId, folder });
    return Response.json(matter);
  } catch (error) {
    if (error instanceof DriveFolderLinkError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "FAILED_PRECONDITION" ? 412 : 400;
      return errorResponse(status, error.code, error.message);
    }
    throw error;
  }
}
