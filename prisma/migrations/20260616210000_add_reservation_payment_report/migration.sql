CREATE TABLE "ReservationPaymentLitter" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER,
  "litterId" INTEGER NOT NULL,
  "registrationStatus" TEXT NOT NULL DEFAULT 'Solicitar',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReservationPaymentLitter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReservationPaymentKitten" (
  "id" SERIAL NOT NULL,
  "summaryId" INTEGER NOT NULL,
  "litterKittenId" INTEGER NOT NULL,
  "deliveryDate" TIMESTAMP(3),
  "deliveryLocation" TEXT,
  "airReservation" TEXT NOT NULL DEFAULT 'Não',
  "groupStatus" TEXT NOT NULL DEFAULT 'Não',
  "manualStatus" TEXT NOT NULL DEFAULT 'Não Enviado',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReservationPaymentKitten_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReservationPaymentLitter_ownerId_litterId_key"
ON "ReservationPaymentLitter"("ownerId", "litterId");

CREATE INDEX "ReservationPaymentLitter_ownerId_idx"
ON "ReservationPaymentLitter"("ownerId");

CREATE UNIQUE INDEX "ReservationPaymentKitten_summaryId_litterKittenId_key"
ON "ReservationPaymentKitten"("summaryId", "litterKittenId");

CREATE INDEX "ReservationPaymentKitten_litterKittenId_idx"
ON "ReservationPaymentKitten"("litterKittenId");

ALTER TABLE "ReservationPaymentLitter"
ADD CONSTRAINT "ReservationPaymentLitter_litterId_fkey"
FOREIGN KEY ("litterId") REFERENCES "Litter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReservationPaymentKitten"
ADD CONSTRAINT "ReservationPaymentKitten_summaryId_fkey"
FOREIGN KEY ("summaryId") REFERENCES "ReservationPaymentLitter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReservationPaymentKitten"
ADD CONSTRAINT "ReservationPaymentKitten_litterKittenId_fkey"
FOREIGN KEY ("litterKittenId") REFERENCES "LitterKitten"("id") ON DELETE CASCADE ON UPDATE CASCADE;
