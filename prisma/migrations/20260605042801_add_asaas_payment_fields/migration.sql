ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "asaasCustomerId" TEXT,
ADD COLUMN IF NOT EXISTS "asaasSubscriptionId" TEXT,
ADD COLUMN IF NOT EXISTS "asaasPaymentId" TEXT,
ADD COLUMN IF NOT EXISTS "asaasPaymentUrl" TEXT,
ADD COLUMN IF NOT EXISTS "asaasLastEvent" TEXT;

CREATE INDEX IF NOT EXISTS "User_asaasCustomerId_idx" ON "User"("asaasCustomerId");
CREATE INDEX IF NOT EXISTS "User_asaasSubscriptionId_idx" ON "User"("asaasSubscriptionId");
CREATE INDEX IF NOT EXISTS "User_asaasPaymentId_idx" ON "User"("asaasPaymentId");
