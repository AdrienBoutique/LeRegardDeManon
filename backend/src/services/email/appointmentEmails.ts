import { AppointmentStatus, NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { isEmailConfigured, sendMail } from "./mailer";
import {
  buildConfirmedEmail,
  buildRejectedEmail,
  buildReminder24hEmail,
  InstituteEmailInfo,
  AppointmentEmailInfo,
} from "./templates";

const appointmentEmailSelect = {
  id: true,
  startsAt: true,
  status: true,
  canceledAt: true,
  rejectedReason: true,
  confirmationEmailSentAt: true,
  rejectedEmailSentAt: true,
  reminder24hEmailSentAt: true,
  notes: true,
  clientId: true,
  client: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  staffMember: {
    select: {
      firstName: true,
      lastName: true,
    },
  },
  items: {
    orderBy: {
      order: "asc",
    },
    select: {
      service: {
        select: {
          name: true,
        },
      },
    },
  },
} satisfies Prisma.AppointmentSelect;

type AppointmentEmailRecord = Prisma.AppointmentGetPayload<{
  select: typeof appointmentEmailSelect;
}>;

function getInstituteEmailInfo(): InstituteEmailInfo {
  return {
    name: process.env.INSTITUTE_NAME?.trim() || "Le Regard de Manon",
    address: process.env.INSTITUTE_ADDRESS?.trim() || null,
    manageUrl: process.env.BOOKING_MANAGE_URL?.trim() || null,
  };
}

function buildClientName(firstName: string, lastName: string): string {
  const full = `${firstName} ${lastName}`.trim();
  return full.length > 0 ? full : "Cliente";
}

function buildServiceSummary(appointment: AppointmentEmailRecord): string {
  const names = appointment.items.map((item) => item.service.name).filter((name) => name.length > 0);
  if (names.length === 0) {
    return "Prestation";
  }

  if (names.length === 1) {
    return names[0];
  }

  return names.join(" + ");
}

function mapAppointmentInfo(appointment: AppointmentEmailRecord): AppointmentEmailInfo {
  return {
    appointmentId: appointment.id,
    clientName: buildClientName(appointment.client.firstName, appointment.client.lastName),
    startsAt: appointment.startsAt,
    staffName: `${appointment.staffMember.firstName} ${appointment.staffMember.lastName}`.trim(),
    serviceSummary: buildServiceSummary(appointment),
    notes: appointment.notes,
  };
}

async function logNotificationEvent(input: {
  appointmentId: string;
  clientId: string;
  recipient: string;
  type: NotificationType;
  status: "SENT" | "FAILED";
  subject: string;
  messageId?: string;
  errorMessage?: string;
}): Promise<void> {
  try {
    await prisma.notificationLog.create({
      data: {
        appointmentId: input.appointmentId,
        clientId: input.clientId,
        type: input.type,
        channel: "EMAIL",
        recipient: input.recipient,
        status: input.status,
        errorMessage: input.errorMessage,
        payload: {
          subject: input.subject,
          messageId: input.messageId ?? null,
        },
      },
    });
  } catch (error) {
    console.error("[email.logNotificationEvent]", error);
  }
}

function isCancelled(appointment: AppointmentEmailRecord): boolean {
  return appointment.status === AppointmentStatus.CANCELLED || appointment.canceledAt !== null;
}

export async function sendConfirmationEmailIfNeeded(appointmentId: string): Promise<"sent" | "skipped" | "failed"> {
  if (!isEmailConfigured()) {
    return "skipped";
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: appointmentEmailSelect,
  });

  if (!appointment || isCancelled(appointment) || appointment.status !== AppointmentStatus.CONFIRMED) {
    return "skipped";
  }

  const recipient = appointment.client.email?.trim().toLowerCase();
  if (!recipient || appointment.confirmationEmailSentAt) {
    return "skipped";
  }

  const institute = getInstituteEmailInfo();
  const details = mapAppointmentInfo(appointment);
  const message = buildConfirmedEmail(details, institute);
  const reservationTime = new Date();

  const reservation = await prisma.appointment.updateMany({
    where: {
      id: appointment.id,
      confirmationEmailSentAt: null,
    },
    data: {
      confirmationEmailSentAt: reservationTime,
    },
  });

  if (reservation.count === 0) {
    return "skipped";
  }

  try {
    const sent = await sendMail({
      to: recipient,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    await logNotificationEvent({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      recipient,
      type: NotificationType.CONFIRMATION,
      status: "SENT",
      subject: message.subject,
      messageId: sent.messageId,
    });

    console.log(`EMAIL_CONFIRMATION_SENT appointmentId=${appointment.id} recipient=${recipient}`);
    return "sent";
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown email failure";
    console.error(`EMAIL_CONFIRMATION_FAILED appointmentId=${appointment.id} recipient=${recipient}`, error);
    await prisma.appointment.updateMany({
      where: {
        id: appointment.id,
        confirmationEmailSentAt: reservationTime,
      },
      data: {
        confirmationEmailSentAt: null,
      },
    });

    await logNotificationEvent({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      recipient,
      type: NotificationType.CONFIRMATION,
      status: "FAILED",
      subject: message.subject,
      errorMessage: messageText,
    });

    return "failed";
  }
}

export async function sendConfirmedIfNeeded(appointmentId: string): Promise<"sent" | "skipped" | "failed"> {
  return sendConfirmationEmailIfNeeded(appointmentId);
}

export async function sendRejectedIfNeeded(appointmentId: string): Promise<"sent" | "skipped" | "failed"> {
  if (!isEmailConfigured()) {
    return "skipped";
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: appointmentEmailSelect,
  });

  if (!appointment || appointment.status !== AppointmentStatus.REJECTED) {
    return "skipped";
  }

  const recipient = appointment.client.email?.trim().toLowerCase();
  if (!recipient || appointment.rejectedEmailSentAt) {
    return "skipped";
  }

  const institute = getInstituteEmailInfo();
  const details = mapAppointmentInfo(appointment);
  const message = buildRejectedEmail(details, institute, appointment.rejectedReason);
  const reservationTime = new Date();

  const reservation = await prisma.appointment.updateMany({
    where: {
      id: appointment.id,
      rejectedEmailSentAt: null,
    },
    data: {
      rejectedEmailSentAt: reservationTime,
    },
  });

  if (reservation.count === 0) {
    return "skipped";
  }

  try {
    const sent = await sendMail({
      to: recipient,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    await logNotificationEvent({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      recipient,
      type: NotificationType.CANCELLATION,
      status: "SENT",
      subject: message.subject,
      messageId: sent.messageId,
    });

    console.log(`EMAIL_REJECTED_SENT appointmentId=${appointment.id} recipient=${recipient}`);
    return "sent";
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown email failure";
    console.error(`EMAIL_REJECTED_FAILED appointmentId=${appointment.id} recipient=${recipient}`, error);
    await prisma.appointment.updateMany({
      where: {
        id: appointment.id,
        rejectedEmailSentAt: reservationTime,
      },
      data: {
        rejectedEmailSentAt: null,
      },
    });

    await logNotificationEvent({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      recipient,
      type: NotificationType.CANCELLATION,
      status: "FAILED",
      subject: message.subject,
      errorMessage: messageText,
    });

    return "failed";
  }
}

export async function sendReminder24hEmailIfNeeded(appointmentId: string): Promise<"sent" | "skipped" | "failed"> {
  if (!isEmailConfigured()) {
    return "skipped";
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: appointmentEmailSelect,
  });

  if (!appointment || isCancelled(appointment) || appointment.status !== AppointmentStatus.CONFIRMED) {
    return "skipped";
  }

  const recipient = appointment.client.email?.trim().toLowerCase();
  if (!recipient || appointment.reminder24hEmailSentAt) {
    return "skipped";
  }

  const institute = getInstituteEmailInfo();
  const details = mapAppointmentInfo(appointment);
  const message = buildReminder24hEmail(details, institute);
  const reservationTime = new Date();

  const reservation = await prisma.appointment.updateMany({
    where: {
      id: appointment.id,
      reminder24hEmailSentAt: null,
    },
    data: {
      reminder24hEmailSentAt: reservationTime,
    },
  });

  if (reservation.count === 0) {
    return "skipped";
  }

  try {
    const sent = await sendMail({
      to: recipient,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    await logNotificationEvent({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      recipient,
      type: NotificationType.REMINDER,
      status: "SENT",
      subject: message.subject,
      messageId: sent.messageId,
    });

    console.log(`EMAIL_REMINDER24H_SENT appointmentId=${appointment.id} recipient=${recipient}`);
    return "sent";
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown email failure";
    console.error(`EMAIL_REMINDER24H_FAILED appointmentId=${appointment.id} recipient=${recipient}`, error);
    await prisma.appointment.updateMany({
      where: {
        id: appointment.id,
        reminder24hEmailSentAt: reservationTime,
      },
      data: {
        reminder24hEmailSentAt: null,
      },
    });

    await logNotificationEvent({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      recipient,
      type: NotificationType.REMINDER,
      status: "FAILED",
      subject: message.subject,
      errorMessage: messageText,
    });

    return "failed";
  }
}

export async function findReminder24hCandidates(windowStartUtc: Date, windowEndUtc: Date): Promise<string[]> {
  const appointments = await prisma.appointment.findMany({
    where: {
      startsAt: {
        gte: windowStartUtc,
        lte: windowEndUtc,
      },
      status: {
        equals: AppointmentStatus.CONFIRMED,
      },
      canceledAt: null,
      reminder24hEmailSentAt: null,
      client: {
        email: {
          not: null,
        },
      },
    },
    orderBy: {
      startsAt: "asc",
    },
    select: {
      id: true,
    },
  });

  return appointments.map((appointment) => appointment.id);
}
