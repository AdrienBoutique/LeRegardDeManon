-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN     "defaultDiscountPercent" INTEGER,
ADD COLUMN     "isTrainee" BOOLEAN NOT NULL DEFAULT false;
