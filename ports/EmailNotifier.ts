/**
 * Named in ARCHITECTURE-SPINE.md's Structural Seed. Application/domain code
 * depends only on this interface — never on a concrete email provider.
 */

export interface StaleAlertEmail {
  to: string[];
  documentId: string;
  documentName: string;
  agingDays: number;
}

export interface EmailNotifier {
  sendStaleAlert(email: StaleAlertEmail): Promise<void>;
}
