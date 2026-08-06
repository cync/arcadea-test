import { scanAllConnectedMatters } from "../../../../jobs/scanDocuments";

/**
 * [ASSUMPTION] No auth gate on this route — a manually-triggerable stand-in
 * for a real scheduler (see Story 1.3 Dev Notes/Open Questions). Flagged as
 * a real security gap, not shipped as if it were fine: an unauthenticated
 * endpoint that writes data must be gated (shared-secret header, or moved
 * fully server-side behind a real scheduler) before this goes anywhere near
 * production.
 */
export async function POST() {
  const results = await scanAllConnectedMatters();
  return Response.json({ results });
}
