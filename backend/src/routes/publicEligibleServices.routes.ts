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

const querySchema = z.object({
  startAt: z.string().datetime({ offset: true }),
  staffId: z.string().min(1).optional(),
});

type ServiceStaffLink = {
  staffMemberId: string;
  priceCentsOverride: number | null;
  discountPercentOverride: number | null;
};

function computeEffectivePrice(
  basePriceCents: number,
  priceCentsOverride: number | null,
  discountPercentOverride: number | null
): number {
  if (priceCentsOverride !== null) {
    return priceCentsOverride;
  }

  if (discountPercentOverride !== null) {
    return Math.max(0, Math.round(basePriceCents * (1 - discountPercentOverride / 100)));
  }

  return basePriceCents;
}

export const publicEligibleServicesRouter = Router();

publicEligibleServicesRouter.get("/eligible-services", async (req, res) => {
  try {
    const query = parseOrThrow(querySchema, req.query);

    const startAtRaw = DateTime.fromISO(query.startAt, { setZone: true });
    if (!startAtRaw.isValid) {
      res.status(400).json({ error: "startAt must be a valid ISO datetime" });
      return;
    }

    const startAtLocal = startAtRaw.setZone(BRUSSELS_TIMEZONE);
    const dayStartLocal = startAtLocal.startOf("day");
    const dayEndLocal = dayStartLocal.plus({ days: 1 });
    const weekday = dayStartLocal.weekday % 7;

    const dayStartUtc = dayStartLocal.toUTC().toJSDate();
    const dayEndUtc = dayEndLocal.toUTC().toJSDate();

    const staffMembers = await prisma.staffMember.findMany({
      where: {
        isActive: true,
        ...(query.staffId ? { id: query.staffId } : {}),
      },
      select: { id: true },
    });

    if (query.staffId && staffMembers.length === 0) {
      res.status(404).json({ error: "Staff not found" });
      return;
    }

    const staffIds = staffMembers.map((staff) => staff.id);

    const [availabilityRules, instituteRules, timeOffs, appointments, activeServices] = await Promise.all([
      staffIds.length > 0
        ? prisma.availabilityRule.findMany({
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
          })
        : Promise.resolve([]),
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
      staffIds.length > 0
        ? prisma.timeOff.findMany({
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
          })
        : Promise.resolve([]),
      staffIds.length > 0
        ? prisma.appointment.findMany({
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
          })
        : Promise.resolve([]),
      prisma.service.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          categoryId: true,
          category: {
            select: {
              name: true,
            },
          },
          durationMin: true,
          priceCents: true,
          serviceLinks: {
            where: {
              staffMember: {
                isActive: true,
                ...(query.staffId ? { id: query.staffId } : {}),
              },
            },
            select: {
              staffMemberId: true,
              priceCentsOverride: true,
              discountPercentOverride: true,
            },
          },
        },
      }),
    ]);
    const dateIso = dayStartLocal.toFormat("yyyy-MM-dd");
    const instituteIntervals = buildInstituteIntervals(dateIso, dayStartLocal, instituteRules);
    const workIntervalsByStaff = buildStaffWorkIntervals(
      dateIso,
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

    const startAtMs = startAtLocal.toUTC().toMillis();
    const maxFreeByStaff = new Map<string, number>();

    for (const staffId of staffIds) {
      const freeIntervals = subtractIntervals(
        workIntervalsByStaff.get(staffId) ?? [],
        blockedIntervalsByStaff.get(staffId) ?? []
      );

      const containingInterval = freeIntervals.find(
        (interval) => startAtMs >= interval.startMs && startAtMs < interval.endMs
      );

      const maxFreeMin = containingInterval
        ? Math.floor((containingInterval.endMs - startAtMs) / 60_000)
        : 0;

      maxFreeByStaff.set(staffId, Math.max(0, maxFreeMin));
    }

    const globalMaxFreeMin =
      staffIds.length > 0
        ? Math.max(...staffIds.map((staffId) => maxFreeByStaff.get(staffId) ?? 0))
        : 0;

    const services = activeServices.map((service) => {
      const links = service.serviceLinks as ServiceStaffLink[];

      if (query.staffId) {
        const link = links[0];
        const canPerform = Boolean(link);
        const maxFreeMin = canPerform ? maxFreeByStaff.get(query.staffId) ?? 0 : 0;
        const eligible = canPerform && service.durationMin <= maxFreeMin;

        return {
          id: service.id,
          name: service.name,
          categoryId: service.categoryId,
          categoryName: service.category?.name ?? null,
          durationMin: service.durationMin,
          basePriceCents: service.priceCents,
          effectivePriceCents: computeEffectivePrice(
            service.priceCents,
            link?.priceCentsOverride ?? null,
            link?.discountPercentOverride ?? null
          ),
          eligible,
          reason: canPerform
            ? eligible
              ? undefined
              : "Pas assez de temps"
            : "Praticienne non habilitee",
          bestStaffId: canPerform ? query.staffId : null,
        };
      }

      const staffCandidates = links.map((link) => {
        const maxFreeMin = maxFreeByStaff.get(link.staffMemberId) ?? 0;
        return {
          staffId: link.staffMemberId,
          maxFreeMin,
          effectivePriceCents: computeEffectivePrice(
            service.priceCents,
            link.priceCentsOverride,
            link.discountPercentOverride
          ),
          eligible: service.durationMin <= maxFreeMin,
        };
      });

      const eligibleCandidates = staffCandidates.filter((candidate) => candidate.eligible);

      if (eligibleCandidates.length > 0) {
        const bestCandidate = eligibleCandidates.sort((a, b) => {
          if (a.effectivePriceCents !== b.effectivePriceCents) {
            return a.effectivePriceCents - b.effectivePriceCents;
          }

          if (a.maxFreeMin !== b.maxFreeMin) {
            return b.maxFreeMin - a.maxFreeMin;
          }

          return a.staffId.localeCompare(b.staffId);
        })[0];

        return {
          id: service.id,
          name: service.name,
          categoryId: service.categoryId,
          categoryName: service.category?.name ?? null,
          durationMin: service.durationMin,
          basePriceCents: service.priceCents,
          effectivePriceCents: bestCandidate.effectivePriceCents,
          eligible: true,
          reason: undefined,
          bestStaffId: bestCandidate.staffId,
        };
      }

      if (staffCandidates.length > 0) {
        const cheapest = staffCandidates.sort((a, b) => {
          if (a.effectivePriceCents !== b.effectivePriceCents) {
            return a.effectivePriceCents - b.effectivePriceCents;
          }

          return a.staffId.localeCompare(b.staffId);
        })[0];

        return {
          id: service.id,
          name: service.name,
          durationMin: service.durationMin,
          basePriceCents: service.priceCents,
          effectivePriceCents: cheapest.effectivePriceCents,
          eligible: false,
          reason: "Pas assez de temps",
          bestStaffId: null,
        };
      }

      return {
        id: service.id,
        name: service.name,
        categoryId: service.categoryId,
        categoryName: service.category?.name ?? null,
        durationMin: service.durationMin,
        basePriceCents: service.priceCents,
        effectivePriceCents: service.priceCents,
        eligible: false,
        reason: "Aucune praticienne disponible",
        bestStaffId: null,
      };
    });

    res.json({
      startAt:
        startAtLocal.toISO({ suppressMilliseconds: true }) ??
        startAtLocal.toUTC().toJSDate().toISOString(),
      maxFreeMin: query.staffId ? maxFreeByStaff.get(query.staffId) ?? 0 : globalMaxFreeMin,
      services,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[publicEligibleServices.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
