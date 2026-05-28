CREATE TABLE "CatteryKittenShowcase" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT,
  "intro" TEXT,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CatteryKittenShowcase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatteryShowcaseLitter" (
  "id" SERIAL NOT NULL,
  "showcaseId" INTEGER NOT NULL,
  "birthDate" TIMESTAMP(3) NOT NULL,
  "deliveryForecast" TIMESTAMP(3) NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT true,
  "fatherName" TEXT NOT NULL,
  "fatherPhoto" TEXT,
  "fatherColor" TEXT,
  "fatherPkdef" TEXT,
  "fatherPra" TEXT,
  "fatherHcm" TEXT,
  "motherName" TEXT NOT NULL,
  "motherPhoto" TEXT,
  "motherColor" TEXT,
  "motherPkdef" TEXT,
  "motherPra" TEXT,
  "motherHcm" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CatteryShowcaseLitter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatteryShowcaseKitten" (
  "id" SERIAL NOT NULL,
  "litterId" INTEGER NOT NULL,
  "name" TEXT,
  "color" TEXT,
  "sex" TEXT NOT NULL,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CatteryShowcaseKitten_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatteryShowcasePhoto" (
  "id" SERIAL NOT NULL,
  "kittenId" INTEGER NOT NULL,
  "path" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CatteryShowcasePhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatteryKittenShowcase_ownerId_key" ON "CatteryKittenShowcase"("ownerId");
CREATE UNIQUE INDEX "CatteryKittenShowcase_slug_key" ON "CatteryKittenShowcase"("slug");

CREATE INDEX "CatteryShowcaseLitter_showcaseId_birthDate_idx"
  ON "CatteryShowcaseLitter"("showcaseId", "birthDate");

CREATE INDEX "CatteryShowcaseKitten_litterId_sex_sortOrder_idx"
  ON "CatteryShowcaseKitten"("litterId", "sex", "sortOrder");

CREATE INDEX "CatteryShowcasePhoto_kittenId_sortOrder_idx"
  ON "CatteryShowcasePhoto"("kittenId", "sortOrder");

ALTER TABLE "CatteryKittenShowcase"
  ADD CONSTRAINT "CatteryKittenShowcase_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatteryShowcaseLitter"
  ADD CONSTRAINT "CatteryShowcaseLitter_showcaseId_fkey"
  FOREIGN KEY ("showcaseId") REFERENCES "CatteryKittenShowcase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatteryShowcaseKitten"
  ADD CONSTRAINT "CatteryShowcaseKitten_litterId_fkey"
  FOREIGN KEY ("litterId") REFERENCES "CatteryShowcaseLitter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatteryShowcasePhoto"
  ADD CONSTRAINT "CatteryShowcasePhoto_kittenId_fkey"
  FOREIGN KEY ("kittenId") REFERENCES "CatteryShowcaseKitten"("id") ON DELETE CASCADE ON UPDATE CASCADE;
