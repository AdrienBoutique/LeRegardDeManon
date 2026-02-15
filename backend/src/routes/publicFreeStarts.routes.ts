import { AppointmentStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  BRUSSELS_TIMEZONE,
  buildDateTimeForDay,
  subtractIntervals,
  TimeInterval,
} from "../lib/time";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

const STEP_MIN = 15;
const STEP_MS = STEP_MIN * 60_000;

const listFreeStartsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffId: z.string().min(1).optional(),
});

const listDayAvailabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffId: z.string().min(1).optional(),
  durationMin: z.coerce.number().int().min(1),
});

type DayStartsItem = {
  startAt: string;
  maxFreeMin: number;
  staffIds: string[];
};

function buildWorkIntervals(
  dateIso: string,
  dayStartLocal: DateTime,
  rules: Array<{
    staffMemberId: string;
    startTime: string;
    endTime: string;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
  }>
): Map<string, TimeInterval[]> {
  const workIntervalsByStaff = new Map<string, TimeInterval[]>();

  for (const rule of rules) {
    const effectiveFrom = rule.effectiveFrom
      ? DateTime.fromJSDate(rule.effectiveFrom, { zone: BRUSSELS_TIMEZONE }).startOf("day")
      : null;
    const effectiveTo = rule.effectiveTo
      ? DateTime.fromJSDate(rule.effectiveTo, { zone: BRUSSELS_TIMEZONE }).endOf("day")
      : null;

    const isApplicable =
      (!effectiveFrom || dayStartLocal >= effectiveFrom) &&
      (!effectiveTo || dayStartLocal <= effectiveTo);

    if (!isApplicable) {
      continue;
    }

    const start = buildDateTimeForDay(dateIso, rule.startTime);
    const end = buildDateTimeForDay(dateIso, rule.endTime);

    if (end <= start) {
      continue;
    }

    const intervals = workIntervalsByStaff.get(rule.staffMemberId) ?? [];
    intervals.push({ startMs: start.toUTC().toMillis(), endMs: end.toUTC().toMillis() });
    workIntervalsByStaff.set(rule.staffMemberId, intervals);
  }

  return workIntervalsByStaff;
}

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

  const [availabilityRules, timeOffs, appointments] = await Promise.all([
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

  const workIntervalsByStaff = buildWorkIntervals(date, dayStartLocal, availabilityRules);
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
      for (let cursorMs = freeInterval.startMs; cursorMs < freeInterval.endMs; cursorMs += STEP_MS) {
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
