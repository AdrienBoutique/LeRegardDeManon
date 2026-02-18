-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- CreateEnum
CREATE TYPE "BookingMode" AS ENUM ('MANUAL', 'AUTO_INTELLIGENT');

-- AlterTable
ALTER TABLE "Appointment"
ADD COLUMN "rejectedReason" TEXT,
ADD COLUMN "confirmedAt" TIMESTAMP(3),
ADD COLUMN "rejectedAt" TIMESTAMP(3),
ADD COLUMN "rejectedEmailSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InstituteSettings" (
  "id" TEXT NOT NULL,
  "instituteId" TEXT,
  "bookingMode" "BookingMode" NOT NULL DEFAULT 'MANUAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstituteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstituteSettings_instituteId_key" ON "InstituteSettings"("instituteId");
