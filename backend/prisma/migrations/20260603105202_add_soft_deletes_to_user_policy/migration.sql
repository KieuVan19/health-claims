-- AlterTable
ALTER TABLE "UserPolicy" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedBy" TEXT;
