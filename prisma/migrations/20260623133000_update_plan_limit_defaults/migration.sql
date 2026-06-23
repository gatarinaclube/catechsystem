UPDATE "RolePlanLimit"
SET
  "littersPerYear" = 4,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" IN ('BASIC', 'ASSOCIADO_B')
  AND "littersPerYear" = 2;

UPDATE "RolePlanLimit"
SET
  "littersPerYear" = 15,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" IN ('MASTER', 'ASSOCIADO_A')
  AND "littersPerYear" = 10;
