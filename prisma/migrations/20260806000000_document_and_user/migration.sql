-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'REVIEWED', 'NEEDS_REVISION', 'WAITING_ON_CLIENT_SIGNATURE', 'FILED_SENT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_firmId_idx" ON "users"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "users_firmId_email_key" ON "users"("firmId", "email");

-- AlterTable
ALTER TABLE "matters" ADD COLUMN "primaryAttorneyId" TEXT;

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "attorneyOfRecordId" TEXT NOT NULL,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_firmId_idx" ON "documents"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_matterId_driveFileId_key" ON "documents"("matterId", "driveFileId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_primaryAttorneyId_fkey" FOREIGN KEY ("primaryAttorneyId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "matters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_attorneyOfRecordId_fkey" FOREIGN KEY ("attorneyOfRecordId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
