/*
  Warnings:

  - A unique constraint covering the columns `[microchip]` on the table `Cat` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Cat_microchip_key" ON "Cat"("microchip");
