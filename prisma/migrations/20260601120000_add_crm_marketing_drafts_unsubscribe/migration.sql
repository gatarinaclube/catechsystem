ALTER TABLE "CrmEmailContact"
ADD COLUMN "unsubscribeToken" TEXT;

CREATE UNIQUE INDEX "CrmEmailContact_unsubscribeToken_key" ON "CrmEmailContact"("unsubscribeToken");

CREATE TABLE "CrmEmailDraft" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "bodyText" TEXT NOT NULL,
  "ctaJson" TEXT,
  "styleJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CrmEmailDraft_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CrmEmailDraft"
ADD CONSTRAINT "CrmEmailDraft_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
