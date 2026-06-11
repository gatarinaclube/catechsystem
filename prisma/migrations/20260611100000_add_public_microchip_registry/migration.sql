CREATE TABLE "PublicMicrochipRegistration" (
    "id" SERIAL NOT NULL,
    "microchip" TEXT NOT NULL,
    "animalName" TEXT NOT NULL,
    "sex" TEXT,
    "species" TEXT NOT NULL,
    "breed" TEXT,
    "customBreed" TEXT,
    "birthDate" TIMESTAMP(3),
    "color" TEXT,
    "size" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ownerName" TEXT NOT NULL,
    "ownerCpf" TEXT,
    "ownerBirthDate" TIMESTAMP(3),
    "ownerStreet" TEXT,
    "ownerNumber" TEXT,
    "ownerNeighborhood" TEXT,
    "ownerCity" TEXT,
    "ownerState" TEXT,
    "ownerCep" TEXT,
    "ownerEmail" TEXT NOT NULL,
    "ownerEmailOptional" TEXT,
    "passwordHash" TEXT NOT NULL,
    "phonesJson" TEXT,
    "photosJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicMicrochipRegistration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicMicrochipContact" (
    "id" SERIAL NOT NULL,
    "registrationId" INTEGER,
    "microchip" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicMicrochipContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicMicrochipRegistration_microchip_key" ON "PublicMicrochipRegistration"("microchip");
CREATE INDEX "PublicMicrochipRegistration_ownerEmail_idx" ON "PublicMicrochipRegistration"("ownerEmail");
CREATE INDEX "PublicMicrochipRegistration_ownerName_idx" ON "PublicMicrochipRegistration"("ownerName");
CREATE INDEX "PublicMicrochipRegistration_status_idx" ON "PublicMicrochipRegistration"("status");
CREATE INDEX "PublicMicrochipContact_microchip_idx" ON "PublicMicrochipContact"("microchip");
CREATE INDEX "PublicMicrochipContact_registrationId_idx" ON "PublicMicrochipContact"("registrationId");

ALTER TABLE "PublicMicrochipContact" ADD CONSTRAINT "PublicMicrochipContact_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "PublicMicrochipRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
