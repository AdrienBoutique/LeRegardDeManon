-- AlterTable
ALTER TABLE "Appointment"
ADD COLUMN "totalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill from appointment items snapshot prices (cents -> euros)
UPDATE "Appointment" AS a
SET "totalPrice" = COALESCE(items.total_cents, 0) / 100.0
FROM (
  SELECT "appointmentId", SUM("priceCents")::DOUBLE PRECISION AS total_cents
  FROM "AppointmentItem"
  GROUP BY "appointmentId"
) AS items
WHERE items."appointmentId" = a."id";
