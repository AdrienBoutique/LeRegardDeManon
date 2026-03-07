import { AppointmentStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { BRUSSELS_TIMEZONE } from "../lib/time";
import { authAdmin } from "../middlewares/authAdmin";

export const adminDashboardRouter = Router();

adminDashboardRouter.use(authAdmin);
const advancedQuerySchema = z.object({
  period: z.enum(["week", "month"]).optional(),
});

async function sumRevenueForRange(startUtc: Date, endUtc: Date, nowUtc: Date): Promise<number> {
  const revenueAgg = await prisma.appointment.aggregate({
    where: {
      deletedAt: null,
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
    const monthStartUtc = nowBrussels.startOf("month").toUTC().toJSDate();
    const monthEndUtc = nowBrussels.endOf("month").toUTC().toJSDate();
    const nowUtc = nowBrussels.toUTC().toJSDate();

    const [
      pendingCount,
      todayCount,
      nextAppointmentRaw,
      weekAppointments,
      todayRevenue,
      weekRevenue,
      monthRevenue,
    ] = await Promise.all([
      prisma.appointment.count({
        where: {
          deletedAt: null,
          status: AppointmentStatus.PENDING,
        },
      }),
      prisma.appointment.count({
        where: {
          deletedAt: null,
          status: AppointmentStatus.CONFIRMED,
          startsAt: {
            gte: dayStartUtc,
            lte: dayEndUtc,
          },
        },
      }),
      prisma.appointment.findFirst({
        where: {
          deletedAt: null,
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
          deletedAt: null,
          status: AppointmentStatus.CONFIRMED,
          startsAt: {
            gte: weekStartUtc,
            lte: weekEndUtc,
          },
        },
      }),
      sumRevenueForRange(dayStartUtc, dayEndUtc, nowUtc),
      sumRevenueForRange(weekStartUtc, weekEndUtc, nowUtc),
      sumRevenueForRange(monthStartUtc, monthEndUtc, nowUtc),
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
        month: monthRevenue,
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

adminDashboardRouter.get("/dashboard/advanced", async (req, res) => {
  try {
    const query = advancedQuerySchema.parse(req.query ?? {});
    const period = query.period ?? "week";
    const nowBrussels = DateTime.now().setZone(BRUSSELS_TIMEZONE);
    const nowUtc = nowBrussels.toUTC().toJSDate();

    const dayStart = nowBrussels.startOf("day");
    const dayEnd = nowBrussels.endOf("day");
    const weekStart = nowBrussels.startOf("week");
    const weekEnd = nowBrussels.endOf("week");
    const monthStart = nowBrussels.startOf("month");
    const monthEnd = nowBrussels.endOf("month");
    const periodStart = period === "month" ? monthStart : weekStart;
    const periodEnd = period === "month" ? monthEnd : weekEnd;

    const dayStartUtc = dayStart.toUTC().toJSDate();
    const dayEndUtc = dayEnd.toUTC().toJSDate();
    const weekStartUtc = weekStart.toUTC().toJSDate();
    const weekEndUtc = weekEnd.toUTC().toJSDate();
    const monthStartUtc = monthStart.toUTC().toJSDate();
    const monthEndUtc = monthEnd.toUTC().toJSDate();
    const periodStartUtc = periodStart.toUTC().toJSDate();
    const periodEndUtc = periodEnd.toUTC().toJSDate();
    const last7StartUtc = nowBrussels.minus({ days: 6 }).startOf("day").toUTC().toJSDate();

    const [todayRevenue, weekRevenue, monthRevenue, periodRevenue, averageBasketAgg] = await Promise.all([
      sumRevenueForRange(dayStartUtc, dayEndUtc, nowUtc),
      sumRevenueForRange(weekStartUtc, weekEndUtc, nowUtc),
      sumRevenueForRange(monthStartUtc, monthEndUtc, nowUtc),
      sumRevenueForRange(periodStartUtc, periodEndUtc, nowUtc),
      prisma.appointment.aggregate({
        where: {
          deletedAt: null,
          status: AppointmentStatus.CONFIRMED,
          startsAt: { lt: nowUtc },
        },
        _avg: {
          totalPrice: true,
        },
      }),
    ]);

    const periodStatusCounts = await prisma.appointment.groupBy({
      by: ["status"],
      where: {
        deletedAt: null,
        startsAt: {
          gte: periodStartUtc,
          lte: periodEndUtc,
        },
        status: {
          in: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
        },
      },
      _count: { _all: true },
    });
    const totalPeriodConfirmed =
      periodStatusCounts.find((item) => item.status === AppointmentStatus.CONFIRMED)?._count._all ?? 0;
    const totalPeriodCancelled =
      periodStatusCounts.find((item) => item.status === AppointmentStatus.CANCELLED)?._count._all ?? 0;
    const cancellationDenominator = totalPeriodConfirmed + totalPeriodCancelled;
    const cancellationRate = cancellationDenominator > 0 ? totalPeriodCancelled / cancellationDenominator : 0;

    const periodClients = await prisma.appointment.groupBy({
      by: ["clientId"],
      where: {
        deletedAt: null,
        status: AppointmentStatus.CONFIRMED,
        startsAt: {
          gte: periodStartUtc,
          lte: periodEndUtc,
          lt: nowUtc,
        },
      },
      _count: { _all: true },
    });
    const clientIds = periodClients.map((item) => item.clientId).filter((value): value is string => Boolean(value));

    let newClientsThisWeek = 0;
    let returningClientsThisWeek = 0;
    if (clientIds.length > 0) {
      const firstAppointments = await prisma.appointment.groupBy({
        by: ["clientId"],
        where: {
          deletedAt: null,
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
        if (first >= periodStartUtc && first <= periodEndUtc) {
          newClientsThisWeek += 1;
        } else {
          returningClientsThisWeek += 1;
        }
      }
    }

    const appointmentsForIntervals = await prisma.appointment.findMany({
      where: {
        deletedAt: null,
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
        deletedAt: null,
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

    const periodConfirmed = await prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.CONFIRMED,
        startsAt: {
          gte: periodStartUtc,
          lte: periodEndUtc,
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
    for (const item of periodConfirmed) {
      const weekday = DateTime.fromJSDate(item.startsAt, { zone: "utc" }).setZone(BRUSSELS_TIMEZONE).weekday;
      if (weekday === 1) weeklyPlanningHeatmap.mon += 1;
      if (weekday === 2) weeklyPlanningHeatmap.tue += 1;
      if (weekday === 3) weeklyPlanningHeatmap.wed += 1;
      if (weekday === 4) weeklyPlanningHeatmap.thu += 1;
      if (weekday === 5) weeklyPlanningHeatmap.fri += 1;
      if (weekday === 6) weeklyPlanningHeatmap.sat += 1;
      if (weekday === 7) weeklyPlanningHeatmap.sun += 1;
    }

    const periodRows = await prisma.appointment.findMany({
      where: {
        deletedAt: null,
        startsAt: {
          gte: periodStartUtc,
          lte: periodEndUtc,
          lt: nowUtc,
        },
        status: {
          in: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
        },
      },
      select: {
        startsAt: true,
        status: true,
        totalPrice: true,
      },
      orderBy: {
        startsAt: "asc",
      },
    });

    const trendDates: string[] = [];
    let cursor = periodStart.startOf("day");
    const trendEnd = (period === "month" ? nowBrussels : periodEnd).startOf("day");
    while (cursor <= trendEnd) {
      trendDates.push(cursor.toFormat("yyyy-MM-dd"));
      cursor = cursor.plus({ days: 1 });
    }

    const revenueByTrendDate = new Map<string, number>();
    const confirmedByTrendDate = new Map<string, number>();
    const cancelledByTrendDate = new Map<string, number>();
    for (const date of trendDates) {
      revenueByTrendDate.set(date, 0);
      confirmedByTrendDate.set(date, 0);
      cancelledByTrendDate.set(date, 0);
    }

    for (const row of periodRows) {
      const dateKey = DateTime.fromJSDate(row.startsAt, { zone: "utc" })
        .setZone(BRUSSELS_TIMEZONE)
        .toFormat("yyyy-MM-dd");
      if (!revenueByTrendDate.has(dateKey)) {
        continue;
      }

      if (row.status === AppointmentStatus.CONFIRMED) {
        revenueByTrendDate.set(dateKey, (revenueByTrendDate.get(dateKey) ?? 0) + (row.totalPrice ?? 0));
        confirmedByTrendDate.set(dateKey, (confirmedByTrendDate.get(dateKey) ?? 0) + 1);
      } else if (row.status === AppointmentStatus.CANCELLED) {
        cancelledByTrendDate.set(dateKey, (cancelledByTrendDate.get(dateKey) ?? 0) + 1);
      }
    }

    const revenuePerPeriod = trendDates.map((date) => ({
      date,
      sum: revenueByTrendDate.get(date) ?? 0,
    }));

    res.json({
      period,
      revenue: {
        today: todayRevenue,
        week: weekRevenue,
        month: monthRevenue,
        period: periodRevenue,
        revenuePerDayLast7Days,
        revenuePerPeriod,
      },
      appointments: {
        totalWeekConfirmed: totalPeriodConfirmed,
        totalWeekCancelled: totalPeriodCancelled,
        totalPeriodConfirmed,
        totalPeriodCancelled,
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
      trend: {
        labels: trendDates,
        revenue: trendDates.map((date) => revenueByTrendDate.get(date) ?? 0),
        confirmed: trendDates.map((date) => confirmedByTrendDate.get(date) ?? 0),
        cancelled: trendDates.map((date) => cancelledByTrendDate.get(date) ?? 0),
      },
      weeklyPlanningHeatmap,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid analytics query" });
      return;
    }
    console.error("[admin.dashboard.advanced]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
