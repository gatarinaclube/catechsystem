ALTER TABLE "DocumentSignatureRequest" ADD COLUMN IF NOT EXISTS "signatureSource" TEXT;
ALTER TABLE "DocumentSignatureRequest" ADD COLUMN IF NOT EXISTS "signaturePage" INTEGER;
ALTER TABLE "DocumentSignatureRequest" ADD COLUMN IF NOT EXISTS "signatureX" DOUBLE PRECISION;
ALTER TABLE "DocumentSignatureRequest" ADD COLUMN IF NOT EXISTS "signatureY" DOUBLE PRECISION;
