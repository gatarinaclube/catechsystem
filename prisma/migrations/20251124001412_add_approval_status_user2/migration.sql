-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('INDEFERIDO', 'DEFERIDO', 'RESTRICOES');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminNotes" TEXT,
ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'INDEFERIDO';
