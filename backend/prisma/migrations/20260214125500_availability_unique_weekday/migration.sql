-- Add unique constraint to ensure one weekly rule per staff/day
CREATE UNIQUE INDEX "AvailabilityRule_staffMemberId_dayOfWeek_key" ON "AvailabilityRule"("staffMemberId", "dayOfWeek");
