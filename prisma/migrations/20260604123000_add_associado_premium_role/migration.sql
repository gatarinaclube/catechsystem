ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ASSOCIADO_PREMIUM';

INSERT INTO "RolePlanLimit" (
  "role",
  "uploadLimitKb",
  "breeders",
  "showcaseLitters",
  "littersPerYear",
  "kittensPerYear",
  "updatedAt"
)
VALUES
  ('ASSOCIADO_PREMIUM', 2048, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("role") DO NOTHING;
