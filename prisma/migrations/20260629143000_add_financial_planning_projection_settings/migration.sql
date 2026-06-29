ALTER TABLE "UserSettings"
ADD COLUMN IF NOT EXISTS "financialPlanningKittensPerLitter" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "financialPlanningKittenValueCents" INTEGER;
