import { AppointmentStatus, AvailabilityMode } from "@prisma/client";
import { DateTime } from "luxon";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  BRUSSELS_TIMEZONE,
  intervalsOverlap,
} from "../lib/time";
import {
  buildInstituteIntervals,
  buildStaffWorkIntervalsByMode,
  StaffCustomWorkingDay,
  StaffScheduleMode,
} from "../lib/availability";
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

    const [settings, instituteRules, timeOffs, appointments] = await Promise.all([
      prisma.practitionerScheduleSettings.findMany({
        where: {
          staffMemberId: { in: staffIds },
        },
        select: {
          staffMemberId: true,
          availabilityMode: true,
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
          deletedAt: null,
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
    const modeByStaff = new Map<string, StaffScheduleMode>(
      staffIds.map((id) => [id, settings.find((setting) => setting.staffMemberId === id)?.availabilityMode ?? AvailabilityMode.WEEKLY])
    );
    const weeklyStaffIds = staffIds.filter((id) => modeByStaff.get(id) !== AvailabilityMode.CUSTOM_DAYS);
    const customStaffIds = staffIds.filter((id) => modeByStaff.get(id) === AvailabilityMode.CUSTOM_DAYS);

    const [weeklyRules, customDays] = await Promise.all([
      weeklyStaffIds.length > 0
        ? prisma.availabilityRule.findMany({
            where: {
              staffMemberId: { in: weeklyStaffIds },
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
          })
        : Promise.resolve([]),
      customStaffIds.length > 0
        ? prisma.practitionerCustomWorkingDay.findMany({
            where: {
              staffMemberId: { in: customStaffIds },
              workingDate: query.date,
            },
            select: {
              staffMemberId: true,
              workingDate: true,
              isClosed: true,
              timeSlots: {
                orderBy: { startTime: "asc" },
                select: {
                  startTime: true,
                  endTime: true,
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);
    const instituteIntervals = buildInstituteIntervals(query.date, dayStartLocal, instituteRules);
    const workIntervalsByStaff = buildStaffWorkIntervalsByMode(
      query.date,
      dayStartLocal,
      instituteIntervals,
      staffIds.map((staffMemberId) => ({
        staffMemberId,
        availabilityMode: modeByStaff.get(staffMemberId) ?? AvailabilityMode.WEEKLY,
        weeklyRules: weeklyRules.filter((rule) => rule.staffMemberId === staffMemberId),
        customWorkingDay:
          customDays.find((day) => day.staffMemberId === staffMemberId) as StaffCustomWorkingDay | null | undefined,
      }))
    );

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
      const blocks = blockedByStaff.get(staff.id) ?? [];
      const staffName = `${staff.firstName} ${staff.lastName}`.trim();
      const workIntervals = workIntervalsByStaff.get(staff.id) ?? [];

      for (const interval of workIntervals) {
        const latestStartMs = interval.endMs - service.durationMin * 60_000;

        for (
          let cursorMs = interval.startMs;
          cursorMs <= latestStartMs;
          cursorMs += STEP_MIN * 60_000
        ) {
          const slotStartUtc = DateTime.fromMillis(cursorMs, { zone: "utc" });
          const slotEndUtc = slotStartUtc.plus({ minutes: service.durationMin });
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
