import { AppointmentStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  BRUSSELS_TIMEZONE,
  buildDateTimeForDay,
  intervalsOverlap,
} from "../lib/time";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

const STEP_MIN = 15;

const listSlotsQuerySchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type BlockInterval = {
  startMs: number;
  endMs: number;
};

export const publicSlotsRouter = Router();

publicSlotsRouter.get("/slots", async (req, res) => {
  try {
    const query = parseOrThrow(listSlotsQuerySchema, req.query);

    const dayLocal = DateTime.fromISO(query.date, { zone: BRUSSELS_TIMEZONE });
    if (!dayLocal.isValid || dayLocal.toFormat("yyyy-MM-dd") !== query.date) {
      res.status(400).json({ error: "date must be a valid YYYY-MM-DD" });
      return;
    }

    const dayStartLocal = dayLocal.startOf("day");
    const dayEndLocal = dayStartLocal.plus({ days: 1 });
    const dayStartUtc = dayStartLocal.toUTC().toJSDate();
    const dayEndUtc = dayEndLocal.toUTC().toJSDate();
    const weekday = dayStartLocal.weekday % 7;

    const service = await prisma.service.findFirst({
      where: { id: query.serviceId, isActive: true },
      select: {
        id: true,
        durationMin: true,
        serviceLinks: {
          where: {
            staffMember: {
              isActive: true,
            },
          },
          select: {
            staffMember: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!service) {
      res.status(404).json({ error: "Service not found" });
      return;
    }

    const staffMembers = service.serviceLinks.map((link) => link.staffMember);
    const staffIds = staffMembers.map((staff) => staff.id);

    if (staffIds.length === 0) {
      res.json({
        date: query.date,
        serviceId: service.id,
        durationMin: service.durationMin,
        stepMin: STEP_MIN,
        slots: [],
      });
      return;
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

    const rulesByStaff = new Map<string, typeof availabilityRules>();

    for (const rule of availabilityRules) {
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

      const staffRules = rulesByStaff.get(rule.staffMemberId) ?? [];
      staffRules.push(rule);
      rulesByStaff.set(rule.staffMemberId, staffRules);
    }

    const blockedByStaff = new Map<string, BlockInterval[]>();

    for (const timeOff of timeOffs) {
      const blocks = blockedByStaff.get(timeOff.staffMemberId) ?? [];
      blocks.push({
        startMs: timeOff.startsAt.getTime(),
        endMs: timeOff.endsAt.getTime(),
      });
      blockedByStaff.set(timeOff.staffMemberId, blocks);
    }

    for (const appointment of appointments) {
      const blocks = blockedByStaff.get(appointment.staffMemberId) ?? [];
      blocks.push({
        startMs: appointment.startsAt.getTime(),
        endMs: appointment.endsAt.getTime(),
      });
      blockedByStaff.set(appointment.staffMemberId, blocks);
    }

    const slots: Array<{
      startAt: string;
      endAt: string;
      staffId: string;
      staffName: string;
    }> = [];
    const dedupe = new Set<string>();

    for (const staff of staffMembers) {
      const staffRules = rulesByStaff.get(staff.id) ?? [];
      const blocks = blockedByStaff.get(staff.id) ?? [];
      const staffName = `${staff.firstName} ${staff.lastName}`.trim();

      for (const rule of staffRules) {
        const workStart = buildDateTimeForDay(query.date, rule.startTime);
        const workEnd = buildDateTimeForDay(query.date, rule.endTime);

        if (workEnd <= workStart) {
          continue;
        }

        const latestStart = workEnd.minus({ minutes: service.durationMin });

        for (
          let cursor = workStart;
          cursor <= latestStart;
          cursor = cursor.plus({ minutes: STEP_MIN })
        ) {
          const slotStartUtc = cursor.toUTC();
          const slotEndUtc = cursor.plus({ minutes: service.durationMin }).toUTC();
          const slotStartMs = slotStartUtc.toMillis();
          const slotEndMs = slotEndUtc.toMillis();

          const hasConflict = blocks.some((block) =>
            intervalsOverlap(slotStartMs, slotEndMs, block.startMs, block.endMs)
          );

          if (hasConflict) {
            continue;
          }

          const key = `${staff.id}|${slotStartUtc.toISO()}`;
          if (dedupe.has(key)) {
            continue;
          }

          dedupe.add(key);

          slots.push({
            startAt: slotStartUtc.toISO() ?? new Date(slotStartMs).toISOString(),
            endAt: slotEndUtc.toISO() ?? new Date(slotEndMs).toISOString(),
            staffId: staff.id,
            staffName,
          });
        }
      }
    }

    slots.sort((a, b) => {
      if (a.startAt === b.startAt) {
        return a.staffName.localeCompare(b.staffName);
      }

      return a.startAt.localeCompare(b.startAt);
    });

    res.json({
      date: query.date,
      serviceId: service.id,
      durationMin: service.durationMin,
      stepMin: STEP_MIN,
      slots,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[publicSlots.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
