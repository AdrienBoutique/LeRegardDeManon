-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REMINDER_24H';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REMINDER_2H';

-- AlterTable
ALTER TABLE "Appointment"
ADD COLUMN "clientPhone" TEXT,
ADD COLUMN "smsConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "confirmationSmsSentAt" TIMESTAMP(3),
ADD COLUMN "reminder24hSmsSentAt" TIMESTAMP(3),
ADD COLUMN "reminder2hSmsSentAt" TIMESTAMP(3);
