import { AppointmentStatus, Role } from "@prisma/client";
import crypto from "crypto";
import { Router } from "express";
import { DateTime } from "luxon";
import { z } from "zod";
import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";
import { BRUSSELS_TIMEZONE, parseHHmm } from "../lib/time";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";
import { authRequired, requireRole } from "../middlewares/auth";

const practitionerStatusSchema = z.enum(["active", "inactive", "stagiaire"]);

const createPractitionerSchema = z
  .object({
    name: z.string().trim().min(1),
    email: z.string().email().optional(),
    status: practitionerStatusSchema.default("active"),
    defaultDiscount: z.number().int().min(0).max(100).nullable().optional(),
    colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    createAccount: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.createAccount && !value.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "email is required when createAccount=true",
      });
    }
  });

const updatePractitionerSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    status: practitionerStatusSchema.optional(),
    defaultDiscount: z.number().int().min(0).max(100).nullable().optional(),
    colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided",
  });

const practitionerStatsParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const practitionerStatsQuerySchema = z.object({
  period: z.enum(["month", "quarter", "year"]).optional(),
});

function splitName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const parts = trimmed.split(" ");

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ");
  return { firstName, lastName };
}

function statusToFlags(status: "active" | "inactive" | "stagiaire") {
  return {
    isActive: status !== "inactive",
    isTrainee: status === "stagiaire",
    roleLabel: status === "stagiaire" ? "Stagiaire" : "Staff",
  };
}

function flagsToStatus(isActive: boolean, isTrainee: boolean): "active" | "inactive" | "stagiaire" {
  if (!isActive) {
    return "inactive";
  }
  if (isTrainee) {
    return "stagiaire";
  }
  return "active";
}

function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

function toDisplayEmail(email: string): string {
  return email.endsWith("@no-login.local") ? "" : email;
}

function getPeriodRange(period: "month" | "quarter" | "year") {
  const nowBrussels = DateTime.now().setZone(BRUSSELS_TIMEZONE);
  const start =
    period === "year"
      ? nowBrussels.startOf("year")
      : period === "quarter"
        ? nowBrussels.startOf("quarter")
        : nowBrussels.startOf("month");
  const end =
    period === "year"
      ? nowBrussels.endOf("year")
      : period === "quarter"
        ? nowBrussels.endOf("quarter")
        : nowBrussels.endOf("month");

  return { nowBrussels, start, end };
}

function countWeekdayOccurrences(start: DateTime, end: DateTime, weekday: number): number {
  let count = 0;
  let cursor = start.startOf("day");
  const endDay = end.startOf("day");

  while (cursor <= endDay) {
    if (cursor.weekday % 7 === weekday) {
      count += 1;
    }
    cursor = cursor.plus({ days: 1 });
  }

  return count;
}

export const adminPractitionersRouter = Router();
adminPractitionersRouter.use(authRequired, requireRole(Role.ADMIN));

