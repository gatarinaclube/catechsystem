CREATE TABLE "WeighingPlan" (
    "id" SERIAL NOT NULL,
    "catId" INTEGER NOT NULL,
    "historyJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeighingPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeighingPlan_catId_key" ON "WeighingPlan"("catId");

ALTER TABLE "WeighingPlan"
ADD CONSTRAINT "WeighingPlan_catId_fkey"
FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
