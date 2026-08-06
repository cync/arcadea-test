import { runStaleCheckForAllFirms } from "../../../../jobs/staleCheck";

/**
 * [ASSUMPTION] No auth gate on this route — a manually-triggerable stand-in
 * for a real scheduler (same posture as POST /api/jobs/scan-documents,
 * Story 1.3). Flagged as a real security gap, not shipped as if it were
 * fine: an unauthenticated endpoint that sends email and writes data must be
 * gated (shared-secret header, or moved fully server-side behind a real
 * scheduler) before this goes anywhere near production.
 */
export async function POST() {
  const results = await runStaleCheckForAllFirms();
  return Response.json({ results });
}
