CREATE TABLE "academy_plans" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "priceCents" INTEGER NOT NULL DEFAULT 0,
  "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "checkoutProvider" TEXT,
  "checkoutMetadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "academy_enrollments" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL UNIQUE,
  "level" TEXT NOT NULL DEFAULT 'STUDENT',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "planId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academy_enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "academy_enrollments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "academy_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "academy_categories" (
  "id" SERIAL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "academy_modules" (
  "id" SERIAL PRIMARY KEY,
  "categoryId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "level" TEXT NOT NULL DEFAULT 'STUDENT',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academy_modules_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "academy_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "academy_lessons" (
  "id" SERIAL PRIMARY KEY,
  "moduleId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "summary" TEXT,
  "richText" TEXT,
  "imageUrl" TEXT,
  "videoEmbed" TEXT,
  "filesJson" TEXT,
  "durationMinutes" INTEGER,
  "level" TEXT NOT NULL DEFAULT 'STUDENT',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academy_lessons_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "academy_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "academy_progress" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "lessonId" INTEGER NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academy_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "academy_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "academy_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "academy_favorites" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "lessonId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academy_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "academy_favorites_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "academy_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "academy_progress_userId_lessonId_key" ON "academy_progress"("userId", "lessonId");
CREATE UNIQUE INDEX "academy_favorites_userId_lessonId_key" ON "academy_favorites"("userId", "lessonId");
