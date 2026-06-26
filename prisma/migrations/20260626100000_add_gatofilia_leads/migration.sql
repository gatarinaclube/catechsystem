CREATE TABLE "GatofiliaLead" (
    "id" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT NOT NULL,
    "whatsapp" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "hasCattery" TEXT,
    "catteryName" TEXT,
    "breed" TEXT,
    "breedingTime" TEXT,
    "wantsStart" TEXT,
    "referralSource" TEXT,
    "message" TEXT,
    "wantsUpdates" BOOLEAN NOT NULL DEFAULT false,
    "whatsappPayload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatofiliaLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GatofiliaLead_email_idx" ON "GatofiliaLead"("email");
CREATE INDEX "GatofiliaLead_createdAt_idx" ON "GatofiliaLead"("createdAt");
