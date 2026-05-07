ALTER TABLE "QuickLaunchEntry"
ADD COLUMN "paymentMode" TEXT,
ADD COLUMN "installments" INTEGER;

CREATE TABLE "RevenueClient" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "document" TEXT,
    "cep" TEXT,
    "street" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueClient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RevenueEntry" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER,
    "clientId" INTEGER,
    "kittenId" INTEGER,
    "kittenLabel" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "catAmountCents" INTEGER NOT NULL DEFAULT 0,
    "transportAmountCents" INTEGER NOT NULL DEFAULT 0,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "paymentAccount" TEXT NOT NULL,
    "parcelDataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueEntry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RevenueEntry" ADD CONSTRAINT "RevenueEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "RevenueEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "RevenueClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "RevenueEntry_kittenId_fkey" FOREIGN KEY ("kittenId") REFERENCES "Cat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
