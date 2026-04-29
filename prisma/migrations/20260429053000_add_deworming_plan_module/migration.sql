CREATE TABLE "DewormingPlan" (
    "id" SERIAL NOT NULL,
    "catId" INTEGER NOT NULL,
    "historyJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DewormingPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DewormingPlan_catId_key" ON "DewormingPlan"("catId");

ALTER TABLE "DewormingPlan"
ADD CONSTRAINT "DewormingPlan_catId_fkey"
FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
