CREATE TABLE "UserMicrochipInventory" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "microchip" TEXT NOT NULL,
  "linkedCatId" INTEGER,
  "linkedKittenId" INTEGER,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserMicrochipInventory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserMicrochipInventory_microchip_key" ON "UserMicrochipInventory"("microchip");
CREATE INDEX "UserMicrochipInventory_userId_deletedAt_idx" ON "UserMicrochipInventory"("userId", "deletedAt");
CREATE INDEX "UserMicrochipInventory_linkedCatId_idx" ON "UserMicrochipInventory"("linkedCatId");
CREATE INDEX "UserMicrochipInventory_linkedKittenId_idx" ON "UserMicrochipInventory"("linkedKittenId");

ALTER TABLE "UserMicrochipInventory"
  ADD CONSTRAINT "UserMicrochipInventory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserMicrochipInventory"
  ADD CONSTRAINT "UserMicrochipInventory_linkedCatId_fkey"
  FOREIGN KEY ("linkedCatId") REFERENCES "Cat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
