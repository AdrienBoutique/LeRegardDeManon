import { AppointmentStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authAdmin } from "../middlewares/authAdmin";
import { isSlotAvailable } from "../services/appointments/availability";
import { sendConfirmedIfNeeded, sendRejectedIfNeeded } from "../services/email/appointmentEmails";
import { sendConfirmationSmsIfNeeded } from "../services/sms/appointmentSms";

const rejectSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const adminAppointmentsRouter = Router();
adminAppointmentsRouter.use(authAdmin);

adminAppointmentsRouter.get("/appointments/pending", async (_req, res) => {
  try {
    const items = await prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.PENDING,
        canceledAt: null,
      },
      orderBy: {
        startsAt: "asc",
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        notes: true,
        client: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        staffMember: {
          select: {
            id: true,
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
                id: true,
                name: true,
              },
            },
            durationMin: true,
          },
        },
      },
    });

    res.json(
      items.map((item) => ({
        id: item.id,
        startAt: item.startsAt,
        endAt: item.endsAt,
        durationMin: Math.max(
          1,
          Math.round(DateTime.fromJSDate(item.endsAt).diff(DateTime.fromJSDate(item.startsAt), "minutes").minutes)
        ),
        notes: item.notes,
        clientName: `${item.client.firstName} ${item.client.lastName}`.trim(),
        clientEmail: item.client.email,
        clientPhone: item.client.phone,
        practitionerId: item.staffMember.id,
        practitionerName: `${item.staffMember.firstName} ${item.staffMember.lastName}`.trim(),
        services: item.items.map((serviceItem) => ({
          id: serviceItem.service.id,
          name: serviceItem.service.name,
          durationMin: serviceItem.durationMin,
        })),
      }))
    );
  } catch (error) {
    console.error("[adminAppointments.pending]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAppointmentsRouter.post("/appointments/:id/accept", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!id) {
      res.status(400).json({ error: "Missing appointment id" });
      return;
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        staffMemberId: true,
      },
    });

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    if (appointment.status !== AppointmentStatus.PENDING) {
      res.status(409).json({ error: "Only pending appointments can be accepted" });
      return;
    }

    const durationMin = Math.max(
      1,
      Math.round(DateTime.fromJSDate(appointment.endsAt).diff(DateTime.fromJSDate(appointment.startsAt), "minutes").minutes)
    );
    const available = await isSlotAvailable({
      practitionerId: appointment.staffMemberId,
      startAtUtc: appointment.startsAt,
      durationMin,
      excludeAppointmentId: appointment.id,
    });
    if (!available) {
      res.status(409).json({ error: "Slot is no longer available" });
      return;
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: AppointmentStatus.CONFIRMED,
        confirmedAt: new Date(),
        rejectedReason: null,
        rejectedAt: null,
      },
    });

    const [emailResult, smsResult] = await Promise.all([
      sendConfirmedIfNeeded(appointment.id),
      sendConfirmationSmsIfNeeded(appointment.id),
    ]);
    res.json({
      ok: true,
      status: AppointmentStatus.CONFIRMED,
      email: emailResult,
      sms: smsResult,
    });
  } catch (error) {
    console.error("[adminAppointments.accept]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAppointmentsRouter.post("/appointments/:id/reject", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!id) {
      res.status(400).json({ error: "Missing appointment id" });
      return;
    }
    const payload = rejectSchema.parse(req.body ?? {});

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
      },
    });

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    if (appointment.status !== AppointmentStatus.PENDING) {
      res.status(409).json({ error: "Only pending appointments can be rejected" });
      return;
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: AppointmentStatus.REJECTED,
        rejectedAt: new Date(),
        rejectedReason: payload.reason || null,
      },
    });

    const emailResult = await sendRejectedIfNeeded(appointment.id);
    res.json({
      ok: true,
      status: AppointmentStatus.REJECTED,
      email: emailResult,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid reason" });
      return;
    }
    console.error("[adminAppointments.reject]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
