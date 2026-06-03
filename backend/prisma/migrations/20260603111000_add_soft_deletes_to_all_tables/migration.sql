-- Add soft delete columns to User
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedBy" TEXT;

-- Add soft delete columns to Claim
ALTER TABLE "Claim" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedBy" TEXT;

-- Add soft delete columns to Document
ALTER TABLE "Document" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedBy" TEXT;

-- Add soft delete columns to InfoRequest
ALTER TABLE "InfoRequest" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Add soft delete columns to Overpayment
ALTER TABLE "Overpayment" ADD COLUMN "deletedAt" TIMESTAMP(3);
