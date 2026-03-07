import { AppointmentStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authAdmin } from "../middlewares/authAdmin";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

const optionalString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? value.trim() : undefined))
  .transform((value) => (value && value.length > 0 ? value : undefined));

const listClientsQuerySchema = z.object({
  q: z.string().trim().optional(),
});

const createClientSchema = z
  .object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: optionalString.pipe(z.string().email().optional()),
    phone: optionalString,
    notes: optionalString,
  })
  .superRefine((value, ctx) => {
    if (!value.email && !value.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "email or phone is required",
        path: ["email"],
      });
    }
  });

const updateClientSchema = z
  .object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    email: optionalString.pipe(z.string().email().optional()),
    phone: optionalString,
    notes: optionalString,
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided",
  });

const clientParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const clientAppointmentParamsSchema = z.object({
  id: z.string().trim().min(1),
  appointmentId: z.string().trim().min(1),
});

function mapClient(client: {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    email: client.email,
    phone: client.phone,
    notes: client.notes,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

export const adminClientsRouter = Router();

adminClientsRouter.use(authAdmin);

adminClientsRouter.get("/", async (req, res) => {
  try {
    const query = parseOrThrow(listClientsQuerySchema, req.query);
    const search = query.q?.trim();

    const clients = await prisma.client.findMany({
      where: search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: [{ updatedAt: "desc" }, { firstName: "asc" }, { lastName: "asc" }],
      take: 500,
    });

    res.json(clients.map(mapClient));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminClients.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminClientsRouter.post("/", async (req, res) => {
  try {
    const payload = parseOrThrow(createClientSchema, req.body);

    const created = await prisma.client.create({
      data: {
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email?.toLowerCase() ?? null,
        phone: payload.phone ?? null,
        notes: payload.notes ?? null,
      },
    });

    res.status(201).json(mapClient(created));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ error: "Email ou telephone deja utilise." });
      return;
    }

    console.error("[adminClients.create]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminClientsRouter.get("/:id/stats", async (req, res) => {
  try {
    const { id } = parseOrThrow(clientParamsSchema, req.params);
    const now = new Date();

    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    });

    if (!client) {
      res.status(404).json({ error: "Client introuvable." });
      return;
    }

    const [
      totalAppointments,
      pendingAppointments,
      cancelledAppointments,
      noShowAppointments,
      revenueAgg,
      revenueCount,
      lastAppointment,
      nextAppointment,
      history,
    ] = await Promise.all([
      prisma.appointment.count({
        where: { clientId: id },
      }),
      prisma.appointment.count({
        where: { clientId: id, status: AppointmentStatus.PENDING },
      }),
      prisma.appointment.count({
        where: { clientId: id, status: AppointmentStatus.CANCELLED },
      }),
      prisma.appointment.count({
        where: { clientId: id, status: AppointmentStatus.NO_SHOW },
      }),
      prisma.appointment.aggregate({
        where: {
          clientId: id,
          status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED] },
          startsAt: { lt: now },
        },
        _sum: { totalPrice: true },
      }),
      prisma.appointment.count({
        where: {
          clientId: id,
          status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED] },
          startsAt: { lt: now },
        },
      }),
      prisma.appointment.findFirst({
        where: {
          clientId: id,
          startsAt: { lt: now },
        },
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          totalPrice: true,
          staffMember: {
            select: {
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
      prisma.appointment.findFirst({
        where: {
          clientId: id,
          startsAt: { gte: now },
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          totalPrice: true,
          staffMember: {
            select: {
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
      prisma.appointment.findMany({
        where: { clientId: id },
        orderBy: { startsAt: "desc" },
        take: 50,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          createdAt: true,
          status: true,
          totalPrice: true,
          notes: true,
          staffMember: {
            select: {
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

    const confirmedLikeAppointments = Math.max(
      0,
      totalAppointments - pendingAppointments - cancelledAppointments
    );
    const cancellationDenominator = confirmedLikeAppointments + cancelledAppointments;
    const cancellationRate = cancellationDenominator > 0 ? cancelledAppointments / cancellationDenominator : 0;
    const revenueTotal = revenueAgg._sum.totalPrice ?? 0;
    const averageBasket = revenueCount > 0 ? revenueTotal / revenueCount : 0;

    const mapAppointmentLite = (
      appointment:
        | {
            id: string;
            startsAt: Date;
            endsAt: Date;
            status: AppointmentStatus;
            totalPrice: number;
            staffMember: { firstName: string; lastName: string };
            items: Array<{ service: { name: string } }>;
          }
        | null
    ) =>
      appointment
        ? {
            id: appointment.id,
            startsAt: appointment.startsAt,
            endsAt: appointment.endsAt,
            status: appointment.status,
            totalPrice: appointment.totalPrice,
            staffName: `${appointment.staffMember.firstName} ${appointment.staffMember.lastName}`.trim(),
            services: appointment.items.map((item) => item.service.name),
          }
        : null;

    res.json({
      client: {
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone,
        createdAt: client.createdAt,
      },
      totals: {
        appointments: totalAppointments,
        pending: pendingAppointments,
        cancelled: cancelledAppointments,
        noShow: noShowAppointments,
        confirmedLike: confirmedLikeAppointments,
      },
      revenue: {
        total: revenueTotal,
        averageBasket,
      },
      rates: {
        cancellation: cancellationRate,
      },
      timeline: {
        lastAppointment: mapAppointmentLite(lastAppointment),
        nextAppointment: mapAppointmentLite(nextAppointment),
      },
      history: history.map((appointment) => ({
        id: appointment.id,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        createdAt: appointment.createdAt,
        status: appointment.status,
        totalPrice: appointment.totalPrice,
        notes: appointment.notes,
        staffName: `${appointment.staffMember.firstName} ${appointment.staffMember.lastName}`.trim(),
        services: appointment.items.map((item) => item.service.name),
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }
    console.error("[adminClients.stats]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminClientsRouter.delete("/:id/appointments/:appointmentId", async (req, res) => {
  try {
    const { id, appointmentId } = parseOrThrow(clientAppointmentParamsSchema, req.params);

    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!client) {
      res.status(404).json({ error: "Client introuvable." });
      return;
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        clientId: id,
      },
      select: { id: true },
    });

    if (!appointment) {
      res.status(404).json({ error: "Rendez-vous introuvable." });
      return;
    }

    await prisma.appointment.delete({
      where: { id: appointment.id },
    });

    res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminClients.deleteAppointment]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminClientsRouter.patch("/:id", async (req, res) => {
  try {
    const payload = parseOrThrow(updateClientSchema, req.body);

    const existing = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        notes: true,
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Client introuvable." });
      return;
    }

    const merged = {
      firstName: payload.firstName ?? existing.firstName,
      lastName: payload.lastName ?? existing.lastName,
      email: payload.email ?? existing.email ?? undefined,
      phone: payload.phone ?? existing.phone ?? undefined,
      notes: payload.notes ?? existing.notes ?? undefined,
    };

    if (!merged.email && !merged.phone) {
      res.status(400).json({ error: "email or phone is required" });
      return;
    }

    const updated = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        firstName: merged.firstName,
        lastName: merged.lastName,
        email: merged.email?.toLowerCase() ?? null,
        phone: merged.phone ?? null,
        notes: merged.notes ?? null,
      },
    });

    res.json(mapClient(updated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ error: "Email ou telephone deja utilise." });
      return;
    }

    console.error("[adminClients.update]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminClientsRouter.delete("/:id", async (req, res) => {
  try {
    const existing = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Client introuvable." });
      return;
    }

    const appointmentsCount = await prisma.appointment.count({
      where: { clientId: req.params.id },
    });

    if (appointmentsCount > 0) {
      res
        .status(409)
        .json({ error: "Suppression impossible: la cliente a deja des rendez-vous." });
      return;
    }

    await prisma.client.delete({
      where: { id: req.params.id },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[adminClients.delete]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
