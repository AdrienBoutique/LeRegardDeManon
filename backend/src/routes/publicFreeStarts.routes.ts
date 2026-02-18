import { AppointmentStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  BRUSSELS_TIMEZONE,
  subtractIntervals,
  TimeInterval,
} from "../lib/time";
import { buildInstituteIntervals, buildStaffWorkIntervals } from "../lib/availability";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";
import { getInstituteSettings } from "../services/settings/instituteSettings";

const STEP_MIN = 15;
const STEP_MS = STEP_MIN * 60_000;

function alignUpToStep(ms: number): number {
  return Math.ceil(ms / STEP_MS) * STEP_MS;
}

const listFreeStartsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffId: z.string().min(1).optional(),
});

const listDayAvailabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffId: z.string().min(1).optional(),
  durationMin: z.coerce.number().int().min(1),
});

const listMonthAvailabilityQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  staffId: z.string().min(1).optional(),
});

type DayStartsItem = {
  startAt: string;
  maxFreeMin: number;
  staffIds: string[];
};

async function listDayStarts(
  date: string,
  staffId?: string
): Promise<{ starts: DayStartsItem[]; staffMissing: boolean }> {
  const dayLocal = DateTime.fromISO(date, { zone: BRUSSELS_TIMEZONE });
  if (!dayLocal.isValid || dayLocal.toFormat("yyyy-MM-dd") !== date) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message: "date must be a valid YYYY-MM-DD",
      },
    ]);
  }

  const dayStartLocal = dayLocal.startOf("day");
  const dayEndLocal = dayStartLocal.plus({ days: 1 });
  const dayStartUtc = dayStartLocal.toUTC().toJSDate();
  const dayEndUtc = dayEndLocal.toUTC().toJSDate();
  const weekday = dayStartLocal.weekday % 7;

  const staffMembers = await prisma.staffMember.findMany({
    where: {
      isActive: true,
      ...(staffId ? { id: staffId } : {}),
    },
    select: {
      id: true,
    },
  });

  if (staffId && staffMembers.length === 0) {
    return { starts: [], staffMissing: true };
  }

  const staffIds = staffMembers.map((staff) => staff.id);
  if (staffIds.length === 0) {
    return { starts: [], staffMissing: false };
  }

  const [availabilityRules, instituteRules, timeOffs, appointments] = await Promise.all([
    prisma.availabilityRule.findMany({
      where: {
        staffMemberId: { in: staffIds },
        dayOfWeek: weekday,
        isActive: true,
      },
      select: {
        staffMemberId: true,
        startTime: true,
        endTime: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    }),
    prisma.instituteAvailabilityRule.findMany({
      where: {
        dayOfWeek: weekday,
        isActive: true,
      },
      select: {
        startTime: true,
        endTime: true,
      },
    }),
    prisma.timeOff.findMany({
      where: {
        staffMemberId: { in: staffIds },
        startsAt: { lt: dayEndUtc },
        endsAt: { gt: dayStartUtc },
      },
      select: {
        staffMemberId: true,
        startsAt: true,
        endsAt: true,
      },
    }),
    prisma.appointment.findMany({
      where: {
        staffMemberId: { in: staffIds },
        startsAt: { lt: dayEndUtc },
        endsAt: { gt: dayStartUtc },
        status: { not: AppointmentStatus.CANCELLED },
      },
      select: {
        staffMemberId: true,
        startsAt: true,
        endsAt: true,
      },
    }),
  ]);

  const instituteIntervals = buildInstituteIntervals(date, dayStartLocal, instituteRules);
  const workIntervalsByStaff = buildStaffWorkIntervals(
    date,
    dayStartLocal,
    availabilityRules,
    instituteIntervals
  );
  const blockedIntervalsByStaff = new Map<string, TimeInterval[]>();

  for (const timeOff of timeOffs) {
    const intervals = blockedIntervalsByStaff.get(timeOff.staffMemberId) ?? [];
    intervals.push({
      startMs: timeOff.startsAt.getTime(),
      endMs: timeOff.endsAt.getTime(),
    });
    blockedIntervalsByStaff.set(timeOff.staffMemberId, intervals);
  }

  for (const appointment of appointments) {
    const intervals = blockedIntervalsByStaff.get(appointment.staffMemberId) ?? [];
    intervals.push({
      startMs: appointment.startsAt.getTime(),
      endMs: appointment.endsAt.getTime(),
    });
    blockedIntervalsByStaff.set(appointment.staffMemberId, intervals);
  }

  const startsMap = new Map<
    string,
    {
      startAt: string;
      startMs: number;
      maxFreeMin: number;
      staffIds: Set<string>;
    }
  >();

  for (const staffMemberId of staffIds) {
    const workIntervals = workIntervalsByStaff.get(staffMemberId) ?? [];
    const blockedIntervals = blockedIntervalsByStaff.get(staffMemberId) ?? [];
    const freeIntervals = subtractIntervals(workIntervals, blockedIntervals);

    for (const freeInterval of freeIntervals) {
      for (
        let cursorMs = alignUpToStep(freeInterval.startMs);
        cursorMs < freeInterval.endMs;
        cursorMs += STEP_MS
      ) {
        const maxFreeMin = Math.floor((freeInterval.endMs - cursorMs) / 60_000);
        if (maxFreeMin <= 0) {
          continue;
        }

        const startAt =
          DateTime.fromMillis(cursorMs, { zone: BRUSSELS_TIMEZONE }).toISO({
            suppressMilliseconds: true,
          }) ?? new Date(cursorMs).toISOString();

        const existing = startsMap.get(startAt);
        if (existing) {
          existing.staffIds.add(staffMemberId);
          existing.maxFreeMin = Math.max(existing.maxFreeMin, maxFreeMin);
          continue;
        }

        startsMap.set(startAt, {
          startAt,
          startMs: cursorMs,
          maxFreeMin,
          staffIds: new Set([staffMemberId]),
        });
      }
    }
  }

  const starts = Array.from(startsMap.values())
    .sort((a, b) => a.startMs - b.startMs)
    .map((start) => ({
      startAt: start.startAt,
      maxFreeMin: start.maxFreeMin,
      staffIds: Array.from(start.staffIds).sort((a, b) => a.localeCompare(b)),
    }));

  return { starts, staffMissing: false };
}

