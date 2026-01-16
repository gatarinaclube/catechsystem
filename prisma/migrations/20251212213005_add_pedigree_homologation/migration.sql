-- CreateTable
CREATE TABLE "PedigreeHomologation" (
    "id" SERIAL NOT NULL,
    "serviceRequestId" INTEGER NOT NULL,
    "catId" INTEGER NOT NULL,
    "homologationType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedigreeHomologation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PedigreeHomologation_serviceRequestId_key" ON "PedigreeHomologation"("serviceRequestId");

-- AddForeignKey
ALTER TABLE "PedigreeHomologation" ADD CONSTRAINT "PedigreeHomologation_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
