CREATE TABLE "TreatmentMedication" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TreatmentMedication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TreatmentMedication_ownerId_name_key"
  ON "TreatmentMedication"("ownerId", "name");

ALTER TABLE "TreatmentMedication"
  ADD CONSTRAINT "TreatmentMedication_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CatTreatment" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER,
  "catId" INTEGER NOT NULL,
  "medicationId" INTEGER,
  "medicationName" TEXT NOT NULL,
  "dosage" TEXT,
  "duration" TEXT,
  "administrationTime" TEXT,
  "administrationRoute" TEXT,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CatTreatment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CatTreatment"
  ADD CONSTRAINT "CatTreatment_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CatTreatment"
  ADD CONSTRAINT "CatTreatment_catId_fkey"
  FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatTreatment"
  ADD CONSTRAINT "CatTreatment_medicationId_fkey"
  FOREIGN KEY ("medicationId") REFERENCES "TreatmentMedication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
