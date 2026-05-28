ALTER TABLE "CatteryKittenShowcase"
ADD COLUMN "whatsappUrl" TEXT,
ADD COLUMN "paymentPix" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paymentCardCash" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paymentCardInstallments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paymentInstallments" INTEGER;
