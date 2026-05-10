ALTER TABLE "Cat"
ADD COLUMN "kittenAvailabilityStatus" TEXT;

UPDATE "Cat"
SET "kittenAvailabilityStatus" = CASE
  WHEN COALESCE("deceased", false) = true THEN 'DECEASED'
  WHEN COALESCE("breedingProspect", false) = true THEN 'BREEDER'
  WHEN COALESCE("delivered", false) = true THEN 'DELIVERED'
  WHEN COALESCE("sold", false) = true THEN 'RESERVED'
  ELSE 'UNAVAILABLE'
END
WHERE "kittenNumber" IS NOT NULL
  OR EXISTS (
    SELECT 1
    FROM "LitterKitten"
    WHERE "LitterKitten"."kittenCatId" = "Cat"."id"
  );
