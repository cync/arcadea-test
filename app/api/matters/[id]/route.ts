import { resolveSession, type Role } from "../../_lib/session";
import { errorResponse } from "../../_lib/errors";
import { MatterOnboarding } from "../../../../application/MatterOnboarding";
import { PrismaMatterRepository } from "../../../../adapters/db/matterRepository";

// Staff only — Client visibility goes through a scoped ClientAccess grant
// (Epic 5), which doesn't exist yet. Until then a Client session has no
// legitimate grant to check against, so it gets none of this route.
const ALLOWED_ROLES: Role[] = ["PARALEGAL", "ATTORNEY_OF_RECORD", "OFFICE_MANAGER"];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = resolveSession(request);
  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "A valid session is required.");
  }
  if (!ALLOWED_ROLES.includes(session.role)) {
    return errorResponse(403, "FORBIDDEN", "This role cannot view Matters directly.");
  }

  const { id } = await params;
  const repository = new PrismaMatterRepository(session.firmId);
  const onboarding = new MatterOnboarding(repository);
  const matter = await onboarding.getMatter(id);

  if (!matter) {
    // Generic 404 whether the Matter doesn't exist or belongs to another
    // Firm — never confirms existence to an unauthorized session
    // (EXPERIENCE.md State Patterns: "Cross-Firm access attempt").
    return errorResponse(404, "NOT_FOUND", "Matter not found.");
  }

  return Response.json(matter);
}
