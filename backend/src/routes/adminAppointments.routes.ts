import { AppointmentStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authAdmin } from "../middlewares/authAdmin";
import { isSlotAvailable } from "../services/appointments/availability";
import { sendConfirmedIfNeeded, sendRejectedIfNeeded } from "../services/email/appointmentEmails";
import {
  sendAppointmentCancellationSms,
  sendAppointmentConfirmationSms,
  sendAppointmentRescheduleSms,
} from "../jobs/appointmentSmsReminders.job";

const rejectSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const upsertSchema = z.object({
  practitionerId: z.string().min(1),
  startAt: z.string().datetime({ offset: true }),
  durationMin: z.number().int().positive(),
  services: z
    .array(
      z.object({
        serviceId: z.string().min(1),
        name: z.string().optional(),
        durationMin: z.number().int().positive().optional(),
        price: z.number().nonnegative().optional(),
      })
    )
    .min(1),
  clientId: z.string().min(1).optional(),
  clientDraft: z
    .object({
      firstName: z.string().trim().min(1),
      lastName: z.string().trim().min(1),
      phone: z.string().trim().optional(),
      email: z.string().trim().email().optional(),
    })
    .optional(),
  notes: z.string().optional(),
  status: z.enum(["confirmed", "pending", "blocked", "cancelled"]),
});

const conflictQuerySchema = z.object({
  practitionerId: z.string().min(1),
  startAt: z.string().datetime({ offset: true }),
  durationMin: z.coerce.number().int().positive(),
  excludeAppointmentId: z.string().min(1).optional(),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["all", "confirmed", "pending", "cancelled", "noShow", "completed", "deleted"]).optional(),
  q: z.string().trim().optional(),
});

function toDraftStatus(status: AppointmentStatus): "confirmed" | "pending" | "blocked" | "cancelled" {
  if (status === AppointmentStatus.PENDING) {
    return "pending";
  }
  if (status === AppointmentStatus.NO_SHOW) {
    return "blocked";
  }
  if (status === AppointmentStatus.CANCELLED) {
    return "cancelled";
  }
  return "confirmed";
}

function fromDraftStatus(status: "confirmed" | "pending" | "blocked" | "cancelled"): AppointmentStatus {
  if (status === "pending") {
    return AppointmentStatus.PENDING;
  }
  if (status === "blocked") {
    return AppointmentStatus.NO_SHOW;
  }
  if (status === "cancelled") {
    return AppointmentStatus.CANCELLED;
  }
  return AppointmentStatus.CONFIRMED;
}

export const adminAppointmentsRouter = Router();
adminAppointmentsRouter.use(authAdmin);

