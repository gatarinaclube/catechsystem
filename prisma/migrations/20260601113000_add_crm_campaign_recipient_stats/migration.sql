ALTER TABLE "CrmEmailCampaign"
ADD COLUMN "deliveredCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "failedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "openedCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CrmEmailCampaignRecipient" (
  "id" SERIAL NOT NULL,
  "campaignId" INTEGER NOT NULL,
  "email" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "error" TEXT,
  "openedAt" TIMESTAMP(3),
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CrmEmailCampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmEmailCampaignRecipient_token_key" ON "CrmEmailCampaignRecipient"("token");

ALTER TABLE "CrmEmailCampaignRecipient"
ADD CONSTRAINT "CrmEmailCampaignRecipient_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "CrmEmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
