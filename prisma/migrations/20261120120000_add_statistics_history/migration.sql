CREATE TABLE "StatisticsHistory" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "litterCount" INTEGER NOT NULL,
  "kittenCount" INTEGER NOT NULL,
  "revenueCents" INTEGER NOT NULL,
  "expenseCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StatisticsHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StatisticsHistory_nonnegative" CHECK (
    "litterCount" >= 0 AND "kittenCount" >= 0 AND "revenueCents" >= 0 AND "expenseCents" >= 0
  )
);
CREATE UNIQUE INDEX "StatisticsHistory_ownerId_year_key" ON "StatisticsHistory"("ownerId", "year");
ALTER TABLE "StatisticsHistory" ADD CONSTRAINT "StatisticsHistory_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
