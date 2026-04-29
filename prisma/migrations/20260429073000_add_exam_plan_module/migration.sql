CREATE TABLE "ExamPlan" (
    "id" SERIAL NOT NULL,
    "catId" INTEGER NOT NULL,
    "pkdefSource" TEXT,
    "pkdefResult" TEXT,
    "prabfSource" TEXT,
    "prabfResult" TEXT,
    "ecoHistoryJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExamPlan_catId_key" ON "ExamPlan"("catId");

ALTER TABLE "ExamPlan"
ADD CONSTRAINT "ExamPlan_catId_fkey"
FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
