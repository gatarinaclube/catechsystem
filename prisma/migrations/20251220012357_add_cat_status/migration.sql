-- CreateEnum
CREATE TYPE "CatStatus" AS ENUM ('NOVO', 'APROVADO', 'NAO_APROVADO');

-- AlterTable
ALTER TABLE "Cat" ADD COLUMN     "status" "CatStatus" NOT NULL DEFAULT 'NOVO';
