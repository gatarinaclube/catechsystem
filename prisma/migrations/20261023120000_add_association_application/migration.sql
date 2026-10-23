CREATE TABLE "AssociationApplication" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data" JSONB NOT NULL,
    "declaration" JSONB NOT NULL,
    "memberCopySentAt" TIMESTAMP(3),
    "clubCopySentAt" TIMESTAMP(3),
    "memberCopyError" TEXT,
    "clubCopyError" TEXT,
    CONSTRAINT "AssociationApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssociationApplication_userId_key" ON "AssociationApplication"("userId");
ALTER TABLE "AssociationApplication" ADD CONSTRAINT "AssociationApplication_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
