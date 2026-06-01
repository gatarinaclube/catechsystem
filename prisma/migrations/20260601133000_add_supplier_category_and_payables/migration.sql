ALTER TABLE "ExpenseSupplier"
  ADD COLUMN "defaultCategory" TEXT;

CREATE TABLE "AccountPayable" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER,
  "supplier" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "amountCents" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "paymentMethod" TEXT,
  "note" TEXT,
  "isFixed" BOOLEAN NOT NULL DEFAULT false,
  "recurringGroupId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "expenseEntryId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountPayable_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountPayable_ownerId_status_dueDate_idx"
  ON "AccountPayable"("ownerId", "status", "dueDate");

CREATE INDEX "AccountPayable_ownerId_recurringGroupId_idx"
  ON "AccountPayable"("ownerId", "recurringGroupId");

ALTER TABLE "AccountPayable"
  ADD CONSTRAINT "AccountPayable_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
