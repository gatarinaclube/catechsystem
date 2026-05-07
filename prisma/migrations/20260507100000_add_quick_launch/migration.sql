CREATE TABLE "QuickLaunchEntry" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER,
    "amountCents" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "receiptPath" TEXT NOT NULL,
    "note" TEXT,
    "competenceDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuickLaunchEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuickLaunchOption" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuickLaunchOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuickLaunchOption_type_name_key" ON "QuickLaunchOption"("type", "name");

ALTER TABLE "QuickLaunchEntry" ADD CONSTRAINT "QuickLaunchEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
