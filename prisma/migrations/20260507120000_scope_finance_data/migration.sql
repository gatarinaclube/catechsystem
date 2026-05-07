ALTER TABLE "QuickLaunchEntry" ALTER COLUMN "receiptPath" DROP NOT NULL;

ALTER TABLE "QuickLaunchOption" ADD COLUMN "ownerId" INTEGER;
ALTER TABLE "RevenueClient" ADD COLUMN "ownerId" INTEGER;

ALTER TABLE "QuickLaunchOption"
  ADD CONSTRAINT "QuickLaunchOption_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RevenueClient"
  ADD CONSTRAINT "RevenueClient_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "QuickLaunchOption_type_name_key";
CREATE UNIQUE INDEX "QuickLaunchOption_type_ownerId_name_key"
  ON "QuickLaunchOption"("type", "ownerId", "name");
