ALTER TABLE "InstituteSettings"
ALTER COLUMN "smsTemplateConfirmation" SET DEFAULT '{establishmentName} : bonjour {clientName}, votre rendez-vous est confirme le {date} a {time}. A bientot.',
ALTER COLUMN "smsTemplateReminder24h" SET DEFAULT '{establishmentName} : rappel de votre rendez-vous demain, le {date} a {time}. A bientot.',
ALTER COLUMN "smsTemplateReminder2h" SET DEFAULT '{establishmentName} : rappel, votre rendez-vous est dans 2h a {time}. A tout a l''heure.',
ALTER COLUMN "smsTemplateCancellation" SET DEFAULT '{establishmentName} : votre rendez-vous du {date} a {time} a ete annule. Merci de nous contacter si besoin.',
ALTER COLUMN "smsTemplateReschedule" SET DEFAULT '{establishmentName} : votre rendez-vous a ete modifie. Nouveau creneau : {date} a {time}.';

UPDATE "InstituteSettings"
SET
  "smsTemplateConfirmation" = COALESCE(NULLIF(TRIM("smsTemplateConfirmation"), ''), '{establishmentName} : bonjour {clientName}, votre rendez-vous est confirme le {date} a {time}. A bientot.'),
  "smsTemplateReminder24h" = COALESCE(NULLIF(TRIM("smsTemplateReminder24h"), ''), '{establishmentName} : rappel de votre rendez-vous demain, le {date} a {time}. A bientot.'),
  "smsTemplateReminder2h" = COALESCE(NULLIF(TRIM("smsTemplateReminder2h"), ''), '{establishmentName} : rappel, votre rendez-vous est dans 2h a {time}. A tout a l''heure.'),
  "smsTemplateCancellation" = COALESCE(NULLIF(TRIM("smsTemplateCancellation"), ''), '{establishmentName} : votre rendez-vous du {date} a {time} a ete annule. Merci de nous contacter si besoin.'),
  "smsTemplateReschedule" = COALESCE(NULLIF(TRIM("smsTemplateReschedule"), ''), '{establishmentName} : votre rendez-vous a ete modifie. Nouveau creneau : {date} a {time}.');
