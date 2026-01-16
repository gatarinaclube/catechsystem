/*
  Warnings:

  - You are about to drop the column `femaleOwnerAddress` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `femaleOwnerCep` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `femaleOwnerCity` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `femaleOwnerComplement` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `femaleOwnerDistrict` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `femaleOwnerName` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `femaleOwnerPhone` on the `Litter` table. All the data in the column will be lost.
  - You are about to drop the column `femaleOwnerState` on the `Litter` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Litter" DROP COLUMN "femaleOwnerAddress",
DROP COLUMN "femaleOwnerCep",
DROP COLUMN "femaleOwnerCity",
DROP COLUMN "femaleOwnerComplement",
DROP COLUMN "femaleOwnerDistrict",
DROP COLUMN "femaleOwnerName",
DROP COLUMN "femaleOwnerPhone",
DROP COLUMN "femaleOwnerState";
