CREATE TABLE IF NOT EXISTS "DocumentSignatureRequest" (
  "id" SERIAL PRIMARY KEY,
  "ownerId" INTEGER NOT NULL,
  "documentId" INTEGER NOT NULL,
  "token" TEXT NOT NULL,
  "signerName" TEXT,
  "signerEmail" TEXT,
  "signerDocument" TEXT,
  "signerPhone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "otpHash" TEXT,
  "otpExpiresAt" TIMESTAMP(3),
  "otpVerifiedAt" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3),
  "signatureText" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "browser" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "documentHash" TEXT,
  "evidencePdfPath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentSignatureRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentSignatureRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CatteryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentSignatureRequest_token_key" ON "DocumentSignatureRequest"("token");
CREATE INDEX IF NOT EXISTS "DocumentSignatureRequest_ownerId_status_idx" ON "DocumentSignatureRequest"("ownerId", "status");
CREATE INDEX IF NOT EXISTS "DocumentSignatureRequest_documentId_idx" ON "DocumentSignatureRequest"("documentId");

CREATE TABLE IF NOT EXISTS "DocumentSignatureEvent" (
  "id" SERIAL PRIMARY KEY,
  "requestId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentSignatureEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DocumentSignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DocumentSignatureEvent_requestId_createdAt_idx" ON "DocumentSignatureEvent"("requestId", "createdAt");
