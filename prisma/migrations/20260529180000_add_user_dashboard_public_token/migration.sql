ALTER TABLE "User"
ADD COLUMN "dashboardPublicToken" TEXT;

CREATE UNIQUE INDEX "User_dashboardPublicToken_key" ON "User"("dashboardPublicToken");
