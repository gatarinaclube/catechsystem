UPDATE "Cat"
SET "status" = 'APROVADO'::"CatStatus"
WHERE "status" IN ('NOVO'::"CatStatus", 'NAO_APROVADO'::"CatStatus");

ALTER TABLE "Cat" ALTER COLUMN "status" SET DEFAULT 'APROVADO'::"CatStatus";
