import { AppointmentStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { BRUSSELS_TIMEZONE } from "../lib/time";
import { authAdmin } from "../middlewares/authAdmin";

export const adminDashboardRouter = Router();

adminDashboardRouter.use(authAdmin);

async function sumRevenueForRange(startUtc: Date, endUtc: Date, nowUtc: Date): Promise<number> {
  const revenueAgg = await prisma.appointment.aggregate({
    where: {
      status: AppointmentStatus.CONFIRMED,
      startsAt: {
        gte: startUtc,
        lte: endUtc,
        lt: nowUtc,
      },
    },
    _sum: { totalPrice: true },
  });

  return revenueAgg._sum.totalPrice ?? 0;
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
      sumRevenueForRange(dayStartUtc, dayEndUtc, nowUtc),
      sumRevenueForRange(weekStartUtc, weekEndUtc, nowUtc),
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

adminDashboardRouter.get("/dashboard/advanced", async (_req, res) => {
  try {
    const nowBrussels = DateTime.now().setZone(BRUSSELS_TIMEZONE);
    const nowUtc = nowBrussels.toUTC().toJSDate();

    const dayStartUtc = nowBrussels.startOf("day").toUTC().toJSDate();
    const dayEndUtc = nowBrussels.endOf("day").toUTC().toJSDate();
    const weekStartUtc = nowBrussels.startOf("week").toUTC().toJSDate();
    const weekEndUtc = nowBrussels.endOf("week").toUTC().toJSDate();
    const monthStartUtc = nowBrussels.startOf("month").toUTC().toJSDate();
    const monthEndUtc = nowBrussels.endOf("month").toUTC().toJSDate();
    const last7StartUtc = nowBrussels.minus({ days: 6 }).startOf("day").toUTC().toJSDate();

    const [todayRevenue, weekRevenue, monthRevenue, averageBasketAgg] = await Promise.all([
      sumRevenueForRange(dayStartUtc, dayEndUtc, nowUtc),
      sumRevenueForRange(weekStartUtc, weekEndUtc, nowUtc),
      sumRevenueForRange(monthStartUtc, monthEndUtc, nowUtc),
      prisma.appointment.aggregate({
        where: {
          status: AppointmentStatus.CONFIRMED,
          startsAt: { lt: nowUtc },
        },
        _avg: {
          totalPrice: true,
        },
      }),
    ]);

    const weekStatusCounts = await prisma.appointment.groupBy({
      by: ["status"],
      where: {
        startsAt: {
          gte: weekStartUtc,
          lte: weekEndUtc,
        },
        status: {
          in: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
        },
      },
      _count: { _all: true },
    });
    const totalWeekConfirmed =
      weekStatusCounts.find((item) => item.status === AppointmentStatus.CONFIRMED)?._count._all ?? 0;
    const totalWeekCancelled =
      weekStatusCounts.find((item) => item.status === AppointmentStatus.CANCELLED)?._count._all ?? 0;
    const cancellationDenominator = totalWeekConfirmed + totalWeekCancelled;
    const cancellationRate = cancellationDenominator > 0 ? totalWeekCancelled / cancellationDenominator : 0;

    const weekClients = await prisma.appointment.groupBy({
      by: ["clientId"],
      where: {
        status: AppointmentStatus.CONFIRMED,
        startsAt: {
          gte: weekStartUtc,
          lte: weekEndUtc,
          lt: nowUtc,
        },
      },
      _count: { _all: true },
    });
    const clientIds = weekClients.map((item) => item.clientId).filter((value): value is string => Boolean(value));

    let newClientsThisWeek = 0;
    let returningClientsThisWeek = 0;
    if (clientIds.length > 0) {
      const firstAppointments = await prisma.appointment.groupBy({
        by: ["clientId"],
        where: {
          clientId: { in: clientIds },
          status: AppointmentStatus.CONFIRMED,
          startsAt: { lt: nowUtc },
        },
        _min: { startsAt: true },
      });

      for (const item of firstAppointments) {
        const first = item._min.startsAt;
        if (!first) {
          continue;
        }
        if (first >= weekStartUtc && first <= weekEndUtc) {
          newClientsThisWeek += 1;
        } else {
          returningClientsThisWeek += 1;
        }
      }
    }

    const appointmentsForIntervals = await prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.CONFIRMED,
        startsAt: { lt: nowUtc },
      },
      orderBy: [{ clientId: "asc" }, { startsAt: "asc" }],
      select: {
        clientId: true,
        startsAt: true,
      },
    });
    let intervalsTotalDays = 0;
    let intervalsCount = 0;
    let previousByClient = new Map<string, Date>();
    for (const item of appointmentsForIntervals) {
      const clientId = item.clientId;
      if (!clientId) {
        continue;
      }
      const previous = previousByClient.get(clientId);
      if (previous) {
        const diffDays = (item.startsAt.getTime() - previous.getTime()) / 86_400_000;
        if (diffDays >= 0) {
          intervalsTotalDays += diffDays;
          intervalsCount += 1;
        }
      }
      previousByClient.set(clientId, item.startsAt);
    }
    const averageDaysBetweenAppointments = intervalsCount > 0 ? intervalsTotalDays / intervalsCount : 0;

    const confirmedLast7 = await prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.CONFIRMED,
        startsAt: {
          gte: last7StartUtc,
          lt: nowUtc,
        },
      },
      select: {
        startsAt: true,
        totalPrice: true,
      },
      orderBy: {
        startsAt: "asc",
      },
    });
    const revenueByDate = new Map<string, number>();
    for (let index = 6; index >= 0; index -= 1) {
      const key = nowBrussels.minus({ days: index }).toFormat("yyyy-MM-dd");
      revenueByDate.set(key, 0);
    }
    for (const appointment of confirmedLast7) {
      const dateKey = DateTime.fromJSDate(appointment.startsAt, { zone: "utc" })
        .setZone(BRUSSELS_TIMEZONE)
        .toFormat("yyyy-MM-dd");
      revenueByDate.set(dateKey, (revenueByDate.get(dateKey) ?? 0) + (appointment.totalPrice ?? 0));
    }
    const revenuePerDayLast7Days = Array.from(revenueByDate.entries()).map(([date, sum]) => ({
      date,
      sum,
    }));

    const weeklyConfirmed = await prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.CONFIRMED,
        startsAt: {
          gte: weekStartUtc,
          lte: weekEndUtc,
        },
      },
      select: {
        startsAt: true,
      },
    });
    const weeklyPlanningHeatmap = {
      mon: 0,
      tue: 0,
      wed: 0,
      thu: 0,
      fri: 0,
      sat: 0,
      sun: 0,
    };
    for (const item of weeklyConfirmed) {
      const weekday = DateTime.fromJSDate(item.startsAt, { zone: "utc" }).setZone(BRUSSELS_TIMEZONE).weekday;
      if (weekday === 1) weeklyPlanningHeatmap.mon += 1;
      if (weekday === 2) weeklyPlanningHeatmap.tue += 1;
      if (weekday === 3) weeklyPlanningHeatmap.wed += 1;
      if (weekday === 4) weeklyPlanningHeatmap.thu += 1;
      if (weekday === 5) weeklyPlanningHeatmap.fri += 1;
      if (weekday === 6) weeklyPlanningHeatmap.sat += 1;
      if (weekday === 7) weeklyPlanningHeatmap.sun += 1;
    }

    res.json({
      revenue: {
        today: todayRevenue,
        week: weekRevenue,
        month: monthRevenue,
        revenuePerDayLast7Days,
      },
      appointments: {
        totalWeekConfirmed,
        totalWeekCancelled,
        cancellationRate,
      },
      clients: {
        newClientsThisWeek,
        returningClientsThisWeek,
      },
      basket: {
        averageBasket: averageBasketAgg._avg.totalPrice ?? 0,
      },
      timing: {
        averageDaysBetweenAppointments,
      },
      weeklyPlanningHeatmap,
    });
  } catch (error) {
    console.error("[admin.dashboard.advanced]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
