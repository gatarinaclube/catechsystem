CREATE TABLE "FinancialPlanningRow" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER,
  "planningKey" TEXT NOT NULL DEFAULT 'default',
  "section" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT 'white',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "valuesJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinancialPlanningRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialPlanningRow_ownerId_planningKey_idx"
ON "FinancialPlanningRow"("ownerId", "planningKey");

ALTER TABLE "FinancialPlanningRow"
ADD CONSTRAINT "FinancialPlanningRow_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
