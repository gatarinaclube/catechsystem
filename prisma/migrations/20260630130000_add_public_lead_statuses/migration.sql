ALTER TABLE "GatofiliaLead"
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'NEW',
ADD COLUMN IF NOT EXISTS "respondedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "GatofiliaLead_status_idx" ON "GatofiliaLead"("status");

CREATE TABLE IF NOT EXISTS "PetgusPublicLead" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PetgusPublicLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PetgusPublicLead_email_idx" ON "PetgusPublicLead"("email");
CREATE INDEX IF NOT EXISTS "PetgusPublicLead_status_idx" ON "PetgusPublicLead"("status");
CREATE INDEX IF NOT EXISTS "PetgusPublicLead_createdAt_idx" ON "PetgusPublicLead"("createdAt");
