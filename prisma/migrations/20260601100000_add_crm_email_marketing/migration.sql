CREATE TABLE "CrmEmailContact" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CrmEmailContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmEmailCampaign" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "bodyText" TEXT NOT NULL,
  "imagePath" TEXT,
  "recipients" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CrmEmailCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmEmailContact_ownerId_email_key" ON "CrmEmailContact"("ownerId", "email");

ALTER TABLE "CrmEmailContact"
ADD CONSTRAINT "CrmEmailContact_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmEmailCampaign"
ADD CONSTRAINT "CrmEmailCampaign_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
