ALTER TABLE "InstituteSettings"
ADD COLUMN "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "smsConfirmationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "smsReminder24hEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "smsReminder2hEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "smsCancellationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "smsRescheduleEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "smsSender" TEXT DEFAULT 'Manon',
ADD COLUMN "smsTemplateConfirmation" TEXT,
ADD COLUMN "smsTemplateReminder24h" TEXT,
ADD COLUMN "smsTemplateReminder2h" TEXT,
ADD COLUMN "smsTemplateCancellation" TEXT,
ADD COLUMN "smsTemplateReschedule" TEXT;

UPDATE "InstituteSettings"
SET
  "smsEnabled" = COALESCE("smsEnabled", true),
  "smsConfirmationEnabled" = COALESCE("smsConfirmationEnabled", true),
  "smsReminder24hEnabled" = COALESCE("smsReminder24hEnabled", true),
  "smsReminder2hEnabled" = COALESCE("smsReminder2hEnabled", false),
  "smsCancellationEnabled" = COALESCE("smsCancellationEnabled", true),
  "smsRescheduleEnabled" = COALESCE("smsRescheduleEnabled", true),
  "smsSender" = COALESCE(NULLIF(TRIM("smsSender"), ''), 'Manon');
