ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ASSOCIADO_A';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ASSOCIADO_B';

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
  ('ASSOCIADO_A', 1024, 10, 3, 10, 40, CURRENT_TIMESTAMP),
  ('ASSOCIADO_B', 500, 3, 1, 2, 10, CURRENT_TIMESTAMP)
ON CONFLICT ("role") DO NOTHING;
