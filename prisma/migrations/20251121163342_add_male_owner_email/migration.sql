/*
  Warnings:

  - You are about to drop the column `breeder` on the `Cat` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Cat" DROP CONSTRAINT "Cat_ownerId_fkey";

-- AlterTable
ALTER TABLE "Cat" DROP COLUMN "breeder",
ADD COLUMN     "ownershipType" TEXT,
ADD COLUMN     "photo" TEXT,
ALTER COLUMN "breed" DROP NOT NULL,
ALTER COLUMN "gender" DROP NOT NULL,
ALTER COLUMN "birthDate" DROP NOT NULL,
ALTER COLUMN "ownerId" DROP NOT NULL,
ALTER COLUMN "pedigreePending" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Litter" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER,
    "maleName" TEXT,
    "maleFfbLo" TEXT,
    "maleBreed" TEXT,
    "maleEms" TEXT,
    "maleMicrochip" TEXT,
    "maleOwnerName" TEXT,
    "maleOwnerEmail" TEXT,
    "maleOwnerPhone" TEXT,
    "maleOwnerAddress" TEXT,
    "maleOwnerComplement" TEXT,
    "maleOwnerDistrict" TEXT,
    "maleOwnerCity" TEXT,
    "maleOwnerState" TEXT,
    "maleOwnerCep" TEXT,
    "femaleName" TEXT,
    "femaleFfbLo" TEXT,
    "femaleBreed" TEXT,
    "femaleEms" TEXT,
    "femaleMicrochip" TEXT,
    "femaleOwnerName" TEXT,
    "femaleOwnerPhone" TEXT,
    "femaleOwnerAddress" TEXT,
    "femaleOwnerComplement" TEXT,
    "femaleOwnerDistrict" TEXT,
    "femaleOwnerCity" TEXT,
    "femaleOwnerState" TEXT,
    "femaleOwnerCep" TEXT,
    "catteryCountry" TEXT,
    "litterBreed" TEXT,
    "litterCount" INTEGER,
    "litterBirthDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "sireSignature" TEXT,
    "damSignature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Litter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LitterKitten" (
    "id" SERIAL NOT NULL,
    "litterId" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "name" TEXT,
    "emsEyes" TEXT,
    "sex" TEXT,
    "microchip" TEXT,
    "breeding" TEXT,
    "obs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LitterKitten_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Cat" ADD CONSTRAINT "Cat_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cat" ADD CONSTRAINT "Cat_fatherId_fkey" FOREIGN KEY ("fatherId") REFERENCES "Cat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cat" ADD CONSTRAINT "Cat_motherId_fkey" FOREIGN KEY ("motherId") REFERENCES "Cat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Litter" ADD CONSTRAINT "Litter_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LitterKitten" ADD CONSTRAINT "LitterKitten_litterId_fkey" FOREIGN KEY ("litterId") REFERENCES "Litter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
