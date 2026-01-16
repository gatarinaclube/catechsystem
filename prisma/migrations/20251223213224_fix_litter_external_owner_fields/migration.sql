/*
  Warnings:

  - You are about to drop the column `maleOwnerAddress` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `maleOwnerCep` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `maleOwnerCity` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `maleOwnerComplement` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `maleOwnerDistrict` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `maleOwnerEmail` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `maleOwnerName` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `maleOwnerPhone` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `maleOwnerState` on the `Litter` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Litter" DROP COLUMN "maleOwnerAddress",
DROP COLUMN "maleOwnerCep",
DROP COLUMN "maleOwnerCity",
DROP COLUMN "maleOwnerComplement",
DROP COLUMN "maleOwnerDistrict",
DROP COLUMN "maleOwnerEmail",
DROP COLUMN "maleOwnerName",
DROP COLUMN "maleOwnerPhone",
DROP COLUMN "maleOwnerState",
ADD COLUMN     "externalOwnerCattery" TEXT,
ADD COLUMN     "externalOwnerCpf" TEXT,
ADD COLUMN     "externalOwnerEmail" TEXT,
ADD COLUMN     "externalOwnerName" TEXT,
ADD COLUMN     "externalOwnerPhone" TEXT,
ADD COLUMN     "maleOwnership" TEXT;
