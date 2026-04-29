CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PREMIUM', 'MASTER', 'BASIC');

ALTER TABLE "User"
ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User"
ALTER COLUMN "role" TYPE "UserRole"
USING (
  CASE
    WHEN "role" = 'ADMIN' THEN 'ADMIN'::"UserRole"
    WHEN "role" = 'PREMIUM' THEN 'PREMIUM'::"UserRole"
    WHEN "role" = 'MASTER' THEN 'MASTER'::"UserRole"
    WHEN "role" = 'BASIC' THEN 'BASIC'::"UserRole"
    WHEN "role" = 'USER' THEN 'BASIC'::"UserRole"
    ELSE 'BASIC'::"UserRole"
  END
);

ALTER TABLE "User"
ALTER COLUMN "role" SET DEFAULT 'BASIC';
