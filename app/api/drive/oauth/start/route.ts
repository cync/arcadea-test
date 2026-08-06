import { resolveSession } from "../../../_lib/session";
import { errorResponse } from "../../../_lib/errors";
import { signState } from "../../../_lib/oauthState";
import { buildConsentUrl } from "../../../../../adapters/drive/googleDriveApiAdapter";

export async function GET(request: Request) {
  const session = resolveSession(request);
  if (!session) {
    return errorResponse(401, "UNAUTHENTICATED", "A valid session is required.");
  }
  if (session.role !== "OFFICE_MANAGER") {
    return errorResponse(403, "FORBIDDEN", "Only an Office Manager can connect a Google Drive account.");
  }

  const state = signState({ firmId: session.firmId });
  return Response.redirect(buildConsentUrl(state), 302);
}
