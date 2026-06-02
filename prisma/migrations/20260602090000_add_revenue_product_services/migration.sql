CREATE TABLE "RevenueProductService" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "priceCents" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RevenueProductService_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RevenueProductService_ownerId_name_key"
  ON "RevenueProductService"("ownerId", "name");

ALTER TABLE "RevenueProductService"
  ADD CONSTRAINT "RevenueProductService_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RevenueEntry"
  ADD COLUMN "productServiceId" INTEGER;

ALTER TABLE "RevenueEntry"
  ADD CONSTRAINT "RevenueEntry_productServiceId_fkey"
  FOREIGN KEY ("productServiceId") REFERENCES "RevenueProductService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
