export type DocumentStatus = "DRAFT" | "REVIEWED" | "NEEDS_REVISION" | "WAITING_ON_CLIENT_SIGNATURE" | "FILED_SENT";

/**
 * attorneyOfRecordId is set once at creation (AD-3/AD-6 own reassignment
 * later, in Epic 2/4) — no story before this one writes it, and this story
 * never updates it after creation (AC #2).
 */
export interface Document {
  id: string;
  firmId: string;
  matterId: string;
  driveFileId: string;
  name: string;
  status: DocumentStatus;
  attorneyOfRecordId: string;
  reviewedByUserId: string | null;
  deadline: Date | null;
  staleAlertSentAt: Date | null;
  statusChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
