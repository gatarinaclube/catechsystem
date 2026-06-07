ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "veterinarianLogoPath" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "healthCertificateLogoPreference" TEXT;

CREATE TABLE IF NOT EXISTS "CatteryDocument" (
  "id" SERIAL PRIMARY KEY,
  "ownerId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "catId" INTEGER,
  "clientId" INTEGER,
  "documentDate" TIMESTAMP(3),
  "logoChoice" TEXT,
  "attachmentsJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatteryDocument_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CatteryDocument_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CatteryDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "RevenueClient"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CatteryDocument_ownerId_type_idx" ON "CatteryDocument"("ownerId", "type");
CREATE INDEX IF NOT EXISTS "CatteryDocument_catId_idx" ON "CatteryDocument"("catId");
CREATE INDEX IF NOT EXISTS "CatteryDocument_clientId_idx" ON "CatteryDocument"("clientId");

CREATE TABLE IF NOT EXISTS "DocumentEmailLog" (
  "id" SERIAL PRIMARY KEY,
  "ownerId" INTEGER NOT NULL,
  "documentId" INTEGER NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentEmailLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentEmailLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CatteryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DocumentEmailLog_ownerId_sentAt_idx" ON "DocumentEmailLog"("ownerId", "sentAt");
CREATE INDEX IF NOT EXISTS "DocumentEmailLog_documentId_idx" ON "DocumentEmailLog"("documentId");
