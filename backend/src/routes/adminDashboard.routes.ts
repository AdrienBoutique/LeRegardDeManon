import { AppointmentStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { BRUSSELS_TIMEZONE } from "../lib/time";
import { authAdmin } from "../middlewares/authAdmin";

export const adminDashboardRouter = Router();

adminDashboardRouter.use(authAdmin);

async function sumRevenueForRange(startUtc: Date, endUtc: Date): Promise<number> {
  const revenueAgg = await prisma.appointmentItem.aggregate({
    where: {
      appointment: {
        status: AppointmentStatus.CONFIRMED,
        startsAt: {
          gte: startUtc,
          lte: endUtc,
        },
      },
    },
    _sum: {
      priceCents: true,
    },
  });

  const totalCents = revenueAgg._sum.priceCents ?? 0;
  return totalCents / 100;
}

adminDashboardRouter.get("/dashboard", async (_req, res) => {
  try {
    const nowBrussels = DateTime.now().setZone(BRUSSELS_TIMEZONE);
    const dayStartUtc = nowBrussels.startOf("day").toUTC().toJSDate();
    const dayEndUtc = nowBrussels.endOf("day").toUTC().toJSDate();
    const weekStartUtc = nowBrussels.startOf("week").toUTC().toJSDate();
    const weekEndUtc = nowBrussels.endOf("week").toUTC().toJSDate();
    const nowUtc = nowBrussels.toUTC().toJSDate();

    const [
      pendingCount,
      todayCount,
      nextAppointmentRaw,
      weekAppointments,
      todayRevenue,
      weekRevenue,
    ] = await Promise.all([
      prisma.appointment.count({
        where: {
          status: AppointmentStatus.PENDING,
        },
      }),
      prisma.appointment.count({
        where: {
          status: AppointmentStatus.CONFIRMED,
          startsAt: {
            gte: dayStartUtc,
            lte: dayEndUtc,
          },
        },
      }),
      prisma.appointment.findFirst({
        where: {
          status: AppointmentStatus.CONFIRMED,
          startsAt: {
            gt: nowUtc,
          },
        },
        orderBy: {
          startsAt: "asc",
        },
        select: {
          id: true,
          startsAt: true,
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
        },
      }),
      prisma.appointment.count({
        where: {
          status: AppointmentStatus.CONFIRMED,
          startsAt: {
            gte: weekStartUtc,
            lte: weekEndUtc,
          },
        },
      }),
      sumRevenueForRange(dayStartUtc, dayEndUtc),
      sumRevenueForRange(weekStartUtc, weekEndUtc),
    ]);

    const nextAppointment = nextAppointmentRaw
      ? {
          id: nextAppointmentRaw.id,
          startAt: nextAppointmentRaw.startsAt,
          clientName: `${nextAppointmentRaw.client.firstName} ${nextAppointmentRaw.client.lastName}`.trim(),
          serviceName: nextAppointmentRaw.items.map((item) => item.service.name).join(" + "),
        }
      : null;

    res.json({
      pendingCount,
      todayCount,
      nextAppointment,
      revenue: {
        today: todayRevenue,
        week: weekRevenue,
      },
      stats: {
        weekAppointments,
      },
    });
  } catch (error) {
    console.error("[admin.dashboard.get]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
