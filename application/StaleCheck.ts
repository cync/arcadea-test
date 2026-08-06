import { computeAging } from "../domain/Aging";
import type { DocumentRepository } from "./DocumentDetection";
import type { UserRepository } from "./MatterOnboarding";
import type { EmailNotifier } from "../ports/EmailNotifier";

export interface StaleCheckResult {
  alertsSent: number;
}

/**
 * Firm-scoped — constructed per-Firm like every other application service.
 * Reuses domain/Aging.ts's shared computeAging (AD-7) rather than
 * recomputing "days since last change" independently. De-dupe (AC #2) is
 * Document.staleAlertSentAt, reset by StatusTransition on every transition —
 * not a fourth AuditEntry action type (AD-6 names exactly three).
 */
export class StaleCheck {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly users: UserRepository,
    private readonly emailNotifier: EmailNotifier,
  ) {}

  async run(now: Date = new Date()): Promise<StaleCheckResult> {
    const documents = await this.documents.findAllForFirm();
    let alertsSent = 0;

    for (const document of documents) {
      const aging = computeAging(document.statusChangedAt, now);
      if (!aging.isStale || document.staleAlertSentAt) {
        continue;
      }

      const attorney = await this.users.findById(document.attorneyOfRecordId);
      const officeManagers = await this.users.findByRole("OFFICE_MANAGER");
      const recipients = [...new Set([attorney?.email, ...officeManagers.map((u) => u.email)].filter((e): e is string => Boolean(e)))];
      if (recipients.length === 0) {
        continue;
      }

      await this.emailNotifier.sendStaleAlert({
        to: recipients,
        documentId: document.id,
        documentName: document.name,
        agingDays: aging.days,
      });
      await this.documents.markStaleAlertSent(document.id, now);
      alertsSent++;
    }

    return { alertsSent };
  }
}
