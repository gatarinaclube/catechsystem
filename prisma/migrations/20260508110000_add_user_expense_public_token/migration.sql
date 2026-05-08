ALTER TABLE "User"
ADD COLUMN "expensePublicToken" TEXT;

CREATE UNIQUE INDEX "User_expensePublicToken_key" ON "User"("expensePublicToken");
