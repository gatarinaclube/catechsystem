ALTER TABLE "FinancialAccountSetting"
  ADD COLUMN "isCreditCard" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "creditCardClosingDay" INTEGER,
  ADD COLUMN "creditCardDueDay" INTEGER;
