CREATE TABLE "MatingPlan" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER,
    "femaleCatId" INTEGER NOT NULL,
    "maleCatId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PARA_ACASALAR',
    "consanguinityJson" TEXT,
    "litterHistoryJson" TEXT,
    "matingStartDate" TIMESTAMP(3),
    "matingEndDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatingPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatingPlan_femaleCatId_key" ON "MatingPlan"("femaleCatId");

ALTER TABLE "MatingPlan" ADD CONSTRAINT "MatingPlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MatingPlan" ADD CONSTRAINT "MatingPlan_femaleCatId_fkey" FOREIGN KEY ("femaleCatId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MatingPlan" ADD CONSTRAINT "MatingPlan_maleCatId_fkey" FOREIGN KEY ("maleCatId") REFERENCES "Cat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
