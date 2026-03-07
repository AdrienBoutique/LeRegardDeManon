import cron from "node-cron";
import { DateTime } from "luxon";
import { BRUSSELS_TIMEZONE } from "../lib/time";
import {
  sendCancellationSmsIfNeeded,
  findReminder24hSmsCandidates,
  findReminder2hSmsCandidates,
  sendConfirmationSmsIfNeeded,
  sendReminder24hSmsIfNeeded,
  sendReminder2hSmsIfNeeded,
  sendRescheduleSmsIfNeeded,
} from "../services/sms/appointmentSms";
import { isSmsConfigAvailable } from "../services/sms/ovhSms";

type SmsJobResult = "sent" | "skipped" | "failed";

let isReminder24hRunning = false;
let isReminder2hRunning = false;

function isSmsSchedulerEnabled(): boolean {
  return isSmsConfigAvailable();
}

function countResult(
  result: SmsJobResult,
  counters: { sent: number; skipped: number; failed: number }
): void {
  if (result === "sent") {
    counters.sent += 1;
    return;
  }
  if (result === "failed") {
    counters.failed += 1;
    return;
  }
  counters.skipped += 1;
}

async function processCandidates(input: {
  label: "confirmation" | "reminder24h" | "reminder2h";
  candidateIds: string[];
  sender: (appointmentId: string) => Promise<SmsJobResult>;
}): Promise<void> {
  const startedAt = Date.now();
  const counters = { sent: 0, skipped: 0, failed: 0 };

  console.log(`[jobs.appointmentSms.${input.label}] found=${input.candidateIds.length}`);

  for (const appointmentId of input.candidateIds) {
    try {
      const result = await input.sender(appointmentId);
      countResult(result, counters);
    } catch (error) {
      counters.failed += 1;
      console.error(`[jobs.appointmentSms.${input.label}] appointmentId=${appointmentId} failed`, error);
    }
  }

  console.log(
    `[jobs.appointmentSms.${input.label}] done found=${input.candidateIds.length} sent=${counters.sent} skipped=${counters.skipped} failed=${counters.failed} durationMs=${Date.now() - startedAt}`
  );
}

export async function sendAppointmentConfirmationSms(appointmentId: string): Promise<SmsJobResult> {
  if (!isSmsSchedulerEnabled()) {
    return "skipped";
  }

  try {
    const result = await sendConfirmationSmsIfNeeded(appointmentId);
    console.log(`[jobs.appointmentSms.confirmation] appointmentId=${appointmentId} result=${result}`);
    return result;
  } catch (error) {
    console.error(`[jobs.appointmentSms.confirmation] appointmentId=${appointmentId} failed`, error);
    return "failed";
  }
}

export async function sendAppointmentCancellationSms(appointmentId: string): Promise<SmsJobResult> {
  if (!isSmsSchedulerEnabled()) {
    return "skipped";
  }

  try {
    const result = await sendCancellationSmsIfNeeded(appointmentId);
    console.log(`[jobs.appointmentSms.cancellation] appointmentId=${appointmentId} result=${result}`);
    return result;
  } catch (error) {
    console.error(`[jobs.appointmentSms.cancellation] appointmentId=${appointmentId} failed`, error);
    return "failed";
  }
}

export async function sendAppointmentRescheduleSms(appointmentId: string): Promise<SmsJobResult> {
  if (!isSmsSchedulerEnabled()) {
    return "skipped";
  }

  try {
    const result = await sendRescheduleSmsIfNeeded(appointmentId);
    console.log(`[jobs.appointmentSms.reschedule] appointmentId=${appointmentId} result=${result}`);
    return result;
  } catch (error) {
    console.error(`[jobs.appointmentSms.reschedule] appointmentId=${appointmentId} failed`, error);
    return "failed";
  }
}

export async function runAppointmentSmsReminder24hOnce(): Promise<void> {
  if (!isSmsSchedulerEnabled()) {
    return;
  }

  if (isReminder24hRunning) {
    console.log("[jobs.appointmentSms.reminder24h] skipped: previous run still in progress");
    return;
  }

  isReminder24hRunning = true;

  try {
    const nowBrussels = DateTime.now().setZone(BRUSSELS_TIMEZONE);
    const windowStartUtc = nowBrussels.plus({ hours: 24 }).minus({ minutes: 10 }).toUTC().toJSDate();
    const windowEndUtc = nowBrussels.plus({ hours: 24 }).plus({ minutes: 10 }).toUTC().toJSDate();
    const candidateIds = await findReminder24hSmsCandidates(windowStartUtc, windowEndUtc);

    await processCandidates({
      label: "reminder24h",
      candidateIds,
      sender: sendReminder24hSmsIfNeeded,
    });
  } catch (error) {
    console.error("[jobs.appointmentSms.reminder24h] failed", error);
  } finally {
    isReminder24hRunning = false;
  }
}

export async function runAppointmentSmsReminder2hOnce(): Promise<void> {
  if (!isSmsSchedulerEnabled()) {
    return;
  }

  if (isReminder2hRunning) {
    console.log("[jobs.appointmentSms.reminder2h] skipped: previous run still in progress");
    return;
  }

  isReminder2hRunning = true;

  try {
    const nowBrussels = DateTime.now().setZone(BRUSSELS_TIMEZONE);
    const windowStartUtc = nowBrussels.plus({ hours: 2 }).minus({ minutes: 10 }).toUTC().toJSDate();
    const windowEndUtc = nowBrussels.plus({ hours: 2 }).plus({ minutes: 10 }).toUTC().toJSDate();
    const candidateIds = await findReminder2hSmsCandidates(windowStartUtc, windowEndUtc);

    await processCandidates({
      label: "reminder2h",
      candidateIds,
      sender: sendReminder2hSmsIfNeeded,
    });
  } catch (error) {
    console.error("[jobs.appointmentSms.reminder2h] failed", error);
  } finally {
    isReminder2hRunning = false;
  }
}

export function startAppointmentSmsRemindersJob(): void {
  if (!isSmsSchedulerEnabled()) {
    console.log("[jobs.appointmentSms] scheduler disabled: sms channel not configured");
    return;
  }

  cron.schedule(
    "*/5 * * * *",
    () => {
      void runAppointmentSmsReminder24hOnce();
    },
    {
      timezone: BRUSSELS_TIMEZONE,
    }
  );

  cron.schedule(
    "*/5 * * * *",
    () => {
      void runAppointmentSmsReminder2hOnce();
    },
    {
      timezone: BRUSSELS_TIMEZONE,
    }
  );

  console.log("[jobs.appointmentSms] schedulers started cron=*/5 * * * * timezone=Europe/Brussels");
}
