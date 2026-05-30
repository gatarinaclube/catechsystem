CREATE TABLE "RolePlanLimit" (
  "id" SERIAL NOT NULL,
  "role" TEXT NOT NULL,
  "uploadLimitKb" INTEGER,
  "breeders" INTEGER,
  "showcaseLitters" INTEGER,
  "littersPerYear" INTEGER,
  "kittensPerYear" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RolePlanLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RolePlanLimit_role_key" ON "RolePlanLimit"("role");

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
  ('PREMIUM', 2048, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP),
  ('MASTER', 1024, 10, 3, 10, 40, CURRENT_TIMESTAMP),
  ('BASIC', 500, 3, 1, 2, 10, CURRENT_TIMESTAMP)
ON CONFLICT ("role") DO NOTHING;
