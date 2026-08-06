/**
 * Domain entity — intentionally decoupled from the Prisma-generated type
 * (hexagonal paradigm: domain has no outward dependencies, including on the
 * ORM's generated client types).
 */
export interface Matter {
  id: string;
  firmId: string;
  name: string;
  client: string;
  driveFolderId: string | null;
  primaryAttorneyId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
