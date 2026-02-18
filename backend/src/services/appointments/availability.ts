import { AppointmentStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { buildInstituteIntervals, buildStaffWorkIntervals } from "../../lib/availability";
import { prisma } from "../../lib/prisma";
import { BRUSSELS_TIMEZONE, subtractIntervals } from "../../lib/time";

type SlotAvailabilityInput = {
  practitionerId: string;
  startAtUtc: Date;
  durationMin: number;
  excludeAppointmentId?: string;
};

export async function isSlotAvailable(input: SlotAvailabilityInput): Promise<boolean> {
  const startUtc = DateTime.fromJSDate(input.startAtUtc, { zone: "utc" });
  const endUtc = startUtc.plus({ minutes: input.durationMin });
  if (input.durationMin <= 0 || !startUtc.isValid || !endUtc.isValid || endUtc <= startUtc) {
    return false;
  }

  const dayStartLocal = startUtc.setZone(BRUSSELS_TIMEZONE).startOf("day");
  const dayEndLocal = dayStartLocal.plus({ days: 1 });
  const weekday = dayStartLocal.weekday % 7;
  const dateIso = dayStartLocal.toFormat("yyyy-MM-dd");
  const dayStartUtc = dayStartLocal.toUTC().toJSDate();
  const dayEndUtc = dayEndLocal.toUTC().toJSDate();
  const startMs = startUtc.toMillis();
  const endMs = endUtc.toMillis();

  const [rules, instituteRules, timeOffs, appointments] = await Promise.all([
    prisma.availabilityRule.findMany({
      where: {
        staffMemberId: input.practitionerId,
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
        staffMemberId: input.practitionerId,
        startsAt: { lt: dayEndUtc },
        endsAt: { gt: dayStartUtc },
      },
      select: {
        startsAt: true,
        endsAt: true,
      },
    }),
    prisma.appointment.findMany({
      where: {
        staffMemberId: input.practitionerId,
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        startsAt: { lt: dayEndUtc },
        endsAt: { gt: dayStartUtc },
        ...(input.excludeAppointmentId ? { id: { not: input.excludeAppointmentId } } : {}),
      },
      select: {
        startsAt: true,
        endsAt: true,
      },
    }),
  ]);

  const instituteIntervals = buildInstituteIntervals(dateIso, dayStartLocal, instituteRules);
  const workByStaff = buildStaffWorkIntervals(dateIso, dayStartLocal, rules, instituteIntervals);
  const workIntervals = workByStaff.get(input.practitionerId) ?? [];
  if (workIntervals.length === 0) {
    return false;
  }

  const blocked = [
    ...timeOffs.map((item) => ({ startMs: item.startsAt.getTime(), endMs: item.endsAt.getTime() })),
    ...appointments.map((item) => ({ startMs: item.startsAt.getTime(), endMs: item.endsAt.getTime() })),
  ];

  const free = subtractIntervals(workIntervals, blocked);
  return free.some((interval) => startMs >= interval.startMs && endMs <= interval.endMs);
}
