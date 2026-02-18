import { AppointmentStatus, NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import {
  buildSmsConfirmation,
  buildSmsReminder24h,
  buildSmsReminder2h,
} from "./templates";
import {
  isSmsConfigAvailable,
  isSmsEnabled,
  maskPhone,
  normalizePhoneToE164,
  sendSms,
  shouldSendConfirmationSms,
  shouldSendReminder24hSms,
  shouldSendReminder2hSms,
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

type SmsKind = "confirmation" | "reminder24h" | "reminder2h";

function isConfirmedAndActive(appointment: SmsAppointmentRecord): boolean {
  return appointment.status === AppointmentStatus.CONFIRMED && appointment.canceledAt === null;
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

function reservationField(kind: SmsKind): "confirmationSmsSentAt" | "reminder24hSmsSentAt" | "reminder2hSmsSentAt" {
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
  return NotificationType.REMINDER_2H;
}

function shouldSendByKind(kind: SmsKind): boolean {
  if (kind === "confirmation") {
    return shouldSendConfirmationSms();
  }
  if (kind === "reminder24h") {
    return shouldSendReminder24hSms();
  }
  return shouldSendReminder2hSms();
}

function buildSmsMessage(kind: SmsKind, appointment: SmsAppointmentRecord): string {
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
  return buildSmsReminder2h(payload);
}

async function sendSmsByKind(appointmentId: string, kind: SmsKind): Promise<"sent" | "skipped" | "failed"> {
  if (!isSmsEnabled() || !isSmsConfigAvailable() || !shouldSendByKind(kind)) {
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

  const message = buildSmsMessage(kind, appointment);
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
  return sendSmsByKind(appointmentId, "confirmation");
}

export async function sendReminder24hSmsIfNeeded(appointmentId: string): Promise<"sent" | "skipped" | "failed"> {
  return sendSmsByKind(appointmentId, "reminder24h");
}

export async function sendReminder2hSmsIfNeeded(appointmentId: string): Promise<"sent" | "skipped" | "failed"> {
  return sendSmsByKind(appointmentId, "reminder2h");
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
