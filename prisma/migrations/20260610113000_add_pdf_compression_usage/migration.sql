CREATE TABLE IF NOT EXISTS "PdfCompressionUsage" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "monthKey" TEXT NOT NULL,
  "originalBytes" INTEGER NOT NULL,
  "outputBytes" INTEGER NOT NULL,
  "targetKb" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PdfCompressionUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PdfCompressionUsage_userId_monthKey_idx"
ON "PdfCompressionUsage"("userId", "monthKey");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PdfCompressionUsage_userId_fkey'
  ) THEN
    ALTER TABLE "PdfCompressionUsage"
    ADD CONSTRAINT "PdfCompressionUsage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
