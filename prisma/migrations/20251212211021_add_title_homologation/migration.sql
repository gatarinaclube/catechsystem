-- CreateTable
CREATE TABLE "TitleHomologation" (
    "id" SERIAL NOT NULL,
    "serviceRequestId" INTEGER NOT NULL,
    "catId" INTEGER NOT NULL,
    "requestedTitle" TEXT NOT NULL,
    "certificatesJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TitleHomologation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TitleHomologation_serviceRequestId_key" ON "TitleHomologation"("serviceRequestId");

-- AddForeignKey
ALTER TABLE "TitleHomologation" ADD CONSTRAINT "TitleHomologation_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
