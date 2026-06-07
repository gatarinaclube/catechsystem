ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "veterinarianClinicName" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "veterinarianTradeName" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "veterinarianCnpj" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "veterinarianCity" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "veterinarianCep" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "veterinarianState" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "veterinarianMobile" TEXT;
