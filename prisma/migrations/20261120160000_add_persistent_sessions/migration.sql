CREATE TABLE "WebSession" (
  "sid" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebSession_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX "WebSession_expiresAt_idx" ON "WebSession"("expiresAt");
