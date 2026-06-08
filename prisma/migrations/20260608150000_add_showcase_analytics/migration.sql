CREATE TABLE IF NOT EXISTS "CatteryShowcaseAnalyticsSession" (
  "id" SERIAL PRIMARY KEY,
  "showcaseId" INTEGER NOT NULL,
  "visitorId" TEXT NOT NULL,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "browserLabel" TEXT,
  "referrer" TEXT,
  "language" TEXT,
  "timezone" TEXT,
  "screen" TEXT,
  "city" TEXT,
  "region" TEXT,
  "country" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "durationSeconds" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatteryShowcaseAnalyticsSession_showcaseId_fkey"
    FOREIGN KEY ("showcaseId") REFERENCES "CatteryKittenShowcase"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CatteryShowcaseAnalyticsEvent" (
  "id" SERIAL PRIMARY KEY,
  "sessionId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "label" TEXT,
  "details" TEXT,
  "path" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatteryShowcaseAnalyticsEvent_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "CatteryShowcaseAnalyticsSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CatteryShowcaseAnalyticsSession_showcaseId_lastSeenAt_idx"
  ON "CatteryShowcaseAnalyticsSession"("showcaseId", "lastSeenAt");

CREATE INDEX IF NOT EXISTS "CatteryShowcaseAnalyticsSession_showcaseId_startedAt_idx"
  ON "CatteryShowcaseAnalyticsSession"("showcaseId", "startedAt");

CREATE INDEX IF NOT EXISTS "CatteryShowcaseAnalyticsEvent_sessionId_createdAt_idx"
  ON "CatteryShowcaseAnalyticsEvent"("sessionId", "createdAt");

CREATE INDEX IF NOT EXISTS "CatteryShowcaseAnalyticsEvent_type_createdAt_idx"
  ON "CatteryShowcaseAnalyticsEvent"("type", "createdAt");