adminPractitionersRouter.get("/", async (_req, res) => {
  try {
    const practitioners = await prisma.staffMember.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        isTrainee: true,
        defaultDiscountPercent: true,
        colorHex: true,
        userId: true,
      },
    });

    res.json(
      practitioners.map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        email: toDisplayEmail(p.email),
        status: flagsToStatus(p.isActive, p.isTrainee),
        defaultDiscount: p.defaultDiscountPercent,
        colorHex: p.colorHex,
        userId: p.userId ?? null,
        hasAccount: Boolean(p.userId),
      }))
    );
  } catch (error) {
    console.error("[adminPractitioners.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminPractitionersRouter.get("/:id/stats", async (req, res) => {
  try {
    const { id } = parseOrThrow(practitionerStatsParamsSchema, req.params);
    const query = parseOrThrow(practitionerStatsQuerySchema, req.query);
    const period = query.period ?? "month";
    const { nowBrussels, start, end } = getPeriodRange(period);
    const nowUtc = nowBrussels.toUTC().toJSDate();
    const periodStartUtc = start.toUTC().toJSDate();
    const periodEndUtc = end.toUTC().toJSDate();

    const practitioner = await prisma.staffMember.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        isTrainee: true,
        createdAt: true,
        colorHex: true,
      },
    });

    if (!practitioner) {
      res.status(404).json({ error: "Praticienne introuvable." });
      return;
    }

    const [
      periodAppointments,
      lifetimeAppointments,
      availabilityRules,
      lastAppointment,
      nextAppointment,
      recentHistory,
      serviceItems,
    ] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          staffMemberId: id,
          deletedAt: null,
          startsAt: {
            gte: periodStartUtc,
            lte: periodEndUtc,
          },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          totalPrice: true,
        },
      }),
      prisma.appointment.findMany({
        where: {
          staffMemberId: id,
          deletedAt: null,
          startsAt: { lt: nowUtc },
          status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED] },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          totalPrice: true,
        },
      }),
      prisma.availabilityRule.findMany({
        where: {
          staffMemberId: id,
          isActive: true,
        },
        select: {
          dayOfWeek: true,
          startTime: true,
          endTime: true,
        },
      }),
      prisma.appointment.findFirst({
        where: {
          staffMemberId: id,
          deletedAt: null,
          startsAt: { lt: nowUtc },
        },
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          totalPrice: true,
          client: {
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
          staffMemberId: id,
          deletedAt: null,
          startsAt: { gte: nowUtc },
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          totalPrice: true,
          client: {
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
        where: {
          staffMemberId: id,
          deletedAt: null,
        },
        orderBy: { startsAt: "desc" },
        take: 12,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          totalPrice: true,
          client: {
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
      prisma.appointmentItem.findMany({
        where: {
          appointment: {
            staffMemberId: id,
            deletedAt: null,
            status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED] },
            startsAt: {
              gte: periodStartUtc,
              lte: periodEndUtc,
              lt: nowUtc,
            },
          },
        },
        select: {
          priceCents: true,
          service: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    const periodTotals = {
      appointments: periodAppointments.length,
      pending: periodAppointments.filter((item) => item.status === AppointmentStatus.PENDING).length,
      cancelled: periodAppointments.filter((item) => item.status === AppointmentStatus.CANCELLED).length,
      noShow: periodAppointments.filter((item) => item.status === AppointmentStatus.NO_SHOW).length,
      confirmedLike: periodAppointments.filter(
        (item) =>
          (item.status === AppointmentStatus.CONFIRMED || item.status === AppointmentStatus.COMPLETED) &&
          item.startsAt < nowUtc
      ).length,
    };

    const periodWorkedAppointments = periodAppointments.filter(
      (item) =>
        (item.status === AppointmentStatus.CONFIRMED || item.status === AppointmentStatus.COMPLETED) &&
        item.startsAt < nowUtc
    );
    const periodRevenue = periodWorkedAppointments.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0);
    const periodWorkedMinutes = periodWorkedAppointments.reduce(
      (sum, item) => sum + Math.max(0, (item.endsAt.getTime() - item.startsAt.getTime()) / 60000),
      0
    );
    const periodWorkedDays = new Set(
      periodWorkedAppointments.map((item) =>
        DateTime.fromJSDate(item.startsAt, { zone: "utc" }).setZone(BRUSSELS_TIMEZONE).toFormat("yyyy-MM-dd")
      )
    ).size;

    const lifetimeRevenue = lifetimeAppointments.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0);
    const lifetimeWorkedMinutes = lifetimeAppointments.reduce(
      (sum, item) => sum + Math.max(0, (item.endsAt.getTime() - item.startsAt.getTime()) / 60000),
      0
    );
    const lifetimeWorkedDays = new Set(
      lifetimeAppointments.map((item) =>
        DateTime.fromJSDate(item.startsAt, { zone: "utc" }).setZone(BRUSSELS_TIMEZONE).toFormat("yyyy-MM-dd")
      )
    ).size;

    let scheduledMinutes = 0;
    for (const rule of availabilityRules) {
      const { hour: startHour, minute: startMinute } = parseHHmm(rule.startTime);
      const { hour: endHour, minute: endMinute } = parseHHmm(rule.endTime);
      const durationMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
      if (durationMinutes <= 0) {
        continue;
      }
      scheduledMinutes += durationMinutes * countWeekdayOccurrences(start, end, rule.dayOfWeek);
    }

    const serviceMap = new Map<string, { name: string; count: number; revenue: number }>();
    for (const item of serviceItems) {
      const key = item.service.name;
      const current = serviceMap.get(key) ?? { name: key, count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += item.priceCents / 100;
      serviceMap.set(key, current);
    }

    const topServices = Array.from(serviceMap.values())
      .sort((a, b) => (b.revenue !== a.revenue ? b.revenue - a.revenue : b.count - a.count))
      .slice(0, 5);

    const weekdayMap = new Map<string, number>();
    for (const appointment of periodWorkedAppointments) {
      const label = DateTime.fromJSDate(appointment.startsAt, { zone: "utc" }).setZone(BRUSSELS_TIMEZONE).toFormat("cccc");
      weekdayMap.set(label, (weekdayMap.get(label) ?? 0) + 1);
    }

    const weekdayBreakdown = Array.from(weekdayMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    const mapAppointmentLite = (
      appointment:
        | {
            id: string;
            startsAt: Date;
            endsAt: Date;
            status: string;
            totalPrice: number;
            client: { firstName: string; lastName: string };
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
            clientName: `${appointment.client.firstName} ${appointment.client.lastName}`.trim(),
            services: appointment.items.map((item) => item.service.name),
          }
        : null;

    res.json({
      practitioner: {
        id: practitioner.id,
        name: `${practitioner.firstName} ${practitioner.lastName}`.trim(),
        email: toDisplayEmail(practitioner.email),
        active: practitioner.isActive,
        isTrainee: practitioner.isTrainee,
        createdAt: practitioner.createdAt,
        colorHex: practitioner.colorHex,
      },
      period,
      periodSummary: {
        appointments: periodTotals.appointments,
        confirmedLike: periodTotals.confirmedLike,
        pending: periodTotals.pending,
        cancelled: periodTotals.cancelled,
        noShow: periodTotals.noShow,
        revenue: periodRevenue,
        averageBasket: periodTotals.confirmedLike > 0 ? periodRevenue / periodTotals.confirmedLike : 0,
        workedHours: periodWorkedMinutes / 60,
        workedDays: periodWorkedDays,
        revenuePerWorkedHour: periodWorkedMinutes > 0 ? periodRevenue / (periodWorkedMinutes / 60) : 0,
        revenuePerWorkedDay: periodWorkedDays > 0 ? periodRevenue / periodWorkedDays : 0,
        appointmentsPerWorkedDay: periodWorkedDays > 0 ? periodTotals.confirmedLike / periodWorkedDays : 0,
        scheduledHours: scheduledMinutes / 60,
        utilizationRate: scheduledMinutes > 0 ? periodWorkedMinutes / scheduledMinutes : null,
        revenuePerScheduledHour: scheduledMinutes > 0 ? periodRevenue / (scheduledMinutes / 60) : null,
      },
      lifetimeSummary: {
        confirmedLike: lifetimeAppointments.length,
        revenue: lifetimeRevenue,
        averageBasket: lifetimeAppointments.length > 0 ? lifetimeRevenue / lifetimeAppointments.length : 0,
        workedHours: lifetimeWorkedMinutes / 60,
        workedDays: lifetimeWorkedDays,
        revenuePerWorkedHour: lifetimeWorkedMinutes > 0 ? lifetimeRevenue / (lifetimeWorkedMinutes / 60) : 0,
      },
      timeline: {
        lastAppointment: mapAppointmentLite(lastAppointment),
        nextAppointment: mapAppointmentLite(nextAppointment),
      },
      insights: {
        topServices,
        weekdayBreakdown,
      },
      history: recentHistory.map((appointment) => ({
        id: appointment.id,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        status: appointment.status,
        totalPrice: appointment.totalPrice,
        clientName: `${appointment.client.firstName} ${appointment.client.lastName}`.trim(),
        services: appointment.items.map((item) => item.service.name),
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminPractitioners.stats]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminPractitionersRouter.post("/", async (req, res) => {
  try {
    const payload = parseOrThrow(createPractitionerSchema, req.body);
    const parts = splitName(payload.name);
    const flags = statusToFlags(payload.status);
    const normalizedEmail = payload.email?.toLowerCase();

    let tempPassword: string | null = null;

    const created = await prisma.$transaction(async (tx) => {
      let userId: string | null = null;

      if (payload.createAccount && normalizedEmail) {
        const existing = await tx.user.findUnique({ where: { email: normalizedEmail } });
        if (existing) {
          throw new Error("EMAIL_ALREADY_USED");
        }

        tempPassword = generateTempPassword();
        const passwordHash = await hashPassword(tempPassword);
        const createdUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash,
            role: Role.STAFF,
            isActive: true,
            mustChangePassword: true,
          },
          select: { id: true },
        });
        userId = createdUser.id;
      }

      return tx.staffMember.create({
        data: {
          firstName: parts.firstName,
          lastName: parts.lastName,
          email: normalizedEmail ?? `${crypto.randomUUID()}@no-login.local`,
          role: flags.roleLabel,
          isActive: flags.isActive,
          isTrainee: flags.isTrainee,
          colorHex: payload.colorHex,
          defaultDiscountPercent: payload.defaultDiscount ?? null,
          userId: userId ?? undefined,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          isActive: true,
          isTrainee: true,
          defaultDiscountPercent: true,
          colorHex: true,
          userId: true,
        },
      });
    });

    res.status(201).json({
      id: created.id,
      name: `${created.firstName} ${created.lastName}`.trim(),
      email: toDisplayEmail(created.email),
      status: flagsToStatus(created.isActive, created.isTrainee),
      defaultDiscount: created.defaultDiscountPercent,
      colorHex: created.colorHex,
      userId: created.userId ?? null,
      hasAccount: Boolean(created.userId),
      tempPassword,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (error instanceof Error && error.message === "EMAIL_ALREADY_USED") {
      res.status(409).json({ error: "Email deja utilise." });
      return;
    }

    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({ error: "Email deja utilise." });
      return;
    }

    console.error("[adminPractitioners.create]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminPractitionersRouter.patch("/:id", async (req, res) => {
  try {
    const payload = parseOrThrow(updatePractitionerSchema, req.body);
    const parts = payload.name ? splitName(payload.name) : null;
    const flags = payload.status ? statusToFlags(payload.status) : null;

    const existing = await prisma.staffMember.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Praticienne introuvable." });
      return;
    }

    const updated = await prisma.staffMember.update({
      where: { id: req.params.id },
      data: {
        firstName: parts?.firstName,
        lastName: parts?.lastName,
        email: payload.email?.toLowerCase(),
        isActive: payload.isActive ?? flags?.isActive,
        isTrainee: flags?.isTrainee,
        role: flags?.roleLabel,
        colorHex: payload.colorHex,
        defaultDiscountPercent: payload.defaultDiscount,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        isTrainee: true,
        defaultDiscountPercent: true,
        colorHex: true,
        userId: true,
      },
    });

    if (updated.userId && payload.email) {
      await prisma.user.update({
        where: { id: updated.userId },
        data: { email: payload.email.toLowerCase() },
      });
    }

    res.json({
      id: updated.id,
      name: `${updated.firstName} ${updated.lastName}`.trim(),
      email: toDisplayEmail(updated.email),
      status: flagsToStatus(updated.isActive, updated.isTrainee),
      defaultDiscount: updated.defaultDiscountPercent,
      colorHex: updated.colorHex,
      userId: updated.userId ?? null,
      hasAccount: Boolean(updated.userId),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({ error: "Email deja utilise." });
      return;
    }

    console.error("[adminPractitioners.update]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminPractitionersRouter.patch("/:id/status", async (req, res) => {
  try {
    const payload = parseOrThrow(z.object({ status: practitionerStatusSchema }), req.body);
    const flags = statusToFlags(payload.status);

    const updated = await prisma.staffMember.update({
      where: { id: req.params.id },
      data: {
        isActive: flags.isActive,
        isTrainee: flags.isTrainee,
        role: flags.roleLabel,
      },
      select: {
        id: true,
        isActive: true,
        isTrainee: true,
      },
    });

    res.json({
      id: updated.id,
      status: flagsToStatus(updated.isActive, updated.isTrainee),
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      res.status(404).json({ error: "Praticienne introuvable." });
      return;
    }

    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminPractitioners.updateStatus]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminPractitionersRouter.delete("/:id", async (req, res) => {
  try {
    const existing = await prisma.staffMember.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        userId: true,
        _count: {
          select: {
            appointments: true,
          },
        },
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Praticienne introuvable." });
      return;
    }

    if (existing._count.appointments > 0) {
      res.status(409).json({
        error: "Suppression impossible: cette praticienne a deja des rendez-vous. Desactivez-la a la place.",
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.staffMember.delete({
        where: { id: req.params.id },
      });

      if (existing.userId) {
        await tx.user.delete({
          where: { id: existing.userId },
        });
      }
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[adminPractitioners.delete]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