adminAppointmentsRouter.get("/appointments/history", async (req, res) => {
  try {
    const query = historyQuerySchema.parse(req.query ?? {});
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.q?.trim();
    const status = query.status ?? "all";

    const where = {
      ...(search
        ? {
            OR: [
              { client: { firstName: { contains: search, mode: "insensitive" as const } } },
              { client: { lastName: { contains: search, mode: "insensitive" as const } } },
              { staffMember: { firstName: { contains: search, mode: "insensitive" as const } } },
              { staffMember: { lastName: { contains: search, mode: "insensitive" as const } } },
              { notes: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(status === "deleted"
        ? { deletedAt: { not: null } }
        : status === "confirmed"
          ? { status: AppointmentStatus.CONFIRMED, deletedAt: null }
          : status === "pending"
            ? { status: AppointmentStatus.PENDING, deletedAt: null }
            : status === "cancelled"
              ? { status: AppointmentStatus.CANCELLED, deletedAt: null }
              : status === "noShow"
                ? { status: AppointmentStatus.NO_SHOW, deletedAt: null }
                : status === "completed"
                  ? { status: AppointmentStatus.COMPLETED, deletedAt: null }
                  : {}),
    };

    const [total, items] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          deletedAt: true,
          canceledAt: true,
          totalPrice: true,
          notes: true,
          createdAt: true,
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
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
            orderBy: { order: "asc" },
            select: {
              service: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: items.map((item) => ({
        id: item.id,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        status: item.status,
        deletedAt: item.deletedAt,
        canceledAt: item.canceledAt,
        totalPrice: item.totalPrice,
        notes: item.notes,
        createdAt: item.createdAt,
        client: {
          id: item.client.id,
          name: `${item.client.firstName} ${item.client.lastName}`.trim(),
          phone: item.client.phone,
          email: item.client.email,
        },
        staff: {
          id: item.staffMember.id,
          name: `${item.staffMember.firstName} ${item.staffMember.lastName}`.trim(),
        },
        services: item.items.map((serviceItem) => serviceItem.service.name),
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid history query" });
      return;
    }
    console.error("[adminAppointments.history]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAppointmentsRouter.post("/appointments", async (req, res) => {
  try {
    const payload = upsertSchema.parse(req.body ?? {});
    const startAtUtc = new Date(payload.startAt);
    if (Number.isNaN(startAtUtc.getTime())) {
      res.status(400).json({ error: "Invalid startAt" });
      return;
    }

    const uniqueServiceIds = Array.from(new Set(payload.services.map((service) => service.serviceId)));

    const created = await prisma.$transaction(async (tx) => {
      const activeServices = await tx.service.findMany({
        where: {
          id: { in: uniqueServiceIds },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          durationMin: true,
          priceCents: true,
        },
      });
      const byId = new Map(activeServices.map((service) => [service.id, service]));
      if (activeServices.length !== uniqueServiceIds.length) {
        throw new Error("One or more services are inactive or missing");
      }

      const items = payload.services.map((service, index) => {
        const linked = byId.get(service.serviceId)!;
        return {
          order: index,
          serviceId: linked.id,
          serviceName: linked.name,
          durationMin: linked.durationMin,
          priceCents: Math.max(0, Math.round((service.price ?? linked.priceCents / 100) * 100)),
        };
      });

      const totalDurationMin = items.reduce((sum, item) => sum + item.durationMin, 0);
      const totalPriceCents = items.reduce((sum, item) => sum + item.priceCents, 0);
      const endAtUtc = new Date(startAtUtc.getTime() + totalDurationMin * 60_000);

      const available = await isSlotAvailable({
        practitionerId: payload.practitionerId,
        startAtUtc,
        durationMin: totalDurationMin,
      });
      if (!available) {
        throw new Error("Conflict: slot is not available");
      }

      const selectedClientId = payload.clientId;
      let client = selectedClientId
        ? await tx.client.findUnique({
            where: { id: selectedClientId },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          })
        : null;

      if (!client && !payload.clientDraft) {
        throw new Error("Client not found");
      }

      if (!client && payload.clientDraft) {
        const clientEmail = payload.clientDraft.email?.trim().toLowerCase() || undefined;
        const clientPhone = payload.clientDraft.phone?.trim() || undefined;
        const [clientByEmail, clientByPhone] = await Promise.all([
          clientEmail ? tx.client.findUnique({ where: { email: clientEmail } }) : Promise.resolve(null),
          clientPhone ? tx.client.findUnique({ where: { phone: clientPhone } }) : Promise.resolve(null),
        ]);

        if (clientByEmail && clientByPhone && clientByEmail.id !== clientByPhone.id) {
          throw new Error("Client identity conflict");
        }

        client = clientByEmail ?? clientByPhone;

        if (!client) {
          client = await tx.client.create({
            data: {
              firstName: payload.clientDraft.firstName.trim(),
              lastName: payload.clientDraft.lastName.trim(),
              phone: clientPhone ?? null,
              email: clientEmail ?? null,
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          });
        } else {
          client = await tx.client.update({
            where: { id: client.id },
            data: {
              firstName: payload.clientDraft.firstName.trim(),
              lastName: payload.clientDraft.lastName.trim(),
              phone: clientPhone ?? client.phone ?? null,
              email: clientEmail ?? client.email ?? null,
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          });
        }
      } else if (client && payload.clientDraft) {
        const clientPhone = payload.clientDraft.phone?.trim() || client.phone || undefined;
        const clientEmail = payload.clientDraft.email?.trim().toLowerCase() || client.email || undefined;

        client = await tx.client.update({
          where: { id: client.id },
          data: {
            firstName: payload.clientDraft.firstName.trim(),
            lastName: payload.clientDraft.lastName.trim(),
            phone: clientPhone ?? null,
            email: clientEmail ?? null,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        });
      }

      if (!client) {
        throw new Error("Client not found");
      }

      const appointment = await tx.appointment.create({
        data: {
          staffMemberId: payload.practitionerId,
          clientId: client.id,
          startsAt: startAtUtc,
          endsAt: endAtUtc,
          totalPrice: totalPriceCents / 100,
          notes: payload.notes ?? null,
          status: AppointmentStatus.CONFIRMED,
          confirmedAt: new Date(),
          canceledAt: null,
          clientPhone: payload.clientDraft?.phone?.trim() || client.phone || null,
          smsConsent: true,
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          notes: true,
          status: true,
          staffMember: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
        },
      });

      await tx.appointmentItem.createMany({
        data: items.map((item) => ({
          appointmentId: appointment.id,
          serviceId: item.serviceId,
          order: item.order,
          durationMin: item.durationMin,
          priceCents: item.priceCents,
        })),
      });

      return {
        id: appointment.id,
        practitionerId: appointment.staffMember.id,
        practitionerName: `${appointment.staffMember.firstName} ${appointment.staffMember.lastName}`.trim(),
        startAt: appointment.startsAt,
        durationMin: totalDurationMin,
        services: items.map((item) => ({
          serviceId: item.serviceId,
          name: item.serviceName,
          durationMin: item.durationMin,
          price: item.priceCents / 100,
        })),
        clientId: appointment.client.id,
        clientName: `${appointment.client.firstName} ${appointment.client.lastName}`.trim(),
        clientPhone: appointment.client.phone ?? undefined,
        clientEmail: appointment.client.email ?? undefined,
        notes: appointment.notes ?? undefined,
        status: toDraftStatus(appointment.status),
      };
    });

    res.status(201).json(created);
    void sendConfirmedIfNeeded(created.id);
    void sendAppointmentConfirmationSms(created.id);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid appointment payload" });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.toLowerCase().includes("conflict")) {
      res.status(409).json({ error: "Conflit detecte: ce creneau est deja pris." });
      return;
    }
    if (message.toLowerCase().includes("client")) {
      res.status(400).json({ error: "Cliente introuvable." });
      return;
    }
    if (message.toLowerCase().includes("service")) {
      res.status(400).json({ error: "Un ou plusieurs services sont invalides." });
      return;
    }
    console.error("[adminAppointments.post]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAppointmentsRouter.get("/appointments/conflicts", async (req, res) => {
  try {
    const query = conflictQuerySchema.parse(req.query);
    const startAtUtc = new Date(query.startAt);
    if (Number.isNaN(startAtUtc.getTime())) {
      res.status(400).json({ error: "Invalid startAt" });
      return;
    }

    const available = await isSlotAvailable({
      practitionerId: query.practitionerId,
      startAtUtc,
      durationMin: query.durationMin,
      excludeAppointmentId: query.excludeAppointmentId,
    });

    if (available) {
      res.json({ conflict: false });
      return;
    }

    const endAtUtc = new Date(startAtUtc.getTime() + query.durationMin * 60_000);
    const overlapping = await prisma.appointment.findFirst({
      where: {
        staffMemberId: query.practitionerId,
        id: query.excludeAppointmentId ? { not: query.excludeAppointmentId } : undefined,
        deletedAt: null,
        status: { not: AppointmentStatus.CANCELLED },
        startsAt: { lt: endAtUtc },
        endsAt: { gt: startAtUtc },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        notes: true,
        staffMember: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          orderBy: { order: "asc" },
          select: {
            durationMin: true,
            priceCents: true,
            service: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!overlapping) {
      res.json({ conflict: true });
      return;
    }

    const durationMin = Math.max(
      1,
      Math.round(
        DateTime.fromJSDate(overlapping.endsAt).diff(DateTime.fromJSDate(overlapping.startsAt), "minutes").minutes
      )
    );

    res.json({
      conflict: true,
      conflictWith: {
        id: overlapping.id,
        practitionerId: overlapping.staffMember.id,
        practitionerName: `${overlapping.staffMember.firstName} ${overlapping.staffMember.lastName}`.trim(),
        startAt: overlapping.startsAt,
        durationMin,
        services: overlapping.items.map((item) => ({
          serviceId: item.service.id,
          name: item.service.name,
          durationMin: item.durationMin,
          price: item.priceCents / 100,
        })),
        clientId: overlapping.client.id,
        clientName: `${overlapping.client.firstName} ${overlapping.client.lastName}`.trim(),
        notes: overlapping.notes ?? undefined,
        status: toDraftStatus(overlapping.status),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid conflict query" });
      return;
    }
    console.error("[adminAppointments.conflicts]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAppointmentsRouter.delete("/appointments/:id", async (req, res) => {
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
        deletedAt: true,
      },
    });

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    if (appointment.deletedAt) {
      res.json({ ok: true });
      return;
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        deletedAt: new Date(),
      },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[adminAppointments.delete]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAppointmentsRouter.post("/appointments/:id/cancel", async (req, res) => {
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
        deletedAt: true,
      },
    });

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    if (appointment.deletedAt) {
      res.status(409).json({ error: "Impossible d'annuler un rendez-vous supprime." });
      return;
    }

    if (appointment.status === AppointmentStatus.CANCELLED) {
      res.json({ ok: true, status: AppointmentStatus.CANCELLED });
      return;
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: AppointmentStatus.CANCELLED,
        canceledAt: new Date(),
        deletedAt: null,
      },
    });

    res.json({ ok: true, status: AppointmentStatus.CANCELLED });
    void sendAppointmentCancellationSms(appointment.id);
  } catch (error) {
    console.error("[adminAppointments.cancel]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAppointmentsRouter.post("/appointments/:id/restore", async (req, res) => {
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
        deletedAt: true,
        startsAt: true,
        endsAt: true,
        staffMemberId: true,
        confirmedAt: true,
      },
    });

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    if (appointment.deletedAt) {
      res.status(409).json({ error: "Impossible de desannuler un rendez-vous supprime." });
      return;
    }

    if (appointment.status !== AppointmentStatus.CANCELLED) {
      res.json({ ok: true, status: appointment.status });
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
      res.status(409).json({
        error: "Impossible de desannuler: le creneau est deja repris par un autre rendez-vous.",
      });
      return;
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: AppointmentStatus.CONFIRMED,
        canceledAt: null,
        deletedAt: null,
        confirmedAt: appointment.confirmedAt ?? new Date(),
      },
    });

    res.json({ ok: true, status: AppointmentStatus.CONFIRMED });
  } catch (error) {
    console.error("[adminAppointments.restore]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAppointmentsRouter.post("/appointments/:id/undelete", async (req, res) => {
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
        deletedAt: true,
        startsAt: true,
        endsAt: true,
        staffMemberId: true,
      },
    });

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    if (!appointment.deletedAt) {
      res.json({ ok: true, status: appointment.status });
      return;
    }

    const needsAvailabilityCheck =
      appointment.status === AppointmentStatus.CONFIRMED || appointment.status === AppointmentStatus.PENDING;

    if (needsAvailabilityCheck) {
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
        res.status(409).json({
          error: "Impossible de restaurer: le creneau est deja repris par un autre rendez-vous.",
        });
        return;
      }
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        deletedAt: null,
      },
    });

    res.json({ ok: true, status: appointment.status });
  } catch (error) {
    console.error("[adminAppointments.undelete]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAppointmentsRouter.patch("/appointments/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!id) {
      res.status(400).json({ error: "Missing appointment id" });
      return;
    }

    const payload = upsertSchema.parse(req.body ?? {});
    const startAtUtc = new Date(payload.startAt);
    if (Number.isNaN(startAtUtc.getTime())) {
      res.status(400).json({ error: "Invalid startAt" });
      return;
    }

    const uniqueServiceIds = Array.from(new Set(payload.services.map((service) => service.serviceId)));

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.appointment.findUnique({
        where: { id },
        select: {
          id: true,
          clientId: true,
          status: true,
          canceledAt: true,
          deletedAt: true,
          staffMemberId: true,
          startsAt: true,
          endsAt: true,
        },
      });

      if (!existing) {
        return null;
      }

      if (existing.deletedAt) {
        throw new Error("Appointment deleted");
      }

      const activeServices = await tx.service.findMany({
        where: {
          id: { in: uniqueServiceIds },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          durationMin: true,
          priceCents: true,
        },
      });
      const byId = new Map(activeServices.map((service) => [service.id, service]));
      if (activeServices.length !== uniqueServiceIds.length) {
        throw new Error("One or more services are inactive or missing");
      }

      const items = payload.services.map((service, index) => {
        const linked = byId.get(service.serviceId)!;
        return {
          order: index,
          serviceId: linked.id,
          serviceName: linked.name,
          durationMin: linked.durationMin,
          priceCents: Math.max(0, Math.round((service.price ?? linked.priceCents / 100) * 100)),
        };
      });

      const totalDurationMin = items.reduce((sum, item) => sum + item.durationMin, 0);
      const totalPriceCents = items.reduce((sum, item) => sum + item.priceCents, 0);
      const endAtUtc = new Date(startAtUtc.getTime() + totalDurationMin * 60_000);

      const available = await isSlotAvailable({
        practitionerId: payload.practitionerId,
        startAtUtc,
        durationMin: totalDurationMin,
        excludeAppointmentId: id,
      });
      if (!available) {
        throw new Error("Conflict: slot is not available");
      }

      const selectedClientId = payload.clientId ?? existing.clientId;
      const client = await tx.client.findUnique({
        where: { id: selectedClientId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      });
      if (!client) {
        throw new Error("Client not found");
      }

      const clientDraft = payload.clientDraft;
      const clientFirstName = clientDraft?.firstName?.trim() || client.firstName;
      const clientLastName = clientDraft?.lastName?.trim() || client.lastName;
      const clientPhone = clientDraft?.phone?.trim() || client.phone || undefined;
      const clientEmail = clientDraft?.email?.trim().toLowerCase() || client.email || undefined;

      await tx.client.update({
        where: { id: client.id },
        data: {
          firstName: clientFirstName,
          lastName: clientLastName,
          phone: clientPhone ?? null,
          email: clientEmail ?? null,
        },
      });

      const nextStatus = fromDraftStatus(payload.status);
      const nextCanceledAt =
        nextStatus === AppointmentStatus.CANCELLED
          ? existing.status === AppointmentStatus.CANCELLED
            ? existing.canceledAt ?? new Date()
            : new Date()
          : null;
      const appointment = await tx.appointment.update({
        where: { id },
        data: {
          staffMemberId: payload.practitionerId,
          clientId: client.id,
          startsAt: startAtUtc,
          endsAt: endAtUtc,
          totalPrice: totalPriceCents / 100,
          notes: payload.notes ?? null,
          status: nextStatus,
          canceledAt: nextCanceledAt,
          confirmedAt:
            nextStatus === AppointmentStatus.CONFIRMED
              ? existing.status === AppointmentStatus.CONFIRMED
                ? undefined
                : new Date()
              : null,
          rejectedAt: nextStatus === AppointmentStatus.PENDING ? null : undefined,
          rejectedReason: nextStatus === AppointmentStatus.PENDING ? null : undefined,
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          notes: true,
          status: true,
          staffMember: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      await tx.appointmentItem.deleteMany({
        where: { appointmentId: appointment.id },
      });

      await tx.appointmentItem.createMany({
        data: items.map((item) => ({
          appointmentId: appointment.id,
          serviceId: item.serviceId,
          order: item.order,
          durationMin: item.durationMin,
          priceCents: item.priceCents,
        })),
      });

      return {
        id: appointment.id,
        practitionerId: appointment.staffMember.id,
        practitionerName: `${appointment.staffMember.firstName} ${appointment.staffMember.lastName}`.trim(),
        startAt: appointment.startsAt,
        durationMin: totalDurationMin,
        services: items.map((item) => ({
          serviceId: item.serviceId,
          name: item.serviceName,
          durationMin: item.durationMin,
          price: item.priceCents / 100,
        })),
        clientId: appointment.client.id,
        clientName: `${appointment.client.firstName} ${appointment.client.lastName}`.trim(),
        notes: appointment.notes ?? undefined,
        status: toDraftStatus(appointment.status),
        shouldSendRescheduleSms:
          existing.status === AppointmentStatus.CONFIRMED &&
          appointment.status === AppointmentStatus.CONFIRMED &&
          (existing.staffMemberId !== payload.practitionerId ||
            existing.startsAt.getTime() !== startAtUtc.getTime() ||
            existing.endsAt.getTime() !== endAtUtc.getTime()),
      };
    });

    if (!updated) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    res.json(updated);
    if (updated.shouldSendRescheduleSms) {
      void sendAppointmentRescheduleSms(updated.id);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid appointment payload" });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.toLowerCase().includes("conflict")) {
      res.status(409).json({ error: "Conflit detecte: ce creneau est deja pris." });
      return;
    }
    if (message.toLowerCase().includes("client")) {
      res.status(400).json({ error: "Cliente introuvable." });
      return;
    }
    if (message.toLowerCase().includes("service")) {
      res.status(400).json({ error: "Un ou plusieurs services sont invalides." });
      return;
    }
    console.error("[adminAppointments.patch]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAppointmentsRouter.get("/appointments/pending", async (_req, res) => {
  try {
    const items = await prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.PENDING,
        canceledAt: null,
        deletedAt: null,
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
        deletedAt: true,
        startsAt: true,
        endsAt: true,
        staffMemberId: true,
      },
    });

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    if (appointment.deletedAt) {
      res.status(409).json({ error: "Appointment was deleted" });
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
      sendAppointmentConfirmationSms(appointment.id),
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
        deletedAt: true,
      },
    });

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    if (appointment.deletedAt) {
      res.status(409).json({ error: "Appointment was deleted" });
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
