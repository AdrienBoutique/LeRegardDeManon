-- CreateTable
CREATE TABLE "InstituteAvailabilityRule" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstituteAvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstituteAvailabilityRule_dayOfWeek_key" ON "InstituteAvailabilityRule"("dayOfWeek");

-- CreateIndex
CREATE INDEX "InstituteAvailabilityRule_dayOfWeek_idx" ON "InstituteAvailabilityRule"("dayOfWeek");
