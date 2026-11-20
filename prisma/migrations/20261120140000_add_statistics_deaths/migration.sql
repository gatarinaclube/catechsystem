ALTER TABLE "StatisticsHistory"
  ADD COLUMN "maleDeathCount" INTEGER,
  ADD COLUMN "femaleDeathCount" INTEGER,
  ADD CONSTRAINT "StatisticsHistory_deaths_nonnegative" CHECK (
    ("maleDeathCount" IS NULL OR "maleDeathCount" >= 0) AND
    ("femaleDeathCount" IS NULL OR "femaleDeathCount" >= 0)
  );
