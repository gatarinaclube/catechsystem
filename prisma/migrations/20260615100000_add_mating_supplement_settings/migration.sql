ALTER TABLE "UserSettings"
ADD COLUMN IF NOT EXISTS "matingSupplementEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "matingSupplementDaysBefore" INTEGER,
ADD COLUMN IF NOT EXISTS "matingSupplementDaysAfter" INTEGER;
