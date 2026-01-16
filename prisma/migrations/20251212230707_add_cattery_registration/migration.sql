-- CreateTable
CREATE TABLE "CatteryRegistration" (
    "id" SERIAL NOT NULL,
    "serviceRequestId" INTEGER NOT NULL,
    "nameOption1" TEXT NOT NULL,
    "nameOption2" TEXT,
    "nameOption3" TEXT,
    "numberOfCats" INTEGER NOT NULL,
    "breedsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatteryRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatteryRegistration_serviceRequestId_key" ON "CatteryRegistration"("serviceRequestId");

-- AddForeignKey
ALTER TABLE "CatteryRegistration" ADD CONSTRAINT "CatteryRegistration_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