export const publicFreeStartsRouter = Router();

publicFreeStartsRouter.get("/free-starts", async (req, res) => {
  try {
    const query = parseOrThrow(listFreeStartsQuerySchema, req.query);
    const { starts, staffMissing } = await listDayStarts(query.date, query.staffId);

    if (staffMissing) {
      res.status(404).json({ error: "Staff not found" });
      return;
    }

    res.json({
      date: query.date,
      stepMin: STEP_MIN,
      starts,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[publicFreeStarts.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

publicFreeStartsRouter.get("/public/availability/day", async (req, res) => {
  try {
    const query = parseOrThrow(listDayAvailabilityQuerySchema, req.query);
    const { starts, staffMissing } = await listDayStarts(query.date, query.staffId);

    if (staffMissing) {
      res.status(404).json({ error: "Staff not found" });
      return;
    }

    const compatibleStarts = starts
      .filter((start) => start.maxFreeMin >= query.durationMin)
      .map((start) => {
        const endAt =
          DateTime.fromISO(start.startAt, { zone: BRUSSELS_TIMEZONE })
            .plus({ minutes: query.durationMin })
            .toUTC()
            .toISO({ suppressMilliseconds: true }) ?? start.startAt;

        return {
          startAt: start.startAt,
          endAt,
          durationMin: query.durationMin,
          maxFreeMin: start.maxFreeMin,
          staffIds: start.staffIds,
        };
      });

    res.json({
      date: query.date,
      durationMin: query.durationMin,
      stepMin: STEP_MIN,
      slots: compatibleStarts,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[publicAvailabilityDay.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

publicFreeStartsRouter.get("/public/availability/month", async (req, res) => {
  try {
    const query = parseOrThrow(listMonthAvailabilityQuerySchema, req.query);
    const monthStart = DateTime.fromFormat(query.month, "yyyy-MM", { zone: BRUSSELS_TIMEZONE }).startOf("month");
    const todayLocal = DateTime.now().setZone(BRUSSELS_TIMEZONE).startOf("day");

    if (!monthStart.isValid) {
      res.status(400).json({ error: "month must be a valid YYYY-MM" });
      return;
    }

    const monthEnd = monthStart.endOf("month");
    const dayMeta: Record<string, { level: "none" | "low" | "mid" | "high" }> = {};
    const settings = await getInstituteSettings();

    for (let cursor = monthStart; cursor <= monthEnd; cursor = cursor.plus({ days: 1 })) {
      const date = cursor.toFormat("yyyy-MM-dd");

      if (cursor < todayLocal) {
        dayMeta[date] = { level: "none" };
        continue;
      }

      const { starts, staffMissing } = await listDayStarts(date, query.staffId);

      if (staffMissing) {
        res.status(404).json({ error: "Staff not found" });
        return;
      }

      if (starts.length === 0) {
        dayMeta[date] = { level: "none" };
        continue;
      }

      const maxFreeMin = starts.reduce((max, start) => Math.max(max, start.maxFreeMin), 0);
      const startsCount = starts.length;

      if (maxFreeMin >= 360 || startsCount >= 24) {
        dayMeta[date] = { level: "high" };
        continue;
      }

      if (maxFreeMin >= 120 || startsCount >= 8) {
        dayMeta[date] = { level: "mid" };
        continue;
      }

      dayMeta[date] = { level: "low" };
    }

    res.json({
      month: query.month,
      staffId: query.staffId ?? null,
      dayMeta,
      showAvailabilityDots: settings.showAvailabilityDots,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[publicAvailabilityMonth.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
