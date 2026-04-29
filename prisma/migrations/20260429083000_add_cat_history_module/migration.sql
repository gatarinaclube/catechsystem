CREATE TABLE "CatHistoryEntry" (
    "id" SERIAL NOT NULL,
    "catId" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "payloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatHistoryEntry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CatHistoryEntry"
ADD CONSTRAINT "CatHistoryEntry_catId_fkey"
FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
