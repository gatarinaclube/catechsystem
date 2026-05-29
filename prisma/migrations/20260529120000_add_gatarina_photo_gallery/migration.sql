CREATE TABLE "GatarinaPhotoGalleryConfig" (
  "id" SERIAL PRIMARY KEY,
  "eventKey" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Gatarina Show 2026',
  "priceCents" INTEGER NOT NULL DEFAULT 3000,
  "published" BOOLEAN NOT NULL DEFAULT true,
  "contactEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "GatarinaPhotoGalleryConfig_eventKey_key"
  ON "GatarinaPhotoGalleryConfig" ("eventKey");

CREATE TABLE "GatarinaPhoto" (
  "id" SERIAL PRIMARY KEY,
  "eventKey" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "originalName" TEXT,
  "sizeBytes" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "GatarinaPhoto_eventKey_code_key"
  ON "GatarinaPhoto" ("eventKey", "code");

CREATE INDEX "GatarinaPhoto_eventKey_active_sortOrder_idx"
  ON "GatarinaPhoto" ("eventKey", "active", "sortOrder");

CREATE TABLE "GatarinaPhotoRequest" (
  "id" SERIAL PRIMARY KEY,
  "eventKey" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "customerPhone" TEXT,
  "note" TEXT,
  "selectedPhotosJson" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPriceCents" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "GatarinaPhotoRequest_eventKey_createdAt_idx"
  ON "GatarinaPhotoRequest" ("eventKey", "createdAt");

INSERT INTO "GatarinaPhotoGalleryConfig" ("eventKey", "title", "priceCents", "published")
VALUES ('gatarina-show-2026', 'Gatarina Show 2026', 3000, true)
ON CONFLICT ("eventKey") DO NOTHING;
