import cron from "node-cron";
import { DateTime } from "luxon";
import { BRUSSELS_TIMEZONE } from "../lib/time";
import {
  findReminder2hSmsCandidates,
  sendReminder2hSmsIfNeeded,
} from "../services/sms/appointmentSms";
import { isSmsConfigAvailable, isSmsEnabled } from "../services/sms/ovhSms";

let isRunning = false;

export async function runReminders2hOnce(): Promise<void> {
  if (!isSmsEnabled() || !isSmsConfigAvailable()) {
    return;
  }

  if (isRunning) {
    console.log("[jobs.reminders2h] skipped: previous run still in progress");
    return;
  }

  isRunning = true;
  const runStartedAt = Date.now();

  try {
    console.log("[jobs.reminders2h] tick");
    const nowBrussels = DateTime.now().setZone(BRUSSELS_TIMEZONE);
    const windowStartUtc = nowBrussels.plus({ hours: 2 }).minus({ minutes: 10 }).toUTC().toJSDate();
    const windowEndUtc = nowBrussels.plus({ hours: 2 }).plus({ minutes: 10 }).toUTC().toJSDate();

    const candidateIds = await findReminder2hSmsCandidates(windowStartUtc, windowEndUtc);
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const appointmentId of candidateIds) {
      const result = await sendReminder2hSmsIfNeeded(appointmentId);
      if (result === "sent") {
        sentCount += 1;
      } else if (result === "failed") {
        failedCount += 1;
      } else {
        skippedCount += 1;
      }
    }

    console.log(
      `[jobs.reminders2h] done candidates=${candidateIds.length} sent=${sentCount} skipped=${skippedCount} failed=${failedCount} durationMs=${Date.now() - runStartedAt}`
    );
  } catch (error) {
    console.error("[jobs.reminders2h] failed", error);
  } finally {
    isRunning = false;
  }
}

export function startReminders2hScheduler(): void {
  if (!isSmsEnabled() || !isSmsConfigAvailable()) {
    console.log("[jobs.reminders2h] scheduler disabled: sms channel not configured");
    return;
  }

  cron.schedule(
    "*/5 * * * *",
    () => {
      void runReminders2hOnce();
    },
    {
      timezone: BRUSSELS_TIMEZONE,
    }
  );
  console.log("[jobs.reminders2h] scheduler started cron=*/5 * * * * timezone=Europe/Brussels");
}
