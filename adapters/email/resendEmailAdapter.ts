import type { EmailNotifier, StaleAlertEmail } from "../../ports/EmailNotifier";

/**
 * [ASSUMPTION] Resend chosen as the concrete EmailNotifier adapter
 * (ARCHITECTURE-SPINE.md Deferred: "Concrete EmailNotifier adapter... Needed
 * before Epic 3") — pairs with the Vercel deploy target the spine already
 * assumes, and its HTTP API needs no SDK dependency (called via native
 * fetch), avoiding a new npm dependency for an architectural pick this story
 * resolves outright (same treatment Story 1.2 gave the Drive-mechanism
 * choice). No real RESEND_API_KEY exists in this environment — never
 * exercised against the real network in tests, only via a mocked fetch.
 */
export class ResendEmailAdapter implements EmailNotifier {
  async sendStaleAlert(email: StaleAlertEmail): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM_ADDRESS;
    if (!apiKey || !from) {
      throw new Error("ResendEmailAdapter requires RESEND_API_KEY and EMAIL_FROM_ADDRESS environment variables");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: email.to,
        subject: `Stale Document: ${email.documentName}`,
        text: `"${email.documentName}" has been untouched for ${email.agingDays} days. Document ID: ${email.documentId}.`,
      }),
    });

    if (!response.ok) {
      throw new Error(`ResendEmailAdapter: Resend API returned ${response.status}`);
    }
  }
}
