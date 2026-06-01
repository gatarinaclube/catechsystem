ALTER TABLE "UserSettings"
ADD COLUMN "marketingFontFamily" TEXT,
ADD COLUMN "marketingBackgroundColor" TEXT,
ADD COLUMN "marketingCardColor" TEXT,
ADD COLUMN "marketingTextColor" TEXT,
ADD COLUMN "marketingAccentColor" TEXT,
ADD COLUMN "marketingWebsiteUrl" TEXT,
ADD COLUMN "marketingInstagramUrl" TEXT,
ADD COLUMN "marketingWhatsappUrl" TEXT,
ADD COLUMN "marketingFooterText" TEXT;

ALTER TABLE "CrmEmailCampaign"
ADD COLUMN "attachmentPathsJson" TEXT,
ADD COLUMN "ctaJson" TEXT,
ADD COLUMN "styleJson" TEXT;
