-- AlterTable
ALTER TABLE "ServiceStaff" ADD COLUMN     "priceCentsOverride" INTEGER;

-- CreateIndex
CREATE INDEX "ServiceStaff_serviceId_idx" ON "ServiceStaff"("serviceId");
