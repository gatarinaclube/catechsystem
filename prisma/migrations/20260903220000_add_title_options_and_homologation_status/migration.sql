ALTER TABLE "CatTitleRecord"
ADD COLUMN "homologationStatus" TEXT;

CREATE TABLE "CatTitleOption" (
  "id" SERIAL NOT NULL,
  "ownerId" INTEGER,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CatTitleOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatTitleOption_ownerId_type_name_key"
ON "CatTitleOption"("ownerId", "type", "name");

CREATE INDEX "CatTitleOption_ownerId_type_idx"
ON "CatTitleOption"("ownerId", "type");

ALTER TABLE "CatTitleOption"
ADD CONSTRAINT "CatTitleOption_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "CatTitleOption" ("ownerId", "type", "name", "updatedAt")
SELECT users.id, 'CLUB', club.name, CURRENT_TIMESTAMP
FROM "User" AS users
CROSS JOIN (
  VALUES
    ('Gatarina'),
    ('Sampa Gato'),
    ('CBG'),
    ('Amacoon'),
    ('Gato Grupo'),
    ('Rio Cat Clube'),
    ('Rio Minas')
) AS club(name)
ON CONFLICT ("ownerId", "type", "name") DO NOTHING;

INSERT INTO "CatTitleOption" ("ownerId", "type", "name", "updatedAt")
SELECT DISTINCT "ownerId", 'CLUB', btrim("club"), CURRENT_TIMESTAMP
FROM "CatTitleRecord"
WHERE "ownerId" IS NOT NULL
  AND "club" IS NOT NULL
  AND btrim("club") <> ''
ON CONFLICT ("ownerId", "type", "name") DO NOTHING;

INSERT INTO "CatTitleOption" ("ownerId", "type", "name", "updatedAt")
SELECT DISTINCT "ownerId", 'JUDGE', btrim("judge"), CURRENT_TIMESTAMP
FROM "CatTitleRecord"
WHERE "ownerId" IS NOT NULL
  AND "judge" IS NOT NULL
  AND btrim("judge") <> ''
ON CONFLICT ("ownerId", "type", "name") DO NOTHING;
