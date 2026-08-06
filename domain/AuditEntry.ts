/**
 * AD-6: insert-only audit trail for actions the system must be able to prove
 * happened, distinct from an ordinary field edit. `action` is a plain string
 * (not a closed union) so later stories (2.3 Reviewed-by, 4.2 Delegated
 * Approval) can introduce new action values without a schema migration —
 * this story only ever writes "ATTORNEY_REASSIGNED".
 */
export interface AuditEntry {
  id: string;
  firmId: string;
  documentId: string;
  matterId: string;
  actorId: string;
  action: string;
  reason: string | null;
  timestamp: Date;
}
