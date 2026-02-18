-- AlterTable
ALTER TABLE "Appointment"
ADD COLUMN "confirmationEmailSentAt" TIMESTAMP(3),
ADD COLUMN "reminder24hEmailSentAt" TIMESTAMP(3),
ADD COLUMN "canceledAt" TIMESTAMP(3);
