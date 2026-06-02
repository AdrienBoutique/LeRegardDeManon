-- CreateEnum
CREATE TYPE "AvailabilityMode" AS ENUM ('WEEKLY', 'CUSTOM_DAYS');

-- CreateTable
CREATE TABLE "PractitionerScheduleSettings" (
    "id" TEXT NOT NULL,
    "staffMemberId" TEXT NOT NULL,
    "availabilityMode" "AvailabilityMode" NOT NULL DEFAULT 'WEEKLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PractitionerScheduleSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PractitionerCustomWorkingDay" (
    "id" TEXT NOT NULL,
    "staffMemberId" TEXT NOT NULL,
    "workingDate" TEXT NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PractitionerCustomWorkingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PractitionerCustomTimeSlot" (
    "id" TEXT NOT NULL,
    "customWorkingDayId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PractitionerCustomTimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PractitionerScheduleSettings_staffMemberId_key" ON "PractitionerScheduleSettings"("staffMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "PractitionerCustomWorkingDay_staffMemberId_workingDate_key" ON "PractitionerCustomWorkingDay"("staffMemberId", "workingDate");

-- CreateIndex
CREATE INDEX "PractitionerCustomWorkingDay_staffMemberId_workingDate_idx" ON "PractitionerCustomWorkingDay"("staffMemberId", "workingDate");

-- CreateIndex
CREATE INDEX "PractitionerCustomTimeSlot_customWorkingDayId_idx" ON "PractitionerCustomTimeSlot"("customWorkingDayId");

-- AddForeignKey
ALTER TABLE "PractitionerScheduleSettings" ADD CONSTRAINT "PractitionerScheduleSettings_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PractitionerCustomWorkingDay" ADD CONSTRAINT "PractitionerCustomWorkingDay_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PractitionerCustomTimeSlot" ADD CONSTRAINT "PractitionerCustomTimeSlot_customWorkingDayId_fkey" FOREIGN KEY ("customWorkingDayId") REFERENCES "PractitionerCustomWorkingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
