CREATE TABLE "ExpenseSupplier" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER,
  "commercialName" TEXT NOT NULL,
  "tradeName" TEXT,
  "cnpj" TEXT,
  "cep" TEXT,
  "street" TEXT,
  "number" TEXT,
  "complement" TEXT,
  "neighborhood" TEXT,
  "city" TEXT,
  "state" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "contactName" TEXT,
  "contactPhone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpenseSupplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpenseSupplier_ownerId_commercialName_key"
  ON "ExpenseSupplier"("ownerId", "commercialName");

CREATE INDEX "ExpenseSupplier_ownerId_cnpj_idx"
  ON "ExpenseSupplier"("ownerId", "cnpj");

ALTER TABLE "ExpenseSupplier"
  ADD CONSTRAINT "ExpenseSupplier_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
