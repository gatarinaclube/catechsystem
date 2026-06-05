ALTER TABLE "UserSettings"
ADD COLUMN IF NOT EXISTS "vaccineReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "vaccineReminderDaysBefore" INTEGER,
ADD COLUMN IF NOT EXISTS "vaccineReminderGroupsJson" TEXT;

CREATE TABLE IF NOT EXISTS "VaccineReminderEmailLog" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "catId" INTEGER NOT NULL,
  "vaccineType" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VaccineReminderEmailLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VaccineReminderEmailLog_ownerId_catId_vaccineType_dueDate_key"
ON "VaccineReminderEmailLog"("ownerId", "catId", "vaccineType", "dueDate");

CREATE INDEX IF NOT EXISTS "VaccineReminderEmailLog_ownerId_sentAt_idx"
ON "VaccineReminderEmailLog"("ownerId", "sentAt");
