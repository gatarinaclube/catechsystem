-- CreateTable
CREATE TABLE "SecondCopyRequest" (
    "id" SERIAL NOT NULL,
    "serviceRequestId" INTEGER NOT NULL,
    "catId" INTEGER NOT NULL,
    "requestType" TEXT NOT NULL,
    "details" TEXT,
    "newValue" TEXT,
    "attachmentsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecondCopyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecondCopyRequest_serviceRequestId_key" ON "SecondCopyRequest"("serviceRequestId");

-- AddForeignKey
ALTER TABLE "SecondCopyRequest" ADD CONSTRAINT "SecondCopyRequest_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecondCopyRequest" ADD CONSTRAINT "SecondCopyRequest_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
