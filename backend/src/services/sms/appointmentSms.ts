import { AppointmentStatus, NotificationType, Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma";
import { BRUSSELS_TIMEZONE } from "../../lib/time";
import { getInstituteSettings } from "../settings/instituteSettings";
import {
  buildSmsCancellation,
  buildSmsConfirmation,
  buildSmsReschedule,
  buildSmsReminder24h,
  buildSmsReminder2h,
} from "./templates";
import {
  isSmsConfigAvailable,
  maskPhone,
  normalizePhoneToE164,
  sendSms,
} from "./ovhSms";

const smsSelect = {
  id: true,
  startsAt: true,
  status: true,
  canceledAt: true,
  clientId: true,
  clientPhone: true,
  smsConsent: true,
  confirmationSmsSentAt: true,
  reminder24hSmsSentAt: true,
  reminder2hSmsSentAt: true,
  client: {
    select: {
      firstName: true,
      lastName: true,
      phone: true,
    },
  },
} satisfies Prisma.AppointmentSelect;

type SmsAppointmentRecord = Prisma.AppointmentGetPayload<{
  select: typeof smsSelect;
}>;

type SmsKind = "confirmation" | "reminder24h" | "reminder2h" | "cancellation" | "reschedule";
type TrackedSmsKind = "confirmation" | "reminder24h" | "reminder2h";

function isConfirmedAndActive(appointment: SmsAppointmentRecord): boolean {
  return appointment.status === AppointmentStatus.CONFIRMED && appointment.canceledAt === null;
}

function isCancelledAppointment(appointment: SmsAppointmentRecord): boolean {
  return appointment.status === AppointmentStatus.CANCELLED || appointment.canceledAt !== null;
}

function clientName(appointment: SmsAppointmentRecord): string {
  return `${appointment.client.firstName} ${appointment.client.lastName}`.trim() || "Cliente";
}

function getPhone(appointment: SmsAppointmentRecord): string | null {
  return appointment.clientPhone?.trim() || appointment.client.phone?.trim() || null;
}

async function logSmsEvent(input: {
  appointmentId: string;
  clientId: string;
  recipient: string;
  type: NotificationType;
  status: "SENT" | "FAILED";
  message: string;
  providerJobId?: string | null;
  errorMessage?: string;
}): Promise<void> {
  try {
    await prisma.notificationLog.create({
      data: {
        appointmentId: input.appointmentId,
        clientId: input.clientId,
        type: input.type,
        channel: "SMS",
        recipient: input.recipient,
        status: input.status,
        errorMessage: input.errorMessage,
        payload: {
          message: input.message,
          providerJobId: input.providerJobId ?? null,
        },
      },
    });
  } catch (error) {
    console.error("[sms.logSmsEvent]", error);
  }
}

function reservationField(kind: TrackedSmsKind): "confirmationSmsSentAt" | "reminder24hSmsSentAt" | "reminder2hSmsSentAt" {
  if (kind === "confirmation") {
    return "confirmationSmsSentAt";
  }
  if (kind === "reminder24h") {
    return "reminder24hSmsSentAt";
  }
  return "reminder2hSmsSentAt";
}

function notificationType(kind: SmsKind): NotificationType {
  if (kind === "confirmation") {
    return NotificationType.CONFIRMATION;
  }
  if (kind === "reminder24h") {
    return NotificationType.REMINDER_24H;
  }
  if (kind === "reminder2h") {
    return NotificationType.REMINDER_2H;
  }
  if (kind === "cancellation") {
    return NotificationType.CANCELLATION;
  }
  return NotificationType.FOLLOW_UP;
}

async function getSmsSettings() {
  try {
    return await getInstituteSettings();
  } catch (error) {
    console.error("[sms.getSmsSettings]", error);
    return null;
  }
}

function shouldSendByKind(kind: SmsKind, settings: Awaited<ReturnType<typeof getInstituteSettings>>): boolean {
  if (!settings.smsEnabled) {
    return false;
  }

  if (kind === "confirmation") {
    return settings.smsConfirmationEnabled;
  }
  if (kind === "reminder24h") {
    return settings.smsReminder24hEnabled;
  }
  if (kind === "reminder2h") {
    return settings.smsReminder2hEnabled;
  }
  if (kind === "cancellation") {
    return settings.smsCancellationEnabled;
  }
  return settings.smsRescheduleEnabled;
}

function buildTemplatePayload(appointment: SmsAppointmentRecord) {
  const startsAt = DateTime.fromJSDate(appointment.startsAt, { zone: "utc" }).setZone(BRUSSELS_TIMEZONE);
  return {
    clientName: clientName(appointment),
    date: startsAt.toFormat("dd/MM/yyyy"),
    time: startsAt.toFormat("HH:mm"),
    datetime: startsAt.toFormat("dd/MM 'a' HH:mm"),
    establishmentName: process.env.INSTITUTE_NAME?.trim() || "Le Regard de Manon",
  };
}

function renderTemplate(template: string, appointment: SmsAppointmentRecord): string {
  const payload = buildTemplatePayload(appointment);
  return template
    .replaceAll("{clientName}", payload.clientName)
    .replaceAll("{date}", payload.date)
    .replaceAll("{time}", payload.time)
    .replaceAll("{datetime}", payload.datetime)
    .replaceAll("{establishmentName}", payload.establishmentName)
    .trim();
}

function buildSmsMessage(
  kind: SmsKind,
  appointment: SmsAppointmentRecord,
  settings: Awaited<ReturnType<typeof getInstituteSettings>>
): string {
  const customTemplate =
    kind === "confirmation"
      ? settings.smsTemplateConfirmation
      : kind === "reminder24h"
        ? settings.smsTemplateReminder24h
        : kind === "reminder2h"
          ? settings.smsTemplateReminder2h
          : kind === "cancellation"
            ? settings.smsTemplateCancellation
            : settings.smsTemplateReschedule;

  if (customTemplate?.trim()) {
    return renderTemplate(customTemplate, appointment);
  }

  const payload = {
    clientName: clientName(appointment),
    startsAt: appointment.startsAt,
  };
  if (kind === "confirmation") {
    return buildSmsConfirmation(payload);
  }
  if (kind === "reminder24h") {
    return buildSmsReminder24h(payload);
  }
  if (kind === "reminder2h") {
    return buildSmsReminder2h(payload);
  }
  if (kind === "cancellation") {
    return buildSmsCancellation(payload);
  }
  return buildSmsReschedule(payload);
}

async function sendTrackedSmsByKind(appointmentId: string, kind: TrackedSmsKind): Promise<"sent" | "skipped" | "failed"> {
  if (!isSmsConfigAvailable()) {
    return "skipped";
  }

  const settings = await getSmsSettings();
  if (!settings || !shouldSendByKind(kind, settings)) {
    return "skipped";
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: smsSelect,
  });

  if (!appointment || !isConfirmedAndActive(appointment) || appointment.smsConsent !== true) {
    return "skipped";
  }

  const rawPhone = getPhone(appointment);
  if (!rawPhone) {
    return "skipped";
  }

  const field = reservationField(kind);
  if (appointment[field] !== null) {
    return "skipped";
  }

  let toE164: string;
  try {
    toE164 = normalizePhoneToE164(rawPhone);
  } catch (error) {
    await logSmsEvent({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      recipient: rawPhone,
      type: notificationType(kind),
      status: "FAILED",
      message: "",
      errorMessage: error instanceof Error ? error.message : "INVALID_PHONE",
    });
    return "failed";
  }

  const message = buildSmsMessage(kind, appointment, settings);
  const reservedAt = new Date();

  const reserveWhere: Prisma.AppointmentWhereInput = {
    id: appointment.id,
    [field]: null,
  };
  const reserveData: Prisma.AppointmentUpdateManyMutationInput = {
    [field]: reservedAt,
  };
  const reserved = await prisma.appointment.updateMany({
    where: reserveWhere,
    data: reserveData,
  });

  if (reserved.count === 0) {
    return "skipped";
  }

  try {
    const sent = await sendSms({
      to: toE164,
      message,
      sender: settings.smsSender,
    });

    await logSmsEvent({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      recipient: toE164,
      type: notificationType(kind),
      status: "SENT",
      message,
      providerJobId: sent.jobId,
    });

    console.log(`SMS_${kind.toUpperCase()}_SENT appointmentId=${appointment.id} to=${maskPhone(toE164)}`);
    return "sent";
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "SMS_SEND_FAILED";
    const rollbackWhere: Prisma.AppointmentWhereInput = {
      id: appointment.id,
      [field]: reservedAt,
    };
    const rollbackData: Prisma.AppointmentUpdateManyMutationInput = {
      [field]: null,
    };
    await prisma.appointment.updateMany({
      where: rollbackWhere,
      data: rollbackData,
    });

    await logSmsEvent({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      recipient: toE164,
      type: notificationType(kind),
      status: "FAILED",
      message,
      errorMessage: messageText,
    });

    console.error(`SMS_${kind.toUpperCase()}_FAILED appointmentId=${appointment.id} to=${maskPhone(toE164)}`, error);
    return "failed";
  }
}

