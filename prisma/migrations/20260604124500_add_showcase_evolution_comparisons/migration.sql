ALTER TABLE "CatteryKittenShowcase"
ADD COLUMN IF NOT EXISTS "evolutionText" TEXT;

CREATE TABLE IF NOT EXISTS "CatteryShowcaseEvolutionComparison" (
  "id" SERIAL NOT NULL,
  "showcaseId" INTEGER NOT NULL,
  "caption" TEXT,
  "reservePhoto" TEXT NOT NULL,
  "deliveryPhoto" TEXT NOT NULL,
  "oneYearPhoto" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatteryShowcaseEvolutionComparison_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CatteryShowcaseEvolutionComparison_showcaseId_fkey'
  ) THEN
    ALTER TABLE "CatteryShowcaseEvolutionComparison"
    ADD CONSTRAINT "CatteryShowcaseEvolutionComparison_showcaseId_fkey"
    FOREIGN KEY ("showcaseId") REFERENCES "CatteryKittenShowcase"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "RolePlanLimit"
ADD COLUMN IF NOT EXISTS "showcaseEvolutionComparisons" INTEGER;

UPDATE "RolePlanLimit"
SET "showcaseEvolutionComparisons" = CASE
  WHEN "role" IN ('PREMIUM', 'ASSOCIADO_PREMIUM') THEN NULL
  WHEN "role" IN ('MASTER', 'ASSOCIADO_A') THEN 3
  WHEN "role" IN ('BASIC', 'ASSOCIADO_B') THEN 1
  ELSE "showcaseEvolutionComparisons"
END
WHERE "role" IN ('PREMIUM', 'ASSOCIADO_PREMIUM', 'MASTER', 'ASSOCIADO_A', 'BASIC', 'ASSOCIADO_B');
