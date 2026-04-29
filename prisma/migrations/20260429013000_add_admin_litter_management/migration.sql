ALTER TABLE "Litter"
ADD COLUMN "litterNumber" TEXT,
ADD COLUMN "femaleCount" INTEGER,
ADD COLUMN "maleCount" INTEGER,
ADD COLUMN "deadCount" INTEGER,
ADD COLUMN "deadAtBirthCount" INTEGER,
ADD COLUMN "deadAtBirthMaleCount" INTEGER,
ADD COLUMN "deadAtBirthFemaleCount" INTEGER,
ADD COLUMN "deadAfterBirthCount" INTEGER,
ADD COLUMN "deadAfterBirthMaleCount" INTEGER,
ADD COLUMN "deadAfterBirthFemaleCount" INTEGER,
ADD COLUMN "historyNotes" TEXT;

ALTER TABLE "Litter"
ADD CONSTRAINT "Litter_litterNumber_key" UNIQUE ("litterNumber");

ALTER TABLE "LitterKitten"
ADD COLUMN "kittenCatId" INTEGER,
ADD COLUMN "kittenNumber" TEXT,
ADD COLUMN "deceased" BOOLEAN DEFAULT false;

ALTER TABLE "LitterKitten"
ADD CONSTRAINT "LitterKitten_kittenCatId_key" UNIQUE ("kittenCatId");

ALTER TABLE "LitterKitten"
ADD CONSTRAINT "LitterKitten_kittenCatId_fkey"
FOREIGN KEY ("kittenCatId") REFERENCES "Cat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
