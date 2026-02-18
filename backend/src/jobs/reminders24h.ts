import cron from "node-cron";
import { DateTime } from "luxon";
import { BRUSSELS_TIMEZONE } from "../lib/time";
import {
  findReminder24hCandidates,
  sendReminder24hEmailIfNeeded,
} from "../services/email/appointmentEmails";
import { isEmailConfigured } from "../services/email/mailer";
import {
  findReminder24hSmsCandidates,
  sendReminder24hSmsIfNeeded,
} from "../services/sms/appointmentSms";
import { isSmsConfigAvailable, isSmsEnabled } from "../services/sms/ovhSms";

let isRunning = false;

export async function runReminders24hOnce(): Promise<void> {
  if (!isEmailConfigured() && !(isSmsEnabled() && isSmsConfigAvailable())) {
    return;
  }

  if (isRunning) {
    console.log("[jobs.reminders24h] skipped: previous run still in progress");
    return;
  }

  isRunning = true;
  const runStartedAt = Date.now();

  try {
    console.log("[jobs.reminders24h] tick");
    const nowBrussels = DateTime.now().setZone(BRUSSELS_TIMEZONE);
    const windowStartUtc = nowBrussels
      .plus({ hours: 24 })
      .minus({ minutes: 10 })
      .toUTC()
      .toJSDate();
    const windowEndUtc = nowBrussels
      .plus({ hours: 24 })
      .plus({ minutes: 10 })
      .toUTC()
      .toJSDate();

    const [emailCandidateIds, smsCandidateIds] = await Promise.all([
      findReminder24hCandidates(windowStartUtc, windowEndUtc),
      findReminder24hSmsCandidates(windowStartUtc, windowEndUtc),
    ]);
    const candidateIds = Array.from(new Set([...emailCandidateIds, ...smsCandidateIds]));

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const appointmentId of candidateIds) {
      const [emailResult, smsResult] = await Promise.all([
        sendReminder24hEmailIfNeeded(appointmentId),
        sendReminder24hSmsIfNeeded(appointmentId),
      ]);
      for (const result of [emailResult, smsResult]) {
        if (result === "sent") {
          sentCount += 1;
        } else if (result === "failed") {
          failedCount += 1;
        } else {
          skippedCount += 1;
        }
      }
    }

    console.log(
      `[jobs.reminders24h] done candidates=${candidateIds.length} sent=${sentCount} skipped=${skippedCount} failed=${failedCount} durationMs=${Date.now() - runStartedAt}`
    );
  } catch (error) {
    console.error("[jobs.reminders24h] failed", error);
  } finally {
    isRunning = false;
  }
}

export function startReminders24hScheduler(): void {
  if (!isEmailConfigured() && !(isSmsEnabled() && isSmsConfigAvailable())) {
    console.log("[jobs.reminders24h] scheduler disabled: no email/sms channel configured");
    return;
  }

  cron.schedule(
    "*/5 * * * *",
    () => {
      void runReminders24hOnce();
    },
    {
      timezone: BRUSSELS_TIMEZONE,
    }
  );
  console.log("[jobs.reminders24h] scheduler started cron=*/5 * * * * timezone=Europe/Brussels");
}
