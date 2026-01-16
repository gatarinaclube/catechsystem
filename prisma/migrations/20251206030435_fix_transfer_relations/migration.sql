-- CreateTable
CREATE TABLE "TransferRequest" (
    "id" SERIAL NOT NULL,
    "catId" INTEGER NOT NULL,
    "oldOwnerName" TEXT NOT NULL,
    "newOwnerName" TEXT NOT NULL,
    "breedingStatus" TEXT NOT NULL,
    "memberType" TEXT NOT NULL,
    "address" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "cep" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "serviceRequestId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransferRequest_serviceRequestId_key" ON "TransferRequest"("serviceRequestId");

-- AddForeignKey
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
