/**
 * Firm-member directory entry — NOT an auth account. No password, no login.
 * See Story 1.1's still-open "no real authentication" gap.
 */
export type Role = "PARALEGAL" | "ATTORNEY_OF_RECORD" | "OFFICE_MANAGER" | "CLIENT";

export interface User {
  id: string;
  firmId: string;
  name: string;
  email: string;
  role: Role;
}
