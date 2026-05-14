ALTER TABLE "academy_plans"
ADD COLUMN "accessLevel" TEXT NOT NULL DEFAULT 'STUDENT';

UPDATE "academy_plans"
SET "accessLevel" = 'VISITOR'
WHERE lower("slug") = 'gratuito' OR lower("name") = 'gratuito';

UPDATE "academy_plans"
SET "accessLevel" = 'PREMIUM'
WHERE lower("slug") = 'premium' OR lower("name") = 'premium';
