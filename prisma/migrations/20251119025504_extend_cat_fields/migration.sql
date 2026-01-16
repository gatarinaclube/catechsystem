/*
  Warnings:

  - You are about to drop the column `breeder` on the `Cat` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Cat" DROP COLUMN "breeder",
ADD COLUMN     "breederName" TEXT,
ADD COLUMN     "breederType" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "emsCode" TEXT,
ADD COLUMN     "fatherBreed" TEXT,
ADD COLUMN     "fatherEmsCode" TEXT,
ADD COLUMN     "fatherId" INTEGER,
ADD COLUMN     "fatherName" TEXT,
ADD COLUMN     "fifeStatus" TEXT,
ADD COLUMN     "microchip" TEXT,
ADD COLUMN     "motherBreed" TEXT,
ADD COLUMN     "motherEmsCode" TEXT,
ADD COLUMN     "motherId" INTEGER,
ADD COLUMN     "motherName" TEXT,
ADD COLUMN     "neutered" BOOLEAN,
ADD COLUMN     "otherDocsFile" TEXT,
ADD COLUMN     "pedigreeFile" TEXT,
ADD COLUMN     "pedigreeNumber" TEXT,
ADD COLUMN     "pedigreePending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pedigreeType" TEXT,
ADD COLUMN     "reproductionFile" TEXT;
