import cron from "node-cron";
import { DateTime } from "luxon";
import { BRUSSELS_TIMEZONE } from "../lib/time";
import {
  findReminder24hCandidates,
  sendReminder24hEmailIfNeeded,
} from "../services/email/appointmentEmails";
import { isEmailConfigured } from "../services/email/mailer";

let isRunning = false;

export async function runReminders24hOnce(): Promise<void> {
  if (!isEmailConfigured()) {
    return;
  }

  if (isRunning) {
    console.log("[jobs.reminders24h] skipped: previous run still in progress");
    return;
  }

  isRunning = true;
  const runStartedAt = Date.now();

  try {
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

    const candidateIds = await findReminder24hCandidates(windowStartUtc, windowEndUtc);

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const appointmentId of candidateIds) {
      const result = await sendReminder24hEmailIfNeeded(appointmentId);
      if (result === "sent") {
        sentCount += 1;
      } else if (result === "failed") {
        failedCount += 1;
      } else {
        skippedCount += 1;
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
  if (!isEmailConfigured()) {
    console.log("[jobs.reminders24h] scheduler disabled: EMAIL_USER/EMAIL_PASS missing");
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
