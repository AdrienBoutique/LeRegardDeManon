import { AppointmentStatus, NotificationType, Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma";
import { BRUSSELS_TIMEZONE } from "../../lib/time";
import { isPushAvailable, isPushEnabled, sendPushToTokens } from "./fcm";

const appointmentPushSelect = {
  id: true,
  startsAt: true,
  status: true,
  clientId: true,
  client: {
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

function formatClientName(firstName: string, lastName: string): string {
  const value = `${firstName} ${lastName}`.trim();
  return value.length > 0 ? value : "Cliente";
}

function formatServiceSummary(serviceNames: string[]): string {
  if (serviceNames.length === 0) {
    return "Prestation";
  }
  if (serviceNames.length === 1) {
    return serviceNames[0];
  }
  return serviceNames.join(" + ");
}

function formatBrusselsDateTime(value: Date): string {
  return DateTime.fromJSDate(value, { zone: "utc" })
    .setZone(BRUSSELS_TIMEZONE)
    .toFormat("dd/MM HH:mm");
}

async function logPushEvent(input: {
  appointmentId: string;
  clientId: string;
  status: "SENT" | "FAILED";
  recipient: string;
  payload: Record<string, unknown>;
  errorMessage?: string;
}): Promise<void> {
  try {
    await prisma.notificationLog.create({
      data: {
        appointmentId: input.appointmentId,
        clientId: input.clientId,
        type: NotificationType.FOLLOW_UP,
        channel: "PUSH",
        recipient: input.recipient,
        status: input.status,
        payload: input.payload,
        errorMessage: input.errorMessage,
      },
    });
  } catch (error) {
    console.error("[push.appointment.log]", error);
  }
}

export async function sendPendingAppointmentPush(appointmentId: string): Promise<void> {
  if (!isPushEnabled() || !isPushAvailable()) {
    return;
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: appointmentPushSelect,
  });

  if (!appointment || appointment.status !== AppointmentStatus.PENDING) {
    return;
  }

  const activeDevices = await prisma.pushDevice.findMany({
    where: { disabledAt: null },
    select: { token: true },
  });
  const tokens = activeDevices.map((device) => device.token);
  if (tokens.length === 0) {
    return;
  }

  const serviceNames = appointment.items.map((item) => item.service.name).filter((name) => name.length > 0);
  const serviceSummary = formatServiceSummary(serviceNames);
  const clientName = formatClientName(appointment.client.firstName, appointment.client.lastName);
  const startLabel = formatBrusselsDateTime(appointment.startsAt);

  const title = "Nouvelle demande de RDV 💄";
  const body = `${serviceSummary} — ${startLabel} — ${clientName}`;

  try {
    const result = await sendPushToTokens(tokens, {
      title,
      body,
      data: {
        appointmentId: appointment.id,
        route: "/admin/demandes",
      },
    });

    await logPushEvent({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      recipient: `devices:${tokens.length}`,
      status: "SENT",
      payload: {
        title,
        body,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        disabledCount: result.disabledCount,
      },
    });

    console.log(
      `[push.appointment.pending] sent appointmentId=${appointment.id} sent=${result.sentCount} failed=${result.failedCount} disabled=${result.disabledCount}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown push failure";
    await logPushEvent({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      recipient: `devices:${tokens.length}`,
      status: "FAILED",
      payload: {
        title,
        body,
      },
      errorMessage: message,
    });
    throw error;
  }
}
