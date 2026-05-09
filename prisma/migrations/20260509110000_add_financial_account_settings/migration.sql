CREATE TABLE "FinancialAccountSetting" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER,
  "accountName" TEXT NOT NULL,
  "initialBalanceCents" INTEGER NOT NULL DEFAULT 0,
  "capitalSocialEnabled" BOOLEAN NOT NULL DEFAULT false,
  "capitalSocialCents" INTEGER NOT NULL DEFAULT 0,
  "capitalEntriesJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinancialAccountSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialAccountSetting_ownerId_accountName_key"
ON "FinancialAccountSetting"("ownerId", "accountName");

ALTER TABLE "FinancialAccountSetting"
ADD CONSTRAINT "FinancialAccountSetting_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "RevenueEntry"
SET "paymentAccount" = ''
WHERE COALESCE("paymentAccount", '') <> '';
