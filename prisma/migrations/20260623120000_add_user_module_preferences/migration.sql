ALTER TABLE "UserSettings"
ADD COLUMN IF NOT EXISTS "modulePreferencesJson" TEXT;
