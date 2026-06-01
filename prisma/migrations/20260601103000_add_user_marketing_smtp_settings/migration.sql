ALTER TABLE "UserSettings"
ADD COLUMN "marketingFromName" TEXT,
ADD COLUMN "marketingFromEmail" TEXT,
ADD COLUMN "marketingSmtpHost" TEXT,
ADD COLUMN "marketingSmtpPort" INTEGER,
ADD COLUMN "marketingSmtpSecure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "marketingSmtpUser" TEXT,
ADD COLUMN "marketingSmtpPassEncrypted" TEXT;
