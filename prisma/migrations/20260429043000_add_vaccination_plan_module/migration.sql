CREATE TABLE "VaccinationPlan" (
    "id" SERIAL NOT NULL,
    "catId" INTEGER NOT NULL,
    "antirabicHistoryJson" TEXT,
    "felineHistoryJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaccinationPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VaccinationPlan_catId_key" ON "VaccinationPlan"("catId");

ALTER TABLE "VaccinationPlan"
ADD CONSTRAINT "VaccinationPlan_catId_fkey"
FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
