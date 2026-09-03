CREATE TABLE "CatTitleRecord" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER,
  "catId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "date" TIMESTAMP(3),
  "club" TEXT,
  "judge" TEXT,
  "year" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CatTitleRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CatTitleRecord_ownerId_idx" ON "CatTitleRecord"("ownerId");
CREATE INDEX "CatTitleRecord_catId_idx" ON "CatTitleRecord"("catId");
CREATE INDEX "CatTitleRecord_kind_code_idx" ON "CatTitleRecord"("kind", "code");

ALTER TABLE "CatTitleRecord"
ADD CONSTRAINT "CatTitleRecord_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatTitleRecord"
ADD CONSTRAINT "CatTitleRecord_catId_fkey"
FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
