ALTER TABLE "WeighingPlan"
  ADD COLUMN "shouldWeigh" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "weighingFrequency" TEXT,
  ADD COLUMN "weighingPeriod" TEXT;
