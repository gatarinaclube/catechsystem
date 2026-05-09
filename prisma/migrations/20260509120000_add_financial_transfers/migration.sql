CREATE TABLE "FinancialTransfer" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER,
  "fromAccount" TEXT NOT NULL,
  "toAccount" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "transferDate" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "historyJson" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinancialTransfer_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FinancialTransfer"
ADD CONSTRAINT "FinancialTransfer_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

DELETE FROM "QuickLaunchOption"
WHERE "type" = 'PAYMENT'
  AND "name" IN ('Boleto', 'Débito em Conta', 'Wise');

DELETE FROM "FinancialAccountSetting"
WHERE "accountName" IN ('Boleto', 'Débito em Conta', 'Wise');
