CREATE TABLE "CreditCardInvoiceSetting" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER,
  "accountName" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "closingDate" TIMESTAMP(3) NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CreditCardInvoiceSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditCardInvoiceSetting_ownerId_accountName_month_key"
  ON "CreditCardInvoiceSetting"("ownerId", "accountName", "month");

ALTER TABLE "CreditCardInvoiceSetting"
  ADD CONSTRAINT "CreditCardInvoiceSetting_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
