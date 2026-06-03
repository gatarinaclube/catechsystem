ALTER TABLE "Cat"
ADD COLUMN IF NOT EXISTS "currentOwnerClientId" INTEGER,
ADD COLUMN IF NOT EXISTS "ownershipSource" TEXT;

ALTER TABLE "Cat"
ADD CONSTRAINT "Cat_currentOwnerClientId_fkey"
FOREIGN KEY ("currentOwnerClientId") REFERENCES "RevenueClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
