-- CreateEnum
CREATE TYPE "ServiceStatusType" AS ENUM ('ENVIADO_GATARINA', 'ENVIADO_FFB', 'RECEBIDO_FFB', 'ENVIADO_ASSOCIADO');

-- CreateTable
CREATE TABLE "ServiceStatus" (
    "id" SERIAL NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "status" "ServiceStatusType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceStatus_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ServiceStatus" ADD CONSTRAINT "ServiceStatus_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
