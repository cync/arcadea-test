import { errorResponse } from "../../../_lib/errors";
import { verifyState } from "../../../_lib/oauthState";
import { DriveOnboarding, DriveConnectionValidationError } from "../../../../../application/DriveOnboarding";
import { PrismaDriveConnectionRepository } from "../../../../../adapters/db/driveConnectionRepository";
import { GoogleDriveApiAdapter } from "../../../../../adapters/drive/googleDriveApiAdapter";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return errorResponse(400, "VALIDATION_ERROR", "Missing code or state.");
  }

  // The signature proves this state was minted by our own /oauth/start after
  // an Office-Manager-role check — that check isn't repeated here (see
  // Story 1.2 Dev Notes on why resolveSession's headers can't survive a
  // browser redirect from Google).
  const verified = verifyState(state);
  if (!verified) {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid or tampered state parameter.");
  }

  const repository = new PrismaDriveConnectionRepository(verified.firmId);
  const onboarding = new DriveOnboarding(repository, new GoogleDriveApiAdapter());

  try {
    await onboarding.connectAccount({ firmId: verified.firmId, authCode: code });
    return Response.json({ connected: true });
  } catch (error) {
    if (error instanceof DriveConnectionValidationError) {
      return errorResponse(400, "VALIDATION_ERROR", error.message);
    }
    throw error;
  }
}
