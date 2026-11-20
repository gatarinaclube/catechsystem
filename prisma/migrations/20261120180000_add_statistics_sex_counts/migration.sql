ALTER TABLE "StatisticsHistory"
  ADD COLUMN "maleCount" INTEGER,
  ADD COLUMN "femaleCount" INTEGER,
  ADD CONSTRAINT "StatisticsHistory_sex_total" CHECK (
    ("maleCount" IS NULL AND "femaleCount" IS NULL) OR
    ("maleCount" IS NOT NULL AND "femaleCount" IS NOT NULL AND
     "maleCount" >= 0 AND "femaleCount" >= 0 AND
     "maleCount"::BIGINT + "femaleCount"::BIGINT = "kittenCount")
  );
