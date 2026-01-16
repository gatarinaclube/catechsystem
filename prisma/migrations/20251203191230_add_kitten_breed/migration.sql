-- AlterTable
ALTER TABLE "LitterKitten" ADD COLUMN     "breed" TEXT;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "litterId" INTEGER;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_litterId_fkey" FOREIGN KEY ("litterId") REFERENCES "Litter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