export async function sendConfirmationSmsIfNeeded(appointmentId: string): Promise<"sent" | "skipped" | "failed"> {
  return sendTrackedSmsByKind(appointmentId, "confirmation");
}

export async function sendReminder24hSmsIfNeeded(appointmentId: string): Promise<"sent" | "skipped" | "failed"> {
  return sendTrackedSmsByKind(appointmentId, "reminder24h");
}

export async function sendReminder2hSmsIfNeeded(appointmentId: string): Promise<"sent" | "skipped" | "failed"> {
  return sendTrackedSmsByKind(appointmentId, "reminder2h");
}

async function sendEventSmsByKind(appointmentId: string, kind: "cancellation" | "reschedule"): Promise<"sent" | "skipped" | "failed"> {
  if (!isSmsConfigAvailable()) {
    return "skipped";
  }

  const settings = await getSmsSettings();
  if (!settings || !shouldSendByKind(kind, settings)) {
    return "skipped";
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: smsSelect,
  });

  if (!appointment || appointment.smsConsent !== true) {
    return "skipped";
  }

  if (kind === "cancellation" && !isCancelledAppointment(appointment)) {
    return "skipped";
  }

  if (kind === "reschedule" && !isConfirmedAndActive(appointment)) {
    return "skipped";
  }

  const rawPhone = getPhone(appointment);
  if (!rawPhone) {
    return "skipped";
  }

  let toE164: string;
  try {
    toE164 = normalizePhoneToE164(rawPhone);
  } catch (error) {
    await logSmsEvent({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      recipient: rawPhone,
      type: notificationType(kind),
      status: "FAILED",
      message: "",
      errorMessage: error instanceof Error ? error.message : "INVALID_PHONE",
    });
    return "failed";
  }

  const message = buildSmsMessage(kind, appointment, settings);

  try {
    const sent = await sendSms({
      to: toE164,
      message,
      sender: settings.smsSender,
    });

    await logSmsEvent({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      recipient: toE164,
      type: notificationType(kind),
      status: "SENT",
      message,
      providerJobId: sent.jobId,
    });

    console.log(`SMS_${kind.toUpperCase()}_SENT appointmentId=${appointment.id} to=${maskPhone(toE164)}`);
    return "sent";
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "SMS_SEND_FAILED";

    await logSmsEvent({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      recipient: toE164,
      type: notificationType(kind),
      status: "FAILED",
      message,
      errorMessage: messageText,
    });

    console.error(`SMS_${kind.toUpperCase()}_FAILED appointmentId=${appointment.id} to=${maskPhone(toE164)}`, error);
    return "failed";
  }
}

