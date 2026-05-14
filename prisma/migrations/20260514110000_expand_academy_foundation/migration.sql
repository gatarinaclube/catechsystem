CREATE TABLE "academy_authors" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "bio" TEXT,
  "photoUrl" TEXT,
  "specialty" TEXT,
  "breedFocus" TEXT,
  "socialLinksJson" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_authors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_media" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER,
  "authorId" INTEGER,
  "lessonId" INTEGER,
  "type" TEXT NOT NULL,
  "title" TEXT,
  "url" TEXT NOT NULL,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "altText" TEXT,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_media_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_subscriptions" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "planId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "provider" TEXT,
  "providerSubscriptionId" TEXT,
  "startedAt" TIMESTAMP(3),
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_certificates" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "lessonId" INTEGER,
  "title" TEXT NOT NULL,
  "certificateNumber" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "pdfUrl" TEXT,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academy_certificates_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "academy_plans"
ADD COLUMN "featuresJson" TEXT;

ALTER TABLE "academy_lessons"
ADD COLUMN "authorId" INTEGER,
ADD COLUMN "contentJson" TEXT,
ADD COLUMN "estimatedReadingMinutes" INTEGER,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "metaTitle" TEXT,
ADD COLUMN "metaDescription" TEXT,
ADD COLUMN "ogImageUrl" TEXT,
ADD COLUMN "relatedLessonIdsJson" TEXT;

UPDATE "academy_lessons"
SET "status" = CASE WHEN "published" = true THEN 'PUBLISHED' ELSE 'DRAFT' END;

CREATE UNIQUE INDEX "academy_authors_userId_key" ON "academy_authors"("userId");
CREATE UNIQUE INDEX "academy_authors_slug_key" ON "academy_authors"("slug");
CREATE UNIQUE INDEX "academy_subscriptions_providerSubscriptionId_key" ON "academy_subscriptions"("providerSubscriptionId");
CREATE UNIQUE INDEX "academy_certificates_certificateNumber_key" ON "academy_certificates"("certificateNumber");

ALTER TABLE "academy_authors"
ADD CONSTRAINT "academy_authors_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "academy_media"
ADD CONSTRAINT "academy_media_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "academy_media"
ADD CONSTRAINT "academy_media_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "academy_authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "academy_media"
ADD CONSTRAINT "academy_media_lessonId_fkey"
FOREIGN KEY ("lessonId") REFERENCES "academy_lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "academy_subscriptions"
ADD CONSTRAINT "academy_subscriptions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "academy_subscriptions"
ADD CONSTRAINT "academy_subscriptions_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "academy_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "academy_certificates"
ADD CONSTRAINT "academy_certificates_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "academy_certificates"
ADD CONSTRAINT "academy_certificates_lessonId_fkey"
FOREIGN KEY ("lessonId") REFERENCES "academy_lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "academy_lessons"
ADD CONSTRAINT "academy_lessons_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "academy_authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