export async function sendCancellationSmsIfNeeded(appointmentId: string): Promise<"sent" | "skipped" | "failed"> {
  return sendEventSmsByKind(appointmentId, "cancellation");
}

export async function sendRescheduleSmsIfNeeded(appointmentId: string): Promise<"sent" | "skipped" | "failed"> {
  return sendEventSmsByKind(appointmentId, "reschedule");
}

export async function findReminder24hSmsCandidates(windowStartUtc: Date, windowEndUtc: Date): Promise<string[]> {
  const items = await prisma.appointment.findMany({
    where: {
      startsAt: {
        gte: windowStartUtc,
        lte: windowEndUtc,
      },
      status: AppointmentStatus.CONFIRMED,
      canceledAt: null,
      smsConsent: true,
      reminder24hSmsSentAt: null,
      OR: [{ clientPhone: { not: null } }, { client: { phone: { not: null } } }],
    },
    select: { id: true },
    orderBy: { startsAt: "asc" },
  });
  return items.map((item) => item.id);
}

export async function findReminder2hSmsCandidates(windowStartUtc: Date, windowEndUtc: Date): Promise<string[]> {
  const items = await prisma.appointment.findMany({
    where: {
      startsAt: {
        gte: windowStartUtc,
        lte: windowEndUtc,
      },
      status: AppointmentStatus.CONFIRMED,
      canceledAt: null,
      smsConsent: true,
      reminder2hSmsSentAt: null,
      OR: [{ clientPhone: { not: null } }, { client: { phone: { not: null } } }],
    },
    select: { id: true },
    orderBy: { startsAt: "asc" },
  });
  return items.map((item) => item.id);
}
